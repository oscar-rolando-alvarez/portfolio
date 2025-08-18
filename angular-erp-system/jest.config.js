const { pathsToModuleNameMapper } = require('ts-jest');
const { compilerOptions } = require('./tsconfig');

module.exports = {
  preset: 'jest-preset-angular',
  setupFilesAfterEnv: ['<rootDir>/setup-jest.ts'],
  globalSetup: 'jest-preset-angular/global-setup',
  testMatch: ['**/+(*.)+(spec).+(ts)'],
  collectCoverageFrom: [
    'src/app/**/*.ts',
    '!src/app/**/*.spec.ts',
    '!src/app/**/*.module.ts',
    '!src/app/**/*.interface.ts',
    '!src/app/**/*.model.ts',
    '!src/app/**/*.type.ts'
  ],
  coverageReporters: ['html', 'text-summary', 'lcov'],
  coverageDirectory: 'coverage',
  moduleNameMapper: pathsToModuleNameMapper(compilerOptions.paths || {}, {
    prefix: '<rootDir>/'
  }),
  transformIgnorePatterns: [
    'node_modules/(?!.*\\.mjs$|@angular|@ngrx)'
  ]
};