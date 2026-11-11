// Sets the company name used throughout the extension.
// npm run setup                 -> asks interactively
// npm run setup -- "My Company" -> sets it directly
import fs from "node:fs";
import readline from "node:readline/promises";
import { configFile, toSlug } from "./lib/company.mjs";

const current = fs.existsSync(configFile) ? JSON.parse(fs.readFileSync(configFile, "utf8")) : {};

let companyName = process.argv.slice(2).join(" ").trim();

if (!companyName) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const hint = current.companyName ? ` [${current.companyName}]` : "";
  companyName = (await rl.question(`Company name${hint}: `)).trim() || current.companyName || "";
  rl.close();
}

if (!companyName || !toSlug(companyName)) {
  console.error("Please provide a company name containing at least one letter or digit.");
  process.exit(1);
}

const config = { namespaceDomain: "com.hmi-project", ...current, companyName };
fs.writeFileSync(configFile, JSON.stringify(config, null, 2) + "\n", "utf8");

console.log(`Company name set to "${companyName}" (id: "${toSlug(companyName)}").`);
console.log(`Run "npm run build:icons" to rebuild the extension.`);
