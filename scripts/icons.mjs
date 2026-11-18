import fs from "node:fs";
import path from "node:path";
import { projectRoot } from "./company.mjs";

export const defaultSvgDir = path.join(projectRoot, "src", "svg");
export const defaultIconsFile = path.join(projectRoot, "src", "icons.tsx");

export const MAX_SVG_BYTES = 1024 * 1024;
const ICON_NAME_PATTERN = /^[A-Za-z0-9 _-]+$/;

/** Error caused by invalid user input; `status` is the HTTP status to report. */
export class IconError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

export function toPascalCase(value) {
  const cleaned = value
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");

  if (!cleaned) return "Icon";
  if (/^[0-9]/.test(cleaned)) return `Icon${cleaned}`;
  return cleaned;
}

export function toExportName(componentName) {
  return `icon${componentName}`;
}

function svgFileNames(svgDir) {
  if (!fs.existsSync(svgDir)) return [];
  return fs
    .readdirSync(svgDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".svg"))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
}

function toEntry(fileName) {
  const componentName = toPascalCase(path.basename(fileName, path.extname(fileName)));
  return {
    fileName,
    componentName,
    exportName: toExportName(componentName),
    iconName: componentName,
  };
}

/** Checks a user-supplied icon name (without extension) and returns it trimmed. */
function validateName(name) {
  const trimmed = String(name ?? "").trim().replace(/\.svg$/i, "");
  if (!trimmed) throw new IconError("Please enter a name for the icon.");
  if (trimmed.length > 100) throw new IconError("The icon name must not be longer than 100 characters.");
  if (!ICON_NAME_PATTERN.test(trimmed)) {
    throw new IconError("The icon name may only contain letters, digits, spaces, '-' and '_'.");
  }
  return trimmed;
}

/** Resolves an existing SVG file inside svgDir; rejects anything that points elsewhere. */
function resolveExisting(svgDir, fileName) {
  const base = path.basename(String(fileName ?? ""));
  if (base !== fileName || !base.toLowerCase().endsWith(".svg")) {
    throw new IconError("Invalid file name.");
  }
  const filePath = path.resolve(svgDir, base);
  if (path.dirname(filePath) !== path.resolve(svgDir) || !fs.existsSync(filePath)) {
    throw new IconError(`Icon "${fileName}" not found.`, 404);
  }
  return filePath;
}

/** Throws if `newName` would map to the same icon name as another file. */
function assertNoCollision(svgDir, newName, ignoreFileName) {
  const iconName = toPascalCase(newName);
  const clash = svgFileNames(svgDir)
    .filter((fileName) => fileName !== ignoreFileName)
    .find((fileName) => toEntry(fileName).iconName === iconName);
  if (clash) {
    throw new IconError(`An icon named "${iconName}" already exists (${clash}).`, 409);
  }
}

function validateSvg(svgText) {
  const text = String(svgText ?? "");
  if (Buffer.byteLength(text, "utf8") > MAX_SVG_BYTES) {
    throw new IconError("The SVG file is larger than 1 MB.");
  }
  // Allow an XML declaration, comments and a doctype before the root element.
  const withoutProlog = text
    .replace(/^﻿/, "")
    .replace(/<\?xml[\s\S]*?\?>/g, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<!DOCTYPE[\s\S]*?>/gi, "")
    .trim();
  if (!/^<svg[\s>]/i.test(withoutProlog) || !/<\/svg>\s*$/i.test(withoutProlog)) {
    throw new IconError("The file is not a valid SVG (missing <svg> root element).");
  }
  return text;
}

export const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

// Optional prolog (BOM, XML declaration, comments, doctype), then the opening
// <svg …> tag. Attribute values are matched as quoted strings so a ">" inside
// a value does not end the tag early.
const ROOT_TAG_PATTERN =
  /^(﻿?(?:\s|<\?xml[\s\S]*?\?>|<!--[\s\S]*?-->|<!DOCTYPE[^>]*>)*)<svg((?:\s+[^\s=/>]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)(\s*\/?>)/i;

/**
 * Adds xmlns="http://www.w3.org/2000/svg" to the root element if it has no
 * default namespace. Browsers need it to render an SVG loaded as a file
 * (e.g. via <img>); without it they treat the tags as unknown XML.
 */
export function ensureSvgNamespace(svgText) {
  const match = svgText.match(ROOT_TAG_PATTERN);
  if (!match) return svgText;
  const [whole, prolog, attributes, end] = match;
  // Only the default namespace counts; prefixed ones like xmlns:xlink do not.
  if (/(^|\s)xmlns\s*=/.test(attributes)) return svgText;
  return `${prolog}<svg xmlns="${SVG_NAMESPACE}"${attributes}${end}${svgText.slice(whole.length)}`;
}

export function usesCurrentColor(svgText) {
  return /currentColor/i.test(svgText);
}

/**
 * Lists all icons. `version` changes whenever the file changes, so clients can
 * use it to cache previews and reload only icons that were replaced.
 */
export function listIcons(svgDir = defaultSvgDir) {
  return svgFileNames(svgDir).map((fileName) => {
    const filePath = path.join(svgDir, fileName);
    const svg = fs.readFileSync(filePath, "utf8");
    const { componentName, ...entry } = toEntry(fileName);
    const version = `${Math.round(fs.statSync(filePath).mtimeMs)}-${svg.length}`;
    return { ...entry, usesCurrentColor: usesCurrentColor(svg), version };
  });
}

/** "my icon (1).svg" -> "my icon -1-" -> "my icon -1": only characters allowed in icon names. */
export function nameFromFileName(fileName) {
  const base = path.basename(String(fileName ?? "")).replace(/\.svg$/i, "");
  return base.replace(/[^A-Za-z0-9 _-]+/g, "-").replace(/^-+|-+$/g, "") || "icon";
}

/** Writes via a temporary file so an interrupted write never leaves a half-written SVG. */
function writeFileAtomic(filePath, content) {
  const tmpPath = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${process.pid}.tmp`);
  fs.writeFileSync(tmpPath, content, "utf8");
  fs.renameSync(tmpPath, filePath);
}

/**
 * Decides for each uploaded file what would happen, without writing anything:
 * - "add":       no icon with this name exists yet
 * - "replace":   an icon with the same name exists and its content differs
 *                (the existing file name is kept, so HELIO references stay valid)
 * - "unchanged": an icon with the same name and identical content exists
 * - "error":     the file is invalid; `error` says why
 *
 * Names are matched by their icon name, so "lock.svg" replaces "Lock.svg".
 * `files` is a list of `{ name, svg }` where `name` is the uploaded file name.
 */
export function planUpload(files, svgDir = defaultSvgDir) {
  const existing = new Map(svgFileNames(svgDir).map((fileName) => [toEntry(fileName).iconName, fileName]));
  const seen = new Map();

  return (Array.isArray(files) ? files : []).map(({ name, svg } = {}) => {
    const source = String(name ?? "");
    try {
      const validName = validateName(nameFromFileName(source));
      const content = ensureSvgNamespace(validateSvg(svg));
      const iconName = toPascalCase(validName);
      if (seen.has(iconName)) {
        throw new IconError(`"${seen.get(iconName)}" in this upload already results in the icon name "${iconName}".`);
      }
      seen.set(iconName, source);

      const target = existing.get(iconName);
      if (!target) return { source, action: "add", fileName: `${validName}.svg`, iconName, content };
      const current = fs.readFileSync(path.join(svgDir, target), "utf8");
      return { source, action: current === content ? "unchanged" : "replace", fileName: target, iconName, content };
    } catch (error) {
      if (!(error instanceof IconError)) throw error;
      return { source, action: "error", error: error.message };
    }
  });
}

/** Applies an upload as described by planUpload and returns the results (without file contents). */
export function applyUpload(files, svgDir = defaultSvgDir) {
  const plan = planUpload(files, svgDir);
  fs.mkdirSync(svgDir, { recursive: true });
  return plan.map(({ content, ...result }) => {
    try {
      if (result.action === "add") {
        fs.writeFileSync(path.join(svgDir, result.fileName), content, { encoding: "utf8", flag: "wx" });
      } else if (result.action === "replace") {
        writeFileAtomic(path.join(svgDir, result.fileName), content);
      }
      return result;
    } catch (error) {
      return { source: result.source, action: "error", error: error.message };
    }
  });
}

/** Replaces the content of an existing icon; its name stays the same. */
export function replaceIcon(fileName, svgText, svgDir = defaultSvgDir) {
  const filePath = resolveExisting(svgDir, fileName);
  const content = ensureSvgNamespace(validateSvg(svgText));
  const changed = fs.readFileSync(filePath, "utf8") !== content;
  if (changed) writeFileAtomic(filePath, content);
  const { componentName, ...entry } = toEntry(fileName);
  return { ...entry, changed };
}

export function readIcon(fileName, svgDir = defaultSvgDir) {
  return fs.readFileSync(resolveExisting(svgDir, fileName), "utf8");
}

export function addIcon(name, svgText, svgDir = defaultSvgDir) {
  const validName = validateName(name);
  const svg = ensureSvgNamespace(validateSvg(svgText));
  const fileName = `${validName}.svg`;
  assertNoCollision(svgDir, validName);
  fs.mkdirSync(svgDir, { recursive: true });
  fs.writeFileSync(path.join(svgDir, fileName), svg, { encoding: "utf8", flag: "wx" });
  return toEntry(fileName);
}

export function deleteIcon(fileName, svgDir = defaultSvgDir) {
  fs.unlinkSync(resolveExisting(svgDir, fileName));
}

/** Deletes several icons; one invalid or missing file does not stop the others. */
export function deleteIcons(fileNames, svgDir = defaultSvgDir) {
  return (Array.isArray(fileNames) ? fileNames : []).map((fileName) => {
    try {
      deleteIcon(fileName, svgDir);
      return { fileName, deleted: true };
    } catch (error) {
      if (!(error instanceof IconError)) throw error;
      return { fileName, deleted: false, error: error.message };
    }
  });
}

export function renameIcon(fileName, newName, svgDir = defaultSvgDir) {
  const from = resolveExisting(svgDir, fileName);
  const validName = validateName(newName);
  const newFileName = `${validName}.svg`;
  if (newFileName === fileName) return toEntry(fileName);
  assertNoCollision(svgDir, validName, fileName);
  fs.renameSync(from, path.join(svgDir, newFileName));
  return toEntry(newFileName);
}

/** Returns the content of src/icons.tsx for the given SVG files. */
export function renderIconsFile(fileNames) {
  if (fileNames.length === 0) {
    return `import type { CreateIconResult } from "@hmiproject/helio-sdk";

// No icons yet: add SVG files to src/svg or upload them in the web interface (npm run ui).
export const icons: CreateIconResult[] = [];
`;
  }

  const iconEntries = fileNames.map(toEntry);

  const imports = iconEntries
    .map(({ componentName, fileName }) => `import ${componentName} from "./svg/${fileName}";`)
    .join("\n");

  const iconExports = iconEntries
    .map(
      ({ exportName, iconName, componentName }) =>
        `export const ${exportName} = createIcon(namespace, {\n  name: "${iconName}",\n  category: companyName,\n  Icon: ${componentName},\n});`,
    )
    .join("\n\n");

  const iconList = iconEntries.map(({ exportName }) => exportName).join(",\n  ");

  return `import { createIcon } from "@hmiproject/helio-sdk";
import { companyName } from "./company";
import { namespace } from "./namespace";
${imports}

${iconExports}

export const icons = [
  ${iconList}
];
`;
}

/**
 * Regenerates src/icons.tsx from the SVG files. Returns the number of icons.
 * The build needs at least one icon; `allowEmpty` writes an empty icon list
 * instead, so the file never points to deleted SVGs. The file is only written
 * when its content changes.
 */
export function generateIconsFile({ svgDir = defaultSvgDir, iconsFile = defaultIconsFile, allowEmpty = false } = {}) {
  if (!fs.existsSync(svgDir) && !allowEmpty) {
    throw new IconError(`SVG directory not found: ${svgDir}`);
  }
  const fileNames = svgFileNames(svgDir);
  if (fileNames.length === 0 && !allowEmpty) {
    throw new IconError(`No SVG files found in: ${svgDir}`);
  }
  const names = new Map();
  for (const fileName of fileNames) {
    const { iconName } = toEntry(fileName);
    if (names.has(iconName)) {
      throw new IconError(`"${names.get(iconName)}" and "${fileName}" both result in the icon name "${iconName}".`);
    }
    names.set(iconName, fileName);
  }
  const content = renderIconsFile(fileNames);
  if (!fs.existsSync(iconsFile) || fs.readFileSync(iconsFile, "utf8") !== content) {
    fs.writeFileSync(iconsFile, content, "utf8");
  }
  return fileNames.length;
}
