import eslint from '@eslint/js'
import { defineConfig } from 'eslint/config'
import prettier from 'eslint-config-prettier/flat'
import { createTypeScriptImportResolver } from 'eslint-import-resolver-typescript'
import * as importX from 'eslint-plugin-import-x'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import react from 'eslint-plugin-react'
import hooksPlugin from 'eslint-plugin-react-hooks'
import refreshPlugin from 'eslint-plugin-react-refresh'
import { configs as tsConfigs } from 'typescript-eslint'

// eslint-plugin-react types its flat configs behind an index signature.
const reactRecommended = react.configs.flat['recommended']
const reactJsxRuntime = react.configs.flat['jsx-runtime']
if (!reactRecommended || !reactJsxRuntime) {
  throw new Error('Expected eslint-plugin-react flat configs to exist')
}

export default defineConfig(
  {
    ignores: [
      'dist',
      'dev-dist',
      'coverage',
      'node_modules',
      'playwright-report',
      'test-results',
      'src/routeTree.gen.ts',
    ],
  },
  eslint.configs.recommended,
  tsConfigs.strictTypeChecked,
  tsConfigs.stylisticTypeChecked,
  reactRecommended,
  reactJsxRuntime,
  hooksPlugin.configs.flat.recommended,
  refreshPlugin.configs.vite,
  jsxA11y.flatConfigs.recommended,
  importX.flatConfigs.recommended,
  importX.flatConfigs.typescript,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    settings: {
      react: { version: 'detect' },
      'import-x/resolver-next': [
        createTypeScriptImportResolver({
          project: ['tsconfig.app.json', 'tsconfig.node.json'],
          noWarnOnMultipleProjects: true,
        }),
      ],
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      'import-x/order': ['error', { 'newlines-between': 'never', alphabetize: { order: 'asc' } }],
      // vite-plugin-pwa's runtime modules are virtual by design.
      'import-x/no-unresolved': ['error', { ignore: ['^virtual:'] }],
    },
  },
  {
    // TanStack Router file routes export `Route` (never a component), so this
    // rule can never pass there — the router plugin provides route HMR itself.
    // src/lib holds providers + hooks + helpers in one file by design.
    files: ['src/routes/**/*.tsx', 'src/lib/**'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
  {
    files: ['**/*.js'],
    extends: [tsConfigs.disableTypeChecked],
  },
  prettier,
)
