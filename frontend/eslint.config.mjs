import js from '@eslint/js';
import globals from 'globals';
import reactPlugin from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import { defineConfig } from 'eslint/config';

export default defineConfig(
  {
    // 1. Global ignores must be a standalone object
    ignores: ['dist/**', 'coverage/**', 'eslint.config.mjs', 'vite.config.ts'],
  },

  // 2. Base & TypeScript Type-Aware Configs
  js.configs.recommended,
  // Temporarily disabled migrating to type-aware linting
  // ...tseslint.configs.recommendedTypeChecked,
  ...tseslint.configs.recommended,
  
  // 3. React Core & Hooks Configs
  reactPlugin.configs.flat.recommended,
  reactPlugin.configs.flat['jsx-runtime'], // Required for React 17+ (disables 'React must be in scope' errors)
  reactHooks.configs.flat.recommended,
  
  {
    files: ['**/*.{ts,tsx}'],
    // Configure Vite's Fast Refresh plugin
    extends: [reactRefresh.configs.vite],
    languageOptions: {
      ecmaVersion: 'latest', // Let Vite handle the browser target
      globals: {
        ...globals.browser,
      },
      parserOptions: {
        projectService: true, // Enables type-aware linting
        tsconfigRootDir: import.meta.dirname,
      },
    },
    settings: {
      react: {
        version: 'detect', // Tells eslint-plugin-react to automatically read your React version
      },
    },
    rules: {
      // Custom overrides for the frontend
      'react/prop-types': 'off', // We use TypeScript for prop validation
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-misused-promises': [
        'error',
        {
          // Crucial for React: allows passing async functions to onClick handlers
          checksVoidReturn: false, 
        },
      ],
    },
  },

  // 4. Relax strict rules for UI tests/mocks
  {
    files: ['**/*.spec.{ts,tsx}', 'test/**/*.{ts,tsx}'],
    extends: [tseslint.configs.disableTypeChecked],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },

  // 5. Prettier must always be last
  eslintPluginPrettierRecommended,
);