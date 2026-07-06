import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
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
  },
  {
    // Las API routes (Vercel Functions + dev server) y los archivos de
    // configuración corren en Node.
    files: ['api/**/*.js', 'vite.config.js', 'eslint.config.js', 'tailwind.config.js', 'postcss.config.js'],
    languageOptions: { globals: globals.node },
  },
  {
    // El entry point no es un límite de HMR (llama a createRoot); la regla
    // de react-refresh no aplica a los lazy() del router.
    files: ['src/frameworks/router/main.jsx'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },
])
