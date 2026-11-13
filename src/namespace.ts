import { createNamespace } from '@hmiproject/helio-sdk';
import { companyNamespace } from './company';

export const namespace = createNamespace({
  // Derived from the company name in reverse domain notation
  // (https://en.wikipedia.org/wiki/Reverse_domain_name_notation),
  // e.g. "com.my-company.custom-icons". See scripts/company.mjs.
  name: companyNamespace,
});
