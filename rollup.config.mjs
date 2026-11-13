import typescript from 'rollup-plugin-typescript2';
import externalGlobals from 'rollup-plugin-external-globals';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import replace from '@rollup/plugin-replace';
import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';
import svgr from "@svgr/rollup";
import { readCompanyConfig } from './scripts/company.mjs';


// eslint-disable-next-line no-undef
const { npm_package_version: version } = process.env;
const { companySlug } = readCompanyConfig();

export default {
  input: 'src/main.tsx',
  output: {
    file: `lib/helio-extension-icons-${companySlug}-${version}.js`,
  },

  external: ['react', 'react/jsx-runtime', '@hmiproject/helio-sdk'],

  plugins: [
    replace({
      preventAssignment: true,

      'process.env.NODE_ENV': JSON.stringify('production'),
    }),

    nodeResolve({}),
    commonjs({}),
    json(),

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
