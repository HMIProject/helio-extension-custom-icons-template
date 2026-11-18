// Single source of truth for everything derived from the company domain.
// The only required value is `companyDomain` in company.config.json (via
// `npm run setup`, the web interface or by hand). `displayName` is optional.
// Everything else is derived here and passed to the extension code by
// rollup.config.mjs.
import fs from "node:fs";
import path from "node:path";
import { domainToASCII, domainToUnicode, fileURLToPath } from "node:url";
import { UserError } from "./errors.mjs";

export const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const configFile = path.join(projectRoot, "company.config.json");

const DOMAIN_LABEL_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const DOMAIN_EXAMPLE = '"my-company.com"';

/**
 * Turns user input into a plain domain:
 * " https://www.HMI-Project.com/de " -> "hmi-project.com",
 * "müller.de" -> "xn--mller-kva.de" (internationalized domains in ASCII form).
 * Throws an Error with a readable message if it is not a domain.
 */
export function normalizeDomain(input) {
  let value = String(input ?? "").trim().toLowerCase();
  if (!value) {
    throw new UserError(`Please enter your company's domain, e.g. ${DOMAIN_EXAMPLE}.`);
  }
  value = value
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, "") // scheme
    .split(/[/?#]/)[0] // path, query, fragment
    .replace(/^.*@/, "") // user info
    .replace(/:\d+$/, "") // port
    .replace(/\.$/, "") // trailing dot
    .replace(/^www\./, "");

  const ascii = domainToASCII(value);
  const labels = ascii.split(".");
  const valid =
    ascii.length > 0 &&
    ascii.length <= 253 &&
    labels.length >= 2 &&
    labels.every((label) => DOMAIN_LABEL_PATTERN.test(label)) &&
    !/^\d+$/.test(labels.at(-1)); // rejects IP addresses
  if (!valid) {
    throw new UserError(`"${String(input).trim()}" is not a valid domain. Enter your company's domain, e.g. ${DOMAIN_EXAMPLE}.`);
  }
  return ascii;
}

/** "hmi-project.com" -> "com.hmi-project.custom-icons" (reverse domain notation) */
export function toNamespace(companyDomain) {
  return `${companyDomain.split(".").reverse().join(".")}.custom-icons`;
}

/** Domain without its last part, used in file names: "hmi-project.com" -> "hmi-project", "mueller.co.uk" -> "mueller-co" */
export function toFileSlug(companyDomain) {
  return companyDomain.split(".").slice(0, -1).join("-");
}

/** Base name of the built file, e.g. "helio-extension-icons-hmi-project". */
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

/** Optional display name; returns "" when none is set. */
export function validateDisplayName(displayName) {
  const name = String(displayName ?? "").trim();
  if (name.length > 100) {
    throw new UserError("The display name must not be longer than 100 characters.");
  }
  return name;
}

/**
 * All values derived from the company domain and the optional display name.
 * `companyName` is what HELIO shows (icon category, extension name): the
 * display name if set, otherwise the domain.
 */
export function deriveCompany({ companyDomain, displayName } = {}) {
  const domain = normalizeDomain(companyDomain);
  const name = validateDisplayName(displayName);
  return {
    companyDomain: domain,
    displayName: name,
    companyName: name || domainToUnicode(domain),
    companySlug: toFileSlug(domain),
    namespace: toNamespace(domain),
  };
}

/** The raw settings in company.config.json, or {} if the file does not exist. */
export function readConfigFile(file = configFile) {
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
}

/** Reads the config and derives all values; throws a UserError explaining what to fix. */
export function readCompanyConfig(file = configFile) {
  if (!fs.existsSync(file)) {
    throw new UserError(`Company config not found: ${file}. Run "npm run setup" first.`);
  }
  const config = readConfigFile(file);
  if (!config.companyDomain && config.companyName) {
    throw new UserError(
      `${file} still uses the old "companyName" setting. ` +
        `Set your company's domain instead, e.g. ${DOMAIN_EXAMPLE}: run "npm run setup" or use the web interface.`,
    );
  }
  try {
    return deriveCompany(config);
  } catch (error) {
    throw new UserError(`${error.message} Check "companyDomain" in ${file} or run "npm run setup".`);
  }
}

/** deriveCompany plus the path of the built file. */
export function describeCompany(values) {
  const company = deriveCompany(values);
  return { ...company, outputFile: outputFileName(company.companySlug) };
}

/**
 * The saved settings for display: all derived values if the config is valid,
 * otherwise the raw values with `namespace` and `outputFile` set to null and
 * `problem` explaining what is wrong.
 */
export function readSavedCompany(file = configFile) {
  try {
    const company = readCompanyConfig(file);
    return { ...company, outputFile: outputFileName(company.companySlug), problem: null };
  } catch (error) {
    if (!(error instanceof UserError)) throw error;
    const config = readConfigFile(file);
    return {
      companyDomain: String(config.companyDomain ?? ""),
      displayName: String(config.displayName ?? ""),
      companyName: null,
      namespace: null,
      outputFile: null,
      problem: error.message,
    };
  }
}

/** Validates and writes domain and display name. Other keys already in the file are kept. */
export function writeCompanyConfig({ companyDomain, displayName }, file = configFile) {
  const company = deriveCompany({ companyDomain, displayName });
  // Settings from earlier versions; everything is derived from the domain now.
  const { companyName: _name, namespaceDomain: _domain, displayName: _display, ...current } = readConfigFile(file);
  const config = { ...current, companyDomain: company.companyDomain };
  if (company.displayName) config.displayName = company.displayName;
  fs.writeFileSync(file, JSON.stringify(config, null, 2) + "\n", "utf8");
  return company;
}
