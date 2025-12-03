/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    // Handle .js imports in TypeScript (ESM style)
    '^(\\.{1,2}/.*)\\.js$': '$1'
  },
  // Transform @noble packages which use ESM
  transformIgnorePatterns: [
    'node_modules/(?!(@noble|snarkjs)/)'
  ],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      useESM: true,
      tsconfig: {
        module: 'ESNext',
        moduleResolution: 'node',
        esModuleInterop: true,
        allowSyntheticDefaultImports: true
      }
    }]
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/index.ts'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  verbose: true,
  // Increase timeout for async operations
  testTimeout: 30000,
  // Setup file for BigInt serialization
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts']
};
