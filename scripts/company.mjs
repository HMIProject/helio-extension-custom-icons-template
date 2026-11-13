// Single source of truth for everything derived from the company name.
// The only value a user enters is `companyName` in company.config.json
// (via `npm run setup`, the web interface or by hand). Everything else is
// derived here and passed to the extension code by rollup.config.mjs.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const configFile = path.join(projectRoot, "company.config.json");

/** "Müller & Söhne GmbH" -> "muller-sohne-gmbh" */
export function toSlug(value) {
  return String(value)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * HELIO namespace in reverse domain notation, derived from the company slug:
 * "muller-sohne-gmbh" -> "com.muller-sohne-gmbh.custom-icons"
 */
export function toNamespace(companySlug) {
  return `com.${companySlug}.custom-icons`;
}

/** Base name of the built file, e.g. "helio-extension-icons-muller-sohne-gmbh". */
export function extensionBaseName(companySlug) {
  return `helio-extension-icons-${companySlug}`;
}

export function readPackageVersion() {
  return JSON.parse(fs.readFileSync(path.join(projectRoot, "package.json"), "utf8")).version;
}

/** Path of the built extension, relative to the project root. */
export function outputFileName(companySlug, version = readPackageVersion()) {
  return `lib/${extensionBaseName(companySlug)}-${version}.js`;
}

/** Checks and trims a company name. Throws an Error with a readable message. */
export function validateCompanyName(companyName) {
  const name = String(companyName ?? "").trim();
  if (!name || !toSlug(name)) {
    throw new Error("The company name must contain at least one letter or digit.");
  }
  if (name.length > 100) {
    throw new Error("The company name must not be longer than 100 characters.");
  }
  return name;
}

/** All values derived from a (valid) company name. */
export function deriveCompany(companyName) {
  const name = validateCompanyName(companyName);
  const companySlug = toSlug(name);
  return {
    companyName: name,
    companySlug,
    namespace: toNamespace(companySlug),
  };
}

function readConfigFile(file) {
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
}

export function readCompanyConfig(file = configFile) {
  if (!fs.existsSync(file)) {
    throw new Error(`Company config not found: ${file}. Run "npm run setup" first.`);
  }
  try {
    return deriveCompany(readConfigFile(file).companyName);
  } catch (error) {
    throw new Error(`${error.message} Check "companyName" in ${file} or run "npm run setup".`);
  }
}

/** Validates and writes the company name. Other keys already in the file are kept. */
export function writeCompanyConfig(companyName, file = configFile) {
  const company = deriveCompany(companyName);
  // `namespaceDomain` was configurable in earlier versions; it is derived now.
  const { namespaceDomain: _legacy, ...current } = readConfigFile(file);
  const config = { ...current, companyName: company.companyName };
  fs.writeFileSync(file, JSON.stringify(config, null, 2) + "\n", "utf8");
  return company;
}
