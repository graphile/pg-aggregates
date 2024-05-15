module.exports = {
  root: true,
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/eslint-recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:import/errors",
    "plugin:import/typescript",
    "plugin:graphile-export/recommended",
    "prettier",
  ],
  plugins: [
    "jest",
    "graphql",
    "tsdoc",
    "simple-import-sort",
    "import",
    "graphile-export",
  ],
  env: {
    jest: true,
    node: true,
    es6: true,
  },
  globals: {
    jasmine: false,
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
    "@typescript-eslint/consistent-type-imports": "error",
    "no-confusing-arrow": 0,
    "no-else-return": 0,
    "no-underscore-dangle": 0,
    "no-restricted-syntax": 0,
    "no-await-in-loop": 0,
    "jest/no-focused-tests": 2,
    "jest/no-identical-title": 2,
    "tsdoc/syntax": 2,

    // Rules that we should enable:
    "@typescript-eslint/no-inferrable-types": "warn",
    "no-inner-declarations": "warn",

    // Rules we've disabled for now because they're so noisy (but we should really address)
    "@typescript-eslint/no-explicit-any": "off",
    "@typescript-eslint/no-non-null-assertion": "off",
    "@typescript-eslint/no-unused-vars": [
      "error",
      {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        args: "after-used",
        ignoreRestSiblings: true,
      },
    ],

    /*
     * simple-import-sort seems to be the most stable import sorting currently,
     * disable others
     */
    "simple-import-sort/imports": "error",
    "simple-import-sort/exports": "error",
    "sort-imports": "off",
    "import/order": "off",

    "import/extensions": ["error", "ignorePackages"],
    "import/no-deprecated": "warn",

    // Apply has been more optimised than spread, use whatever feels right.
    "prefer-spread": "off",

    // note you must disable the base rule as it can report incorrect errors
    "no-duplicate-imports": "off",
    "import/no-duplicates": "off",
  },
  overrides: [
    // Rules for TypeScript only
    {
      files: ["*.ts", "*.tsx"],
      parser: "@typescript-eslint/parser",
      rules: {
        "no-dupe-class-members": "off",
        "no-undef": "off",
        // This rule doesn't understand import of './js'
        "import/no-unresolved": "off",
      },
    },
  ],
};
