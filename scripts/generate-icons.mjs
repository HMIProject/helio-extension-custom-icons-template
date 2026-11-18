import path from "node:path";
import { projectRoot } from "./company.mjs";
import { defaultIconsFile, generateIconsFile } from "./icons.mjs";

try {
  const count = generateIconsFile();
  console.log(`Generated ${path.relative(projectRoot, defaultIconsFile)} with ${count} icon(s).`);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
