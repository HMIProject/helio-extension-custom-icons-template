import fs from "node:fs";
import path from "node:path";
import { projectRoot } from "./company.mjs";
import { UserError } from "./errors.mjs";

export const defaultSvgDir = path.join(projectRoot, "src", "svg");
export const defaultIconsFile = path.join(projectRoot, "src", "icons.tsx");

export const MAX_SVG_BYTES = 1024 * 1024;
const MAX_SVG_LABEL = `${MAX_SVG_BYTES / 1024 / 1024} MB`;
/** Characters allowed in icon names (= SVG file names without extension). */
const NAME_CHARS = "A-Za-z0-9 _-";
const ICON_NAME_PATTERN = new RegExp(`^[${NAME_CHARS}]+$`);
const INVALID_NAME_CHARS = new RegExp(`[^${NAME_CHARS}]+`, "g");

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

function stripSvgExtension(fileName) {
  return fileName.replace(/\.svg$/i, "");
}

function svgFileNames(svgDir) {
  if (!fs.existsSync(svgDir)) return [];
  return fs
    .readdirSync(svgDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".svg"))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
}

/**
 * The name HELIO uses for an icon. It is also the name of the React component
 * in src/icons.tsx, so it must be a valid identifier: "arrow-left.svg" -> "ArrowLeft".
 */
function iconNameOf(fileName) {
  return toPascalCase(stripSvgExtension(fileName));
}

function toEntry(fileName) {
  return { fileName, iconName: iconNameOf(fileName) };
}

/**
 * Maps icon name -> file name for all SVGs in svgDir. Throws if two files
 * result in the same icon name (that would produce duplicate exports).
 */
function iconNameIndex(svgDir) {
  const index = new Map();
  for (const fileName of svgFileNames(svgDir)) {
    const iconName = iconNameOf(fileName);
    if (index.has(iconName)) {
      throw new UserError(`"${index.get(iconName)}" and "${fileName}" both result in the icon name "${iconName}".`);
    }
    index.set(iconName, fileName);
  }
  return index;
}

/** Checks a user-supplied icon name (without extension) and returns it trimmed. */
function validateName(name) {
  const trimmed = stripSvgExtension(String(name ?? "").trim());
  if (!trimmed) throw new UserError("Please enter a name for the icon.");
  if (trimmed.length > 100) throw new UserError("The icon name must not be longer than 100 characters.");
  if (!ICON_NAME_PATTERN.test(trimmed)) {
    throw new UserError("The icon name may only contain letters, digits, spaces, '-' and '_'.");
  }
  return trimmed;
}

/** Resolves an existing SVG file inside svgDir; rejects anything that points elsewhere. */
function resolveExisting(svgDir, fileName) {
  const base = path.basename(String(fileName ?? ""));
  if (base !== fileName || !base.toLowerCase().endsWith(".svg")) {
    throw new UserError("Invalid file name.");
  }
  const filePath = path.resolve(svgDir, base);
  if (path.dirname(filePath) !== path.resolve(svgDir) || !fs.existsSync(filePath)) {
    throw new UserError(`Icon "${fileName}" not found.`, 404);
  }
  return filePath;
}

/** Throws if `newName` would map to the same icon name as another file. */
function assertNoCollision(svgDir, newName, ignoreFileName) {
  const iconName = toPascalCase(newName);
  const clash = iconNameIndex(svgDir).get(iconName);
  if (clash && clash !== ignoreFileName) {
    throw new UserError(`An icon named "${iconName}" already exists (${clash}).`, 409);
  }
}

export const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

// Optional prolog (BOM, XML declaration, comments, doctype), then the opening
// <svg …> tag. Attribute values are matched as quoted strings so a ">" inside
// a value does not end the tag early.
const ROOT_TAG_PATTERN =
  /^(\uFEFF?(?:\s|<\?xml[\s\S]*?\?>|<!--[\s\S]*?-->|<!DOCTYPE[^>]*>)*)<svg((?:\s+[^\s=/>]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)(\s*\/?>)/i;

/**
 * Validates an uploaded SVG and returns it ready to be stored: with
 * xmlns="http://www.w3.org/2000/svg" on the root element if it had no default
 * namespace. Browsers need it to render an SVG loaded as a file (e.g. via
 * <img>); without it they treat the tags as unknown XML.
 */
function prepareSvg(svgText) {
  const text = String(svgText ?? "");
  if (Buffer.byteLength(text, "utf8") > MAX_SVG_BYTES) {
    throw new UserError(`The SVG file is larger than ${MAX_SVG_LABEL}.`);
  }
  if (!ROOT_TAG_PATTERN.test(text) || !/<\/svg>\s*$/i.test(text)) {
    throw new UserError("The file is not a valid SVG (missing <svg> root element).");
  }
  return ensureSvgNamespace(text);
}

/** Adds the SVG namespace to the root element if it has no default namespace. */
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

/** usesCurrentColor per "<path>@<version>" from the last listIcons call, so unchanged files are not read again. */
let colorCache = new Map();

/**
 * Lists all icons. `version` changes whenever the file changes, so clients can
 * use it to cache previews and reload only icons that were replaced. File
 * contents are only read for new or changed files.
 */
export function listIcons(svgDir = defaultSvgDir) {
  const nextCache = new Map();
  const icons = svgFileNames(svgDir).map((fileName) => {
    const filePath = path.join(svgDir, fileName);
    const { mtimeMs, size } = fs.statSync(filePath);
    const version = `${Math.round(mtimeMs)}-${size}`;
    const cacheKey = `${filePath}@${version}`;
    const currentColor = colorCache.get(cacheKey) ?? usesCurrentColor(fs.readFileSync(filePath, "utf8"));
    nextCache.set(cacheKey, currentColor);
    return { ...toEntry(fileName), usesCurrentColor: currentColor, version };
  });
  colorCache = nextCache;
  return icons;
}

/** "my icon (1).svg" -> "my icon -1-" -> "my icon -1": only characters allowed in icon names. */
export function nameFromFileName(fileName) {
  const base = stripSvgExtension(path.basename(String(fileName ?? "")));
  return base.replace(INVALID_NAME_CHARS, "-").replace(/^-+|-+$/g, "") || "icon";
}

/** Creates a new file; fails instead of overwriting an existing one. */
function writeNewFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, { encoding: "utf8", flag: "wx" });
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
  const existing = iconNameIndex(svgDir);
  const seen = new Map();

  return files.map(({ name, svg } = {}) => {
    const source = String(name ?? "");
    try {
      const validName = validateName(nameFromFileName(source));
      const content = prepareSvg(svg);
      const iconName = toPascalCase(validName);
      if (seen.has(iconName)) {
        throw new UserError(`"${seen.get(iconName)}" in this upload already results in the icon name "${iconName}".`);
      }
      seen.set(iconName, source);

      const target = existing.get(iconName);
      if (!target) return { source, action: "add", fileName: `${validName}.svg`, content };
      const current = fs.readFileSync(path.join(svgDir, target), "utf8");
      return { source, action: current === content ? "unchanged" : "replace", fileName: target, content };
    } catch (error) {
      if (!(error instanceof UserError)) throw error;
      return { source, action: "error", error: error.message };
    }
  });
}

/** Applies an upload as described by planUpload and returns the results (without file contents). */
export function applyUpload(files, svgDir = defaultSvgDir) {
  return planUpload(files, svgDir).map(({ content, ...result }) => {
    try {
      if (result.action === "add") writeNewFile(path.join(svgDir, result.fileName), content);
      else if (result.action === "replace") writeFileAtomic(path.join(svgDir, result.fileName), content);
      return result;
    } catch (error) {
      return { source: result.source, action: "error", error: error.message };
    }
  });
}

/** Replaces the content of an existing icon; its name stays the same. */
export function replaceIcon(fileName, svgText, svgDir = defaultSvgDir) {
  const filePath = resolveExisting(svgDir, fileName);
  const content = prepareSvg(svgText);
  const changed = fs.readFileSync(filePath, "utf8") !== content;
  if (changed) writeFileAtomic(filePath, content);
  return { ...toEntry(fileName), changed };
}

export function readIcon(fileName, svgDir = defaultSvgDir) {
  return fs.readFileSync(resolveExisting(svgDir, fileName), "utf8");
}

export function addIcon(name, svgText, svgDir = defaultSvgDir) {
  const validName = validateName(name);
  const content = prepareSvg(svgText);
  const fileName = `${validName}.svg`;
  assertNoCollision(svgDir, validName);
  writeNewFile(path.join(svgDir, fileName), content);
  return toEntry(fileName);
}

export function deleteIcon(fileName, svgDir = defaultSvgDir) {
  fs.unlinkSync(resolveExisting(svgDir, fileName));
}

/** Deletes several icons; one invalid or missing file does not stop the others. */
export function deleteIcons(fileNames, svgDir = defaultSvgDir) {
  return fileNames.map((fileName) => {
    try {
      deleteIcon(fileName, svgDir);
      return { fileName, deleted: true };
    } catch (error) {
      if (!(error instanceof UserError)) throw error;
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

  const iconNames = fileNames.map(iconNameOf);
  const imports = fileNames.map((fileName, i) => `import ${iconNames[i]} from "./svg/${fileName}";`).join("\n");
  const iconExports = iconNames
    .map(
      (iconName) =>
        `export const icon${iconName} = createIcon(namespace, {\n  name: "${iconName}",\n  category: companyName,\n  Icon: ${iconName},\n});`,
    )
    .join("\n\n");
  const iconList = iconNames.map((iconName) => `icon${iconName}`).join(",\n  ");

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
  const fileNames = [...iconNameIndex(svgDir).values()].sort((a, b) => a.localeCompare(b));
  if (fileNames.length === 0 && !allowEmpty) {
    throw new UserError(`No SVG files found in: ${svgDir}`);
  }
  const content = renderIconsFile(fileNames);
  if (!fs.existsSync(iconsFile) || fs.readFileSync(iconsFile, "utf8") !== content) {
    fs.writeFileSync(iconsFile, content, "utf8");
  }
  return fileNames.length;
}
