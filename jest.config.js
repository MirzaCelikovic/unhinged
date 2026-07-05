/**
 * Jest config scoped to Node-side unit tests (e.g. the Hinged flag wiring).
 * Uses ts-jest so no React Native / Expo runtime is required.
 */
module.exports = {
  // react-native pins jest-environment-node@29 and it hoists to the top of
  // node_modules, so the bare 'node' name resolves to the v29 environment whose
  // ModuleMocker lacks clearMocksOnScope() that jest-runtime@30 calls on
  // resetModules(). Resolve the version-matched (v30) environment via jest-runner
  // instead, which always ships the copy matching the installed jest.
  testEnvironment: require.resolve('jest-environment-node', {
    paths: [require.resolve('jest-runner')],
  }),
  roots: ['<rootDir>/lib'],
  testMatch: ['**/*.test.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { isolatedModules: true }],
  },
};
