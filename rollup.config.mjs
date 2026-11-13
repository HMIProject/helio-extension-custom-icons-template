import typescript from 'rollup-plugin-typescript2';
import externalGlobals from 'rollup-plugin-external-globals';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import replace from '@rollup/plugin-replace';
import commonjs from '@rollup/plugin-commonjs';
import svgr from "@svgr/rollup";
import { outputFileName, readCompanyConfig } from './scripts/company.mjs';


// Everything is derived from `companyName` in company.config.json.
const { companyName, companySlug, namespace } = readCompanyConfig();

export default {
  input: 'src/main.tsx',
  output: {
    file: outputFileName(companySlug),
  },

  external: ['react', 'react/jsx-runtime', '@hmiproject/helio-sdk'],

  plugins: [
    replace({
      preventAssignment: true,

      'process.env.NODE_ENV': JSON.stringify('production'),
      // Used in src/company.ts
      __COMPANY_NAME__: JSON.stringify(companyName),
      __COMPANY_NAMESPACE__: JSON.stringify(namespace),
    }),

    nodeResolve({}),
    commonjs({}),

    svgr({
      icon: true,
      typescript: true,
    }),

    typescript({}),
    externalGlobals({
      'react/jsx-runtime': '$',
      '@hmiproject/helio-sdk': 'HELIO.v1',
      react: 'React',
    }),
  ],
};
