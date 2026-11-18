import typescript from 'rollup-plugin-typescript2';
import externalGlobals from 'rollup-plugin-external-globals';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import replace from '@rollup/plugin-replace';
import commonjs from '@rollup/plugin-commonjs';
import svgr from "@svgr/rollup";
import { outputFileName, readCompanyConfig, readPackageVersion } from './scripts/company.mjs';
import { defaultSvgDir, generateIconsFile } from './scripts/icons.mjs';


// Everything is derived from `companyDomain` (and the optional `displayName`)
// in company.config.json, see scripts/company.mjs.
const { companyName, companySlug, namespace } = readCompanyConfig();
const version = readPackageVersion();

/**
 * Regenerates src/icons.tsx from src/svg at the start of every build, so
 * `npm run build`, `npm run dev` and CI never use an outdated icon list.
 */
function generateIcons() {
  return {
    name: 'generate-icons',
    buildStart() {
      this.addWatchFile(defaultSvgDir);
      const count = generateIconsFile();
      this.info(`Generated src/icons.tsx with ${count} icon(s).`);
    },
  };
}

export default {
  input: 'src/main.tsx',
  output: {
    file: outputFileName(companySlug, version),
  },

  external: ['react', 'react/jsx-runtime', '@hmiproject/helio-sdk'],

  plugins: [
    generateIcons(),
    replace({
      preventAssignment: true,

      'process.env.NODE_ENV': JSON.stringify('production'),
      // Used in src/company.ts
      __COMPANY_NAME__: JSON.stringify(companyName),
      __COMPANY_NAMESPACE__: JSON.stringify(namespace),
      // Used in src/main.tsx
      __EXTENSION_VERSION__: JSON.stringify(version),
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
