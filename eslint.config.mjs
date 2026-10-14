// Shared config for packages/ and connectors/; apps/web keeps its own.
// Existing violations are grandfathered in eslint-suppressions.json; prune with
// pnpm lint:code --prune-suppressions, and regenerate only with reviewer agreement.
import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['apps/**', 'e2e/**', '**/dist/**', '**/node_modules/**', '**/.expo/**', '**/coverage/**'] },
  {
    files: ['packages/**/*.{ts,tsx,js,mjs,cjs}', 'connectors/**/*.{ts,tsx,js,mjs,cjs}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    plugins: { 'react-hooks': reactHooks },
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    linterOptions: { reportUnusedDisableDirectives: 'off' },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_', varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_', destructuredArrayIgnorePattern: '^_',
      }],
    },
  },
);
