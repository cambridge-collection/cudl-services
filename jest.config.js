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
  testMatch: [
    '<rootDir>/(test|integration_test)/**/*.test.(ts|js)',
  ],
  testEnvironment: 'node',
  setupFilesAfterEnv: [
    // '<rootDir>/test/setup.ts'
  ]
};
