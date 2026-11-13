// The company name is configured once in `company.config.json` in the project
// root (or via `npm run setup`). The extension code reads it from here.
// Build scripts (Node) use scripts/company.mjs instead.
import config from '../company.config.json';

export const companyName: string = config.companyName.trim();
export const namespaceDomain: string = config.namespaceDomain;
