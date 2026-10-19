import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/** Browser code: the phone app and its design system. */
const BROWSER_SOURCE = ['apps/mobile-web/src/**/*.{ts,tsx}', 'packages/ui/src/**/*.{ts,tsx}'];

export default defineConfig(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/dev-dist/**',
      '**/coverage/**',
      '**/.wrangler/**',
      'playwright-report/**',
      'test-results/**',
      'blob-report/**',
    ],
  },
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
      globals: { ...globals.node },
    },
    rules: {
      '@typescript-eslint/restrict-template-expressions': [
        'error',
        {
          allowNumber: true,
          allowAny: false,
          allowBoolean: false,
          allowNullish: false,
          allowRegExp: false,
          allowNever: false,
        },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',
      eqeqeq: ['error', 'always'],
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },
  {
    // React: the rules of hooks (and the React Compiler checks) for every hook and component.
    files: BROWSER_SOURCE,
    extends: [reactHooks.configs.flat['recommended-latest']],
    languageOptions: {
      globals: { ...globals.browser },
    },
    rules: {
      'react-hooks/exhaustive-deps': 'error',
    },
  },
  {
    // Fast refresh in `vite dev` works only when a .tsx file exports components (and constants).
    files: ['apps/mobile-web/src/**/*.tsx', 'packages/ui/src/**/*.tsx'],
    ignores: ['**/*.test.tsx'],
    plugins: { 'react-refresh': reactRefresh },
    rules: {
      'react-refresh/only-export-components': ['error', { allowConstantExport: true }],
    },
  },
  {
    files: ['**/*.js', '**/*.mjs', '**/*.cjs'],
    extends: [tseslint.configs.disableTypeChecked],
  },
);
