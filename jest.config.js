module.exports = {
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testMatch: [
    '**/__tests__/**/*.test.js',
    '**/?(*.)+(spec|test).js'
  ],
  moduleFileExtensions: ['js', 'jsx', 'json'],
  transform: {
    '^.+\\.jsx?$': 'babel-jest'
  },
  moduleNameMapper: {
    '^../src/(.*)$': '<rootDir>/src/$1',
    '^../utils/(.*)$': '<rootDir>/utils/$1',
    '^../components/(.*)$': '<rootDir>/components/$1'
  },
  collectCoverageFrom: [
    'src/**/*.js',
    'utils/**/*.js',
    '!**/__tests__/**',
    '!**/node_modules/**'
  ],
  coverageReporters: ['text', 'lcov'],
  verbose: true,
  testTimeout: 10000
};
