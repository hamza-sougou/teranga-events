module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: 'tsconfig.json',
    tsconfigRootDir: __dirname,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint'],
  // No Prettier integration here on purpose: this codebase's actual style
  // (single quotes throughout) never matched Prettier's own defaults, and
  // no .prettierrc exists to reconcile them — wiring plugin:prettier/recommended
  // would flag ~700 pre-existing lines across nearly every file as "errors"
  // with no relation to this change. TypeScript-aware rules only for now;
  // formatting can be tackled separately and deliberately if wanted.
  extends: ['plugin:@typescript-eslint/recommended'],
  env: {
    node: true,
    jest: true,
  },
  ignorePatterns: ['dist', 'node_modules'],
  rules: {
    '@typescript-eslint/interface-name-prefix': 'off',
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-unused-vars': [
      'error',
      // ignoreRestSiblings: `const { secret, ...safe } = obj` to strip a
      // field is idiomatic here (AuthService.sanitizeUser). caughtErrors
      // 'none': plenty of `catch (error) { … }` blocks deliberately don't
      // inspect the error (ServiceUnavailableException wrapping, etc.).
      { argsIgnorePattern: '^_', ignoreRestSiblings: true, caughtErrors: 'none' },
    ],
  },
};
