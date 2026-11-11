import fs from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();
const svgDir = path.join(projectRoot, "src", "svg");
const iconsFile = path.join(projectRoot, "src", "icons.tsx");

function toPascalCase(value) {
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

function toExportName(componentName) {
  return `icon${componentName}`;
}

if (!fs.existsSync(svgDir)) {
  console.error(`SVG directory not found: ${svgDir}`);
  process.exit(1);
}

const svgFiles = fs
  .readdirSync(svgDir, { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".svg"))
  .map((entry) => entry.name)
  .sort((a, b) => a.localeCompare(b));

if (svgFiles.length === 0) {
  console.error(`No SVG files found in: ${svgDir}`);
  process.exit(1);
}

const iconEntries = svgFiles.map((fileName) => {
  const baseName = path.basename(fileName, ".svg");
  const componentName = toPascalCase(baseName);
  const exportName = toExportName(componentName);

  return {
    fileName,
    componentName,
    exportName,
    iconName: componentName,
  };
});

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

const content = `import { createIcon } from "@hmiproject/helio-sdk";
import { companyName } from "./company";
import { namespace } from "./namespace";
${imports}

${iconExports}

export const icons = [
  ${iconList}
];
`;

fs.writeFileSync(iconsFile, content, "utf8");
console.log(`Generated ${path.relative(projectRoot, iconsFile)} with ${iconEntries.length} icon(s).`);
