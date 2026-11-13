// Sets the company name used throughout the extension.
// npm run setup                 -> asks interactively
// npm run setup -- "My Company" -> sets it directly
// (or use the web interface: npm run ui)
import fs from "node:fs";
import readline from "node:readline/promises";
import { configFile, writeCompanyConfig } from "./company.mjs";

const current = fs.existsSync(configFile) ? JSON.parse(fs.readFileSync(configFile, "utf8")) : {};

let companyName = process.argv.slice(2).join(" ").trim();

if (!companyName) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const hint = current.companyName ? ` [${current.companyName}]` : "";
  companyName = (await rl.question(`Company name${hint}: `)).trim() || current.companyName || "";
  rl.close();
}

try {
  const company = writeCompanyConfig(companyName);
  console.log(`Company name set to "${company.companyName}".`);
  console.log(`Namespace: ${company.namespace}`);
  console.log(`Run "npm run build:icons" to rebuild the extension.`);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
