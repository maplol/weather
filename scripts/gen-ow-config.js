const fs = require("fs");
const path = require("path");

require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const isProd = process.env.NODE_ENV === "production";
const apiKey = isProd ? "" : (process.env.OPENWEATHER_API_KEY || "");

const outPath = path.join(__dirname, "..", "src", "js", "ow-config.js");
const content =
  "// Generated - do not edit. API key for local dev only.\n" +
  "window.__OW_API_KEY = " +
  JSON.stringify(apiKey) +
  ";\n";

fs.writeFileSync(outPath, content);
