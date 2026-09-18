// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

// Frozen 2026-09-18: the FatSecret-era service files are being retired one
// consumer at a time into meal_app/api/<feature>/ (see api/README.md,
// "Migration map"). Nobody new may import them. The allowlist below is exactly
// the set of importers that existed at the freeze; shrink it in the same
// commit as each migration, and when it is empty delete the file it guards.
const FROZEN_MODULE_PATTERNS = [
  '**/services/mealAPI',
  '**/services/mealAPI.combos',
  '**/services/recommendation',
  '**/services/barcodeAPI',
  // Same modules when imported from inside services/ itself.
  './mealAPI',
  './mealAPI.combos',
  './recommendation',
  './barcodeAPI',
];

const FROZEN_MESSAGE =
  'Frozen FatSecret-era module. Use the feature folder under meal_app/api/ instead ' +
  '(api/README.md, "Migration map"). If you are migrating an existing consumer, ' +
  'remove it from FROZEN_IMPORT_ALLOWLIST in eslint.config.js in the same commit.';

const FROZEN_IMPORT_ALLOWLIST = [
  'components/addfoodmodal.tsx',
  'components/VoiceSearchModal.tsx',
  'app/(tabs)/meal/recipe/index.tsx',
  'app/(tabs)/meal/recipedetail.tsx',
  'app/(tabs)/meal/comboDetail.tsx',
  // The frozen files import each other; they are retired together.
  'services/mealAPI.tsx',
  'services/recommendation.ts',
  'services/mealAPI.combos.ts',
  'services/barcodeAPI.tsx',
];

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*'],
  },
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [{ group: FROZEN_MODULE_PATTERNS, message: FROZEN_MESSAGE }] },
      ],
    },
  },
  {
    files: FROZEN_IMPORT_ALLOWLIST,
    rules: { 'no-restricted-imports': 'off' },
  },
]);
