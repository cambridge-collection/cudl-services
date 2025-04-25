module.exports = {
  // the default jasmine runner ignores errors in teardown hooks
  // https://github.com/facebook/jest/issues/6692
  testRunner: 'jest-circus/runner',
  globals: {
    'ts-jest': {
      tsconfig: 'tsconfig.json',
      isolatedModules: true,
    },
  },
  moduleFileExtensions: ['ts', 'js', 'json'],
  transform: {
    '^.+\\.(ts|tsx)$': 'ts-jest',
  },
  testEnvironment: 'node',
  roots: ['<rootDir>/src/', '<rootDir>/test/', '<rootDir>/integration_test/'],
  // The 5 second default is often not enough in slow CI environments
  testTimeout: 1000 * 30,
  setupFilesAfterEnv: ['./test/custom-jest-matchers.ts', 'jest-extended'],
};
