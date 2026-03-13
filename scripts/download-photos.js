const fs = require("fs");
const path = require("path");
const https = require("https");
const sharp = require("sharp");

const PHOTOS_DIR = path.join(__dirname, "..", "src", "photos");
const INDEX_PATH = path.join(__dirname, "..", "src", "data", "photos.json");
const WEBP_QUALITY = 80;
const MAX_WIDTH = 800;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ru,en;q=0.5",
      },
      timeout: 15000,
    }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode))
        return httpsGet(res.headers.location).then(resolve, reject);
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => resolve(body));
      res.on("error", reject);
    }).on("error", reject);
  });
}

function downloadBuffer(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
      timeout: 20000,
    }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode))
        return downloadBuffer(res.headers.location).then(resolve, reject);
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks)));
      res.on("error", reject);
    }).on("error", reject);
  });
}

function extractYandexPhotos(html, maxCount = 10) {
  const seen = new Set();
  const urls = [];
  const regex = /https:\/\/avatars\.mds\.yandex\.net\/get-altay\/\d+\/[a-f0-9]+/g;
  let m;
  while ((m = regex.exec(html)) !== null) {
    const base = m[0];
    if (seen.has(base)) continue;
    seen.add(base);
    urls.push(base + "/L_height");
  }
  return urls.slice(0, maxCount);
}

async function searchYandexMaps(query, lat, lon) {
  const ll = `${lon},${lat}`;
  const spn = "0.08,0.08";
  const url = `https://yandex.by/maps/?text=${encodeURIComponent(query)}&ll=${ll}&spn=${spn}&z=14`;
  try {
    const html = await httpsGet(url);
    return extractYandexPhotos(html);
  } catch (err) {
    console.log(`    search err: ${err.message}`);
    return [];
  }
}

async function downloadAndConvert(url, dest) {
  try {
    const buf = await downloadBuffer(url);
    if (buf.length < 2000) return false;
    await sharp(buf)
      .resize({ width: MAX_WIDTH, withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY })
      .toFile(dest);
    return true;
  } catch {
    try { fs.unlinkSync(dest); } catch {}
    return false;
  }
}

function photoHash(url) {
  const m = url.match(/\/([a-f0-9]{20,})/);
  return m ? m[1] : url;
}

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[ёе]/g, "e").replace(/[а]/g, "a").replace(/[б]/g, "b").replace(/[в]/g, "v")
    .replace(/[г]/g, "g").replace(/[д]/g, "d").replace(/[ж]/g, "zh").replace(/[з]/g, "z")
    .replace(/[и]/g, "i").replace(/[й]/g, "y").replace(/[к]/g, "k").replace(/[л]/g, "l")
    .replace(/[м]/g, "m").replace(/[н]/g, "n").replace(/[о]/g, "o").replace(/[п]/g, "p")
    .replace(/[р]/g, "r").replace(/[с]/g, "s").replace(/[т]/g, "t").replace(/[у]/g, "u")
    .replace(/[ф]/g, "f").replace(/[х]/g, "kh").replace(/[ц]/g, "ts").replace(/[ч]/g, "ch")
    .replace(/[ш]/g, "sh").replace(/[щ]/g, "shch").replace(/[ъьы]/g, "").replace(/[э]/g, "e")
    .replace(/[ю]/g, "yu").replace(/[я]/g, "ya")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function loadCountries() {
  const code = fs.readFileSync(path.join(__dirname, "..", "src", "data", "countries.js"), "utf-8");
  const fn = new Function("window", code + "; return window.WEATHER_COUNTRIES;");
  const w = {};
  return fn(w);
}

async function processItem(regionId, itemId, itemName, highlights, isPlace, lat, lon) {
  const baseDir = isPlace
    ? path.join(PHOTOS_DIR, "places", itemId)
    : path.join(PHOTOS_DIR, regionId, itemId);
  const cityDir = path.join(baseDir, "_city");
  fs.mkdirSync(cityDir, { recursive: true });

  const result = { city: [], highlights: {} };
  const usedHashes = new Set();

  const cityQuery = `${itemName} город достопримечательности`;
  process.stdout.write(`  ${itemName}: city`);
  const cityPhotos = await searchYandexMaps(cityQuery, lat, lon);
  await sleep(800);

  let cityIdx = 0;
  for (const url of cityPhotos.slice(0, 6)) {
    if (cityIdx >= 3) break;
    const h = photoHash(url);
    if (usedHashes.has(h)) continue;
    cityIdx++;
    usedHashes.add(h);
    const fn = String(cityIdx).padStart(2, "0") + ".webp";
    const fp = path.join(cityDir, fn);
    if (await downloadAndConvert(url, fp)) {
      result.city.push(path.relative(path.join(__dirname, "..", "src"), fp).replace(/\\/g, "/"));
      process.stdout.write(".");
    } else {
      process.stdout.write("x");
    }
    await sleep(300);
  }

  for (const hl of highlights) {
    const hlName = typeof hl === "string" ? hl : hl.name;
    if (!hlName) continue;
    const slug = slugify(hlName);
    const hlFile = path.join(baseDir, slug + ".webp");

    const query = `${hlName} ${itemName}`;
    process.stdout.write(` hl`);
    const photos = await searchYandexMaps(query, lat, lon);
    await sleep(800);

    let saved = false;
    for (const url of photos) {
      const h = photoHash(url);
      if (usedHashes.has(h)) continue;
      usedHashes.add(h);
      if (await downloadAndConvert(url, hlFile)) {
        result.highlights[hlName] = path.relative(path.join(__dirname, "..", "src"), hlFile).replace(/\\/g, "/");
        process.stdout.write(".");
        saved = true;
        break;
      }
    }
    if (!saved) process.stdout.write(photos.length ? "x" : "-");
    await sleep(300);
  }

  console.log(` => ${result.city.length}c + ${Object.keys(result.highlights).length}h`);
  return result;
}

async function main() {
  const onlyId = process.argv.find((a) => a.startsWith("--id="))?.split("=")[1];
  const force = process.argv.includes("--force");
  console.log(`=== Yandex Maps → WebP Downloader (geo-bound) ===${force ? " [FORCE]" : ""}\n`);

  const countries = loadCountries();
  const BY = countries.BY;

  let index = {};
  if (!force && fs.existsSync(INDEX_PATH)) {
    try { index = JSON.parse(fs.readFileSync(INDEX_PATH, "utf-8")); } catch {}
  }
  if (typeof index !== "object" || Array.isArray(index)) index = {};

  for (const region of BY.regions) {
    console.log(`\n=== ${region.id.toUpperCase()} ===`);
    for (const city of region.cities) {
      if (onlyId && city.id !== onlyId) continue;
      if (!force && index[city.id]?.city?.length > 0 && Object.keys(index[city.id]?.highlights || {}).length > 0) {
        console.log(`  [${city.id}] already done, skip`);
        continue;
      }
      index[city.id] = await processItem(region.id, city.id, city.name, city.highlights || [], false, city.lat, city.lon);
      fs.writeFileSync(INDEX_PATH, JSON.stringify(index, null, 2));
    }
  }

  console.log(`\n=== PLACES ===`);
  for (const place of (BY.places || [])) {
    if (onlyId && place.id !== onlyId) continue;
    if (!force && index[place.id]?.city?.length > 0 && Object.keys(index[place.id]?.highlights || {}).length > 0) {
      console.log(`  [${place.id}] already done, skip`);
      continue;
    }
    index[place.id] = await processItem("places", place.id, place.name, place.highlights || [], true, place.lat, place.lon);
    fs.writeFileSync(INDEX_PATH, JSON.stringify(index, null, 2));
  }

  const totalCity = Object.values(index).reduce((s, v) => s + (v?.city?.length || 0), 0);
  const totalHl = Object.values(index).reduce((s, v) => s + Object.keys(v?.highlights || {}).length, 0);
  console.log(`\nDone: ${totalCity} city photos + ${totalHl} highlight photos for ${Object.keys(index).length} items`);
}

main().catch((err) => { console.error(err); process.exit(1); });
