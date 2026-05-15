// @ts-check
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import tsParser from "@typescript-eslint/parser";
import prettier from "eslint-config-prettier";
import graphileExport from "eslint-plugin-graphile-export";
import importPlugin from "eslint-plugin-import";
import jest from "eslint-plugin-jest";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import tsdoc from "eslint-plugin-tsdoc";
import graphql from "@graphql-eslint/eslint-plugin";

export default tseslint.config(
  {
    ignores: ["node_modules/**", "dist/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  // Import plugin recommended configs
  {
    plugins: {
      import: importPlugin,
    },
    rules: {
      ...importPlugin.configs.errors.rules,
      ...importPlugin.configs.typescript.rules,
    },
    settings: {
      "import/resolver": {
        node: true,
        typescript: true,
      },
    },
  },
  // Graphile Export plugin recommended config
  graphileExport.configs.recommended,
  prettier,
  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    plugins: {
      jest,
      graphql,
      tsdoc,
      "simple-import-sort": simpleImportSort,
      import: importPlugin,
    },
    languageOptions: {
      globals: {
        jasmine: false,
        ...Object.fromEntries(
          Object.entries({
            __dirname: false,
            __filename: false,
            Buffer: false,
            clearImmediate: false,
            clearInterval: false,
            clearTimeout: false,
            console: false,
            exports: true,
            global: false,
            Intl: false,
            module: false,
            process: false,
            queueMicrotask: false,
            require: false,
            setImmediate: false,
            setInterval: false,
            setTimeout: false,
            TextDecoder: false,
            TextEncoder: false,
            URL: false,
            URLSearchParams: false,
          })
        ),
      },
    },
    rules: {
      "@typescript-eslint/ban-ts-comment": "off",
      "@typescript-eslint/ban-ts-ignore": "off",
      "@typescript-eslint/camelcase": "off",
      "@typescript-eslint/no-empty-function": "off",
      "@typescript-eslint/no-empty-interface": "off",
      "@typescript-eslint/no-namespace": "off",
      "@typescript-eslint/no-use-before-define": "off",
      "@typescript-eslint/no-var-requires": "off",
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/consistent-type-imports": "error",
      "no-confusing-arrow": "off",
      "no-else-return": "off",
      "no-underscore-dangle": "off",
      "no-restricted-syntax": "off",
      "no-await-in-loop": "off",
      "jest/no-focused-tests": "error",
      "jest/no-identical-title": "error",
      "@typescript-eslint/no-empty-object-type": [
        "error",
        { allowInterfaces: "always" },
      ],

      // Rules that we should enable:
      "@typescript-eslint/no-inferrable-types": "warn",
      "no-inner-declarations": "warn",

      // Rules we've disabled for now because they're so noisy
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrors: "none",
          args: "after-used",
          ignoreRestSiblings: true,
        },
      ],

      "simple-import-sort/imports": "error",
      "simple-import-sort/exports": "error",
      "sort-imports": "off",
      "import/order": "off",

      "import/extensions": [
        "error",
        "ignorePackages",
        { ts: "never", tsx: "never" },
      ],
      "import/no-deprecated": "warn",

      "prefer-spread": "off",

      "no-duplicate-imports": "off",
      "import/no-duplicates": "error",
    },
  },
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser: tsParser,
    },
    rules: {
      "no-dupe-class-members": "off",
      "no-undef": "off",
      "import/no-unresolved": "off",
      "tsdoc/syntax": "error",
    },
  }
);
