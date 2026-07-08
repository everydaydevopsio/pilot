/** @type {import('jest').Config} */
export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/e2e/mcp/**/*.test.ts'],
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^(\\.{1,2}/.*)\\.js$': '$1'
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: './tsconfig.test.json'
      }
    ]
  },
  maxWorkers: 1,
  testTimeout: 60000,
  globalSetup: '<rootDir>/e2e/mcp/setup.ts',
  globalTeardown: '<rootDir>/e2e/mcp/teardown.ts'
};
