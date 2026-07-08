// Jest config scoped to the committed i18n "trust tests".
// These tests only read the locale JSON resource files, so no Babel/RN
// transform is needed — disabling transforms keeps them fast and hermetic.
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.js'],
  transform: {},
};
