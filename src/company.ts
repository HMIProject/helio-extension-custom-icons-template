// The company name is configured once in `company.config.json` in the project
// root (via `npm run setup`, the web interface `npm run ui`, or by hand).
// rollup.config.mjs derives all values from it (see scripts/company.mjs) and
// inserts them here at build time (declared in src/build-constants.d.ts).

export const companyName: string = __COMPANY_NAME__;
/** e.g. "com.my-company.custom-icons" */
export const companyNamespace: string = __COMPANY_NAMESPACE__;
