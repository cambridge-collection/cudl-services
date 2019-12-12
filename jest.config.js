module.exports = {
  globals: {
    'ts-jest': {
      tsConfig: 'tsconfig.json'
    }
  },
  moduleFileExtensions: [
    'ts',
    'js',
    'json'
  ],
  transform: {
    '^.+\\.(ts|tsx)$': 'ts-jest'
  },
  testEnvironment: 'node',
  roots: [
    "<rootDir>/src/",
    "<rootDir>/test/",
    "<rootDir>/integration_test/"
  ],
  // The 5 second default is often not enough in slow CI environments
  testTimeout: 1000 * 30
};
