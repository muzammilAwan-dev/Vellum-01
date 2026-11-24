import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'tools']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      // Components are used as <Name />, which older ESLint versions do not count as a use,
      // so every component import was reported as unused. This is the Vite template's rule;
      // it still reports unused lowercase variables, imports and parameters.
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]', argsIgnorePattern: '^[A-Z_]' }],
    },
  },
  {
    // shadcn-style primitives export their `cva` variants next to the component
    // (buttonVariants, badgeVariants); they never hold state, so Fast Refresh still works.
    files: ['src/components/ui/**/*.{js,jsx}'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },
  {
    // The integration suite runs in plain Node.
    files: ['tests/**/*.js'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
])
