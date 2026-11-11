import { createLibraryExtension } from '@hmiproject/helio-sdk';
import { companyName } from './company';
import { icons } from './icons';


export default createLibraryExtension({
  name: `${companyName} Icons`,
  description: `Material UI Icons used in ${companyName} HMI`,
  version: '1.0.0',
  author: companyName,

  minimumRequiredHelioVersion: '25.4.0',

  icons,
});
