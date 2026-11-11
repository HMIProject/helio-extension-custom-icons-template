import { createNamespace } from '@hmiproject/helio-sdk';
import { namespaceDomain } from './company';

export const namespace = createNamespace({
  // `namespaceDomain` (set in company.config.json) should match your company's
  // domain name in https://en.wikipedia.org/wiki/Reverse_domain_name_notation
  name: `${namespaceDomain}.custom-icons`,
});
