const fs = require("fs");
const path = require("path");
const https = require("https");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const API_KEY = process.env.UNSPLASH_ACCESS_KEY;
if (!API_KEY) {
  console.error("UNSPLASH_ACCESS_KEY not found in .env");
  process.exit(1);
}

const REGIONS = {
  brest: ["Brest Belarus", "Brest fortress Belarus", "Brest city"],
  vitebsk: ["Vitebsk Belarus", "Vitebsk city architecture"],
  gomel: ["Gomel Belarus city"],
  grodno: ["Grodno Belarus", "Grodno castle architecture"],
  minsk: ["Minsk Belarus city"],
  mogilev: ["Mogilev Belarus city"],
};

const PLACES = {
  "belovezhskaya": ["Belovezhskaya Pushcha", "Bialowieza Forest Belarus"],
  "mir-castle": ["Mir Castle Belarus"],
  "nesvizh-castle": ["Nesvizh Castle Belarus", "Radziwill castle Nesvizh"],
  "braslav-lakes": ["Braslav lakes Belarus"],
  "dudutki": ["Dudutki museum Belarus"],
  "khatyn": ["Khatyn memorial Belarus"],
  "augustow-canal": ["Augustow canal Belarus"],
  "narochansky": ["Naroch lake Belarus"],
  "pripyatsky": ["Pripyat national park Belarus", "Polesie Belarus nature"],
  "struve-arc": ["Struve geodetic arc Belarus"],
  "brest-fortress": ["Brest fortress memorial", "Brest fortress hero"],
  "sophia-cathedral": ["Sophia cathedral Polotsk Belarus"],
  "baranovichi": ["Baranovichi Belarus city"],
  "pinsk": ["Pinsk Belarus", "Pinsk Polesie"],
  "kobrin": ["Kobrin Belarus"],
  "orsha": ["Orsha Belarus city"],
  "polotsk": ["Polotsk Belarus", "Polotsk ancient city"],
  "mozyr": ["Mozyr Belarus", "Mozyr hills"],
  "lida": ["Lida castle Belarus"],
  "slonim": ["Slonim Belarus"],
  "novogrudok": ["Novogrudok Belarus castle"],
  "borisov": ["Borisov Belarus Berezina"],
  "soligorsk": ["Soligorsk Belarus salt mine"],
  "slutsk": ["Slutsk Belarus belt"],
  "bobruysk": ["Bobruysk Belarus fortress"],
  "mogilev-city": ["Mogilev Belarus city hall"],
};

const PHOTOS_DIR = path.join(__dirname, "..", "src", "photos");
const INDEX_PATH = path.join(__dirname, "..", "src", "data", "photos.json");
const PER_PAGE_1 = 30;
const PER_PAGE_2 = 10;

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { "Accept-Version": "v1" } }, (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => {
        if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}: ${body.slice(0, 200)}`));
        resolve(JSON.parse(body));
      });
      res.on("error", reject);
    }).on("error", reject);
  });
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        file.close();
        fs.unlinkSync(dest);
        return downloadFile(res.headers.location, dest).then(resolve, reject);
      }
      res.pipe(file);
      file.on("finish", () => file.close(resolve));
      file.on("error", reject);
    }).on("error", (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
}

async function searchPhotos(query) {
  const base =
    `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}` +
    `&orientation=landscape&content_filter=high&client_id=${API_KEY}`;

  console.log(`  Fetching page 1 for "${query}"...`);
  const data1 = await fetchJSON(`${base}&per_page=${PER_PAGE_1}&page=1`);
  let photos = data1.results || [];

  if (photos.length >= 20) {
    console.log(`  Fetching page 2...`);
    const data2 = await fetchJSON(`${base}&per_page=${PER_PAGE_2}&page=2`);
    photos = photos.concat(data2.results || []);
  }

  return photos.map((p) => ({
    url: p.urls?.small,
    author: p.user?.name || "",
  }));
}

async function downloadItem(itemId, queries) {
  console.log(`\n[${itemId}] Searching Unsplash...`);
  let photos = [];
  for (const q of (Array.isArray(queries) ? queries : [queries])) {
    const batch = await searchPhotos(q);
    const existingUrls = new Set(photos.map((p) => p.url));
    for (const p of batch) {
      if (!existingUrls.has(p.url)) { photos.push(p); existingUrls.add(p.url); }
    }
    if (photos.length >= 35) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  console.log(`  Found ${photos.length} photos total`);

  const dir = path.join(PHOTOS_DIR, itemId);
  fs.mkdirSync(dir, { recursive: true });

  const paths = [];
  for (let i = 0; i < photos.length; i++) {
    const p = photos[i];
    if (!p.url) continue;
    const filename = String(i + 1).padStart(2, "0") + ".jpg";
    const filePath = path.join(dir, filename);
    const relPath = `photos/${itemId}/${filename}`;

    process.stdout.write(`  Downloading ${i + 1}/${photos.length}...`);
    try {
      await downloadFile(p.url, filePath);
      paths.push(relPath);
      process.stdout.write(" OK\n");
    } catch (err) {
      process.stdout.write(` FAIL: ${err.message}\n`);
    }
  }
  return paths;
}

async function main() {
  const onlyNew = process.argv.includes("--only-new");
  console.log("=== Unsplash Photo Downloader ===");
  console.log(`Output: ${PHOTOS_DIR}`);

  let index = {};
  if (fs.existsSync(INDEX_PATH)) {
    try { index = JSON.parse(fs.readFileSync(INDEX_PATH, "utf-8")); } catch {}
  }

  const allItems = { ...REGIONS, ...PLACES };

  for (const [id, query] of Object.entries(allItems)) {
    if (onlyNew && index[id]?.length) {
      console.log(`[${id}] Already has ${index[id].length} photos, skipping`);
      continue;
    }
    index[id] = await downloadItem(id, query);
    await new Promise((r) => setTimeout(r, 1000));
  }

  fs.writeFileSync(INDEX_PATH, JSON.stringify(index, null, 2));
  console.log(`\nIndex saved to ${INDEX_PATH}`);

  const total = Object.values(index).reduce((s, a) => s + a.length, 0);
  console.log(`Total: ${total} photos for ${Object.keys(index).length} items`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
