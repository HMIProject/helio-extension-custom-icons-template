// Prints the base name of the built extension file, derived from the company
// domain in company.config.json. Used by the release workflow:
//   npm run get-name -s   ->   helio-extension-icons-my-company
import { extensionBaseName, readCompanyConfig } from "./company.mjs";

try {
  console.log(extensionBaseName(readCompanyConfig().companySlug));
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
