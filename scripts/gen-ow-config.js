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

const fbConfig = {
  apiKey: process.env.FIREBASE_API_KEY || "",
  authDomain: process.env.FIREBASE_AUTH_DOMAIN || "",
  projectId: process.env.FIREBASE_PROJECT_ID || "",
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || "",
  appId: process.env.FIREBASE_APP_ID || "",
};
const fbOut = path.join(__dirname, "..", "src", "js", "fb-config.js");
fs.writeFileSync(fbOut,
  "// Generated - do not edit.\nwindow.__FB_CONFIG = " +
  JSON.stringify(fbConfig, null, 2) + ";\n"
);
