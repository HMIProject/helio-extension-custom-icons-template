import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const configFile = path.join(projectRoot, "company.config.json");

/** "Müller & Söhne GmbH" -> "muller-sohne-gmbh" */
export function toSlug(value) {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function readCompanyConfig() {
  if (!fs.existsSync(configFile)) {
    throw new Error(`Company config not found: ${configFile}. Run "npm run setup" first.`);
  }
  const config = JSON.parse(fs.readFileSync(configFile, "utf8"));
  const companyName = String(config.companyName ?? "").trim();
  if (!companyName) {
    throw new Error(`"companyName" is missing in ${configFile}. Run "npm run setup" first.`);
  }
  return { ...config, companyName, companySlug: toSlug(companyName) };
}
