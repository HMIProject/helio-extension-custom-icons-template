// The company name is configured once in `company.config.json` in the project
// root (or via `npm run setup`). Everything else reads it from here.
import config from '../company.config.json';

/** "Müller & Söhne GmbH" -> "muller-sohne-gmbh" (keep in sync with scripts/lib/company.mjs) */
function toSlug(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export const companyName: string = config.companyName.trim();
export const companySlug: string = toSlug(companyName);
export const namespaceDomain: string = config.namespaceDomain;
