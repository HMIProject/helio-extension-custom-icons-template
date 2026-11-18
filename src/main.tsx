import { createLibraryExtension } from '@hmiproject/helio-sdk';
import { companyName } from './company';
import { icons } from './icons';


export default createLibraryExtension({
  name: `${companyName} Icons`,
  description: `Material UI Icons used in ${companyName} HMI`,
  // From package.json, inserted by rollup.config.mjs.
  version: __EXTENSION_VERSION__,
  author: companyName,

  minimumRequiredHelioVersion: '25.4.0',

  icons,
});
