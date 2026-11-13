import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

const bannedMath = ['random', 'sin', 'cos', 'tan', 'atan', 'atan2', 'asin', 'acos', 'exp', 'log', 'pow', 'hypot', 'cbrt'].map(
  (p) => ({ object: 'Math', property: p, message: 'Non-deterministic across engines: generators must use gen/_lib trig tables / integer math.' }),
);

export default tseslint.config(
  { ignores: ['dist', 'node_modules'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
  {
    // Frozen, deterministic generator code: shared links depend on it bit-for-bit.
    files: ['src/gen/**/v*/**/*.ts'],
    rules: {
      'no-restricted-properties': ['error', ...bannedMath],
      'no-restricted-imports': ['error', {
        patterns: [{
          group: ['**/editor/**', '**/scene/**', '**/geom/**', '**/share/**', '**/ui/**', '**/catalog/**', '**/journey/**', '**/walk/**', '**/library/**', '**/registry', '**/model/*', '!**/model/schema'],
          message: 'Frozen generator versions may only import their own folder, gen/_lib/vN and model/schema types.',
        }],
      }],
      'no-restricted-syntax': ['error', { selector: "MemberExpression[object.name='Object'][property.name='keys']", message: 'Use explicitly sorted ids in generators.' }],
    },
  },
);
