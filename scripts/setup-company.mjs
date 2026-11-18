// Sets the company domain (required) and display name (optional).
// npm run setup                                    -> asks interactively
// npm run setup -- my-company.com                  -> sets the domain
// npm run setup -- my-company.com "My Company"     -> sets domain and display name
// (or use the web interface: npm run ui)
import readline from "node:readline/promises";
import { readConfigFile, writeCompanyConfig } from "./company.mjs";

const current = readConfigFile();
const [domainArg = "", ...nameArgs] = process.argv.slice(2);

let companyDomain = domainArg.trim();
let displayName = nameArgs.join(" ").trim();

if (!companyDomain) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const domainHint = current.companyDomain ? ` [${current.companyDomain}]` : "";
  companyDomain = (await rl.question(`Company domain, e.g. my-company.com${domainHint}: `)).trim() || current.companyDomain || "";

  const nameHint = current.displayName ? ` [${current.displayName}, "-" to remove]` : "";
  const answer = (await rl.question(`Display name in HELIO (optional, defaults to the domain)${nameHint}: `)).trim();
  displayName = answer === "-" ? "" : answer || current.displayName || "";
  rl.close();
}

try {
  const company = writeCompanyConfig({ companyDomain, displayName });
  console.log(`Company domain: ${company.companyDomain}`);
  console.log(`Shown in HELIO as: ${company.companyName}`);
  console.log(`Namespace: ${company.namespace}`);
  console.log(`Run "npm run build:icons" to rebuild the extension.`);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
