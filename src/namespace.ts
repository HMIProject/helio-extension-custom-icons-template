import { createNamespace } from '@hmiproject/helio-sdk';
import { companyNamespace } from './company';

export const namespace = createNamespace({
  // The company domain in reverse domain notation
  // (https://en.wikipedia.org/wiki/Reverse_domain_name_notation):
  // "my-company.com" -> "com.my-company.custom-icons". See scripts/company.mjs.
  name: companyNamespace,
});
