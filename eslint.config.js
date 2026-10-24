// Lint: correctness rules (eslint:recommended) with the globals each part of the app runs with. Rules that only flag
// style in the existing code (unused names, empty catch blocks kept on purpose, assignments overwritten later) are
// warnings there and errors in the feasibility code written for this branch.
import js from '@eslint/js';
import globals from 'globals';

const NEW = ['lib/feasibility/**', 'lib/reports/feasibility.mjs', 'api/feasibility.js', 'src/workspace.js', 'scripts/**', 'test/fz-*.mjs'];
export default [
  { ignores: ['public/**', 'node_modules/**', 'lib/vendor/**', 'test/.data/**', 'supabase/functions/**', '.claude/**', 'docs/**'] },
  js.configs.recommended,
  {
    languageOptions: { ecmaVersion: 2025, sourceType: 'module', globals: { ...globals.node, ...globals.browser, maplibregl: 'readonly', d3: 'readonly', XLSX: 'readonly' } },
    rules: {
      'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none', ignoreRestSiblings: true }],
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'no-useless-assignment': 'warn',
      'preserve-caught-error': 'off',
      'no-control-regex': 'off' // (the PDF and text sanitizers strip control characters on purpose)
    }
  },
  { files: ['src/sw.js'], languageOptions: { globals: { ...globals.serviceworker } } },
  { files: NEW, rules: { 'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none', ignoreRestSiblings: true }], 'no-empty': 'error', 'no-useless-assignment': 'error' } }
];
