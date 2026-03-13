const fs = require("fs");
const path = require("path");
const https = require("https");

const SRC = path.join(__dirname, "..", "src", "data", "countries.js");
const DELAY = 1100;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function httpGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: { "User-Agent": "WBelarus-Geocoder/1.0", "Accept-Language": "ru" },
      timeout: 10000,
    }, (res) => {
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => resolve(body));
      res.on("error", reject);
    }).on("error", reject);
  });
}

async function geocode(name, cityName) {
  const q = encodeURIComponent(`${name}, ${cityName}, Беларусь`);
  const url = `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1&countrycodes=by`;
  try {
    const raw = await httpGet(url);
    const data = JSON.parse(raw);
    if (data.length > 0) {
      return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
    }
  } catch (e) {
    console.log(`    geocode error: ${e.message}`);
  }
  return null;
}

function hashOffset(name, idx) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = ((h << 5) - h + name.charCodeAt(i)) | 0;
  const angle = ((Math.abs(h) + idx * 137) % 360) * (Math.PI / 180);
  const dist = 0.003 + ((Math.abs(h >> 8) % 50) / 50) * 0.007;
  return { dlat: Math.cos(angle) * dist, dlon: Math.sin(angle) * dist * 1.8 };
}

function loadCountries() {
  const code = fs.readFileSync(SRC, "utf-8");
  const fn = new Function("window", code + "; return window.WEATHER_COUNTRIES;");
  const w = {};
  return fn(w);
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function main() {
  const force = process.argv.includes("--force");
  const countries = loadCountries();
  const BY = countries.BY;
  let code = fs.readFileSync(SRC, "utf-8");

  const items = [];
  for (const region of BY.regions) {
    for (const city of region.cities) {
      for (const hl of (city.highlights || [])) {
        items.push({ hl, cityName: city.name, cityLat: city.lat, cityLon: city.lon });
      }
    }
  }
  for (const place of (BY.places || [])) {
    for (const hl of (place.highlights || [])) {
      items.push({ hl, cityName: place.name, cityLat: place.lat, cityLon: place.lon });
    }
  }

  const total = items.length;
  let geocoded = 0, fallback = 0, skipped = 0, patched = 0;

  console.log(`=== Geocoding ${total} highlights ===\n`);

  for (let i = 0; i < items.length; i++) {
    const { hl, cityName, cityLat, cityLon } = items[i];
    if (hl.lat != null && !force) {
      skipped++;
      continue;
    }

    process.stdout.write(`  [${i + 1}/${total}] ${cityName} / ${hl.name}: `);
    const result = await geocode(hl.name, cityName);
    await sleep(DELAY);

    let lat, lon;
    if (result) {
      lat = Math.round(result.lat * 10000) / 10000;
      lon = Math.round(result.lon * 10000) / 10000;
      geocoded++;
      process.stdout.write(`${lat}, ${lon}`);
    } else {
      const off = hashOffset(hl.name, i);
      lat = Math.round((cityLat + off.dlat) * 10000) / 10000;
      lon = Math.round((cityLon + off.dlon) * 10000) / 10000;
      fallback++;
      process.stdout.write(`fallback ${lat}, ${lon}`);
    }

    const nameEsc = escapeRegex(JSON.stringify(hl.name));
    const re = new RegExp(`(name:\\s*${nameEsc},\\s*desc:\\s*"[^"]*")(?!.*?lat:)`, "g");
    const newCode = code.replace(re, `$1, lat: ${lat}, lon: ${lon}`);
    if (newCode !== code) {
      code = newCode;
      patched++;
      process.stdout.write(" [patched]\n");
    } else {
      const re2 = new RegExp(`(name:\\s*${nameEsc}[^}]*?)(,\\s*lat:\\s*[\\d.]+,\\s*lon:\\s*[\\d.]+)`);
      if (force && re2.test(code)) {
        code = code.replace(re2, `$1, lat: ${lat}, lon: ${lon}`);
        patched++;
        process.stdout.write(" [re-patched]\n");
      } else {
        process.stdout.write(" [already has coords or no match]\n");
      }
    }
  }

  fs.writeFileSync(SRC, code, "utf-8");
  console.log(`\nDone: ${geocoded} geocoded, ${fallback} fallback, ${skipped} skipped, ${patched} patched in file`);
}

main().catch((err) => { console.error(err); process.exit(1); });
