import fs from "node:fs";
import path from "node:path";

const dataDir = path.join(process.cwd(), "server", "data");

function ensureFile(fileName, fallbackData) {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const filePath = path.join(dataDir, fileName);

  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(fallbackData, null, 2));
  }

  return filePath;
}

export function readJson(fileName, fallbackData) {
  const filePath = ensureFile(fileName, fallbackData);
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

export function writeJson(fileName, value, fallbackData = []) {
  const filePath = ensureFile(fileName, fallbackData);
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}
