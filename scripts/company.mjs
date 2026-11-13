import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const configFile = path.join(projectRoot, "company.config.json");

export const DEFAULT_NAMESPACE_DOMAIN = "com.hmi-project";
const NAMESPACE_DOMAIN_PATTERN = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/;

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
 * Checks and normalizes a company config. Throws an Error with a
 * human-readable message if a value is invalid.
 */
export function validateCompanyConfig({ companyName, namespaceDomain }) {
  const name = String(companyName ?? "").trim();
  if (!name || !toSlug(name)) {
    throw new Error("The company name must contain at least one letter or digit.");
  }
  if (name.length > 100) {
    throw new Error("The company name must not be longer than 100 characters.");
  }

  const domain = String(namespaceDomain ?? DEFAULT_NAMESPACE_DOMAIN).trim().toLowerCase();
  if (!NAMESPACE_DOMAIN_PATTERN.test(domain)) {
    throw new Error(
      `"${domain}" is not a valid namespace domain. Use reverse domain notation, e.g. "com.my-company".`,
    );
  }

  return { companyName: name, namespaceDomain: domain };
}

export function readCompanyConfig(file = configFile) {
  if (!fs.existsSync(file)) {
    throw new Error(`Company config not found: ${file}. Run "npm run setup" first.`);
  }
  const config = JSON.parse(fs.readFileSync(file, "utf8"));
  const companyName = String(config.companyName ?? "").trim();
  if (!companyName) {
    throw new Error(`"companyName" is missing in ${file}. Run "npm run setup" first.`);
  }
  return { ...config, companyName, companySlug: toSlug(companyName) };
}

export function readPackageVersion() {
  return JSON.parse(fs.readFileSync(path.join(projectRoot, "package.json"), "utf8")).version;
}

/** Path of the built extension, relative to the project root. */
export function outputFileName(companySlug, version = readPackageVersion()) {
  return `lib/helio-extension-icons-${companySlug}-${version}.js`;
}

/** Validates and writes the config. Unknown keys already in the file are kept. */
export function writeCompanyConfig(values, file = configFile) {
  const current = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
  const validated = validateCompanyConfig({ ...current, ...values });
  const config = { ...current, ...validated };
  fs.writeFileSync(file, JSON.stringify(config, null, 2) + "\n", "utf8");
  return { ...config, companySlug: toSlug(config.companyName) };
}
