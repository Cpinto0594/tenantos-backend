import type { Config } from 'jest';

/**
 * Jest harness.
 *
 * **The suite is currently empty** — the project ships with the runner
 * configured and nothing to run. `npm test` therefore passes trivially; treat a
 * green test step in CI as "the harness works", not as evidence the code does.
 *
 * Adding a spec requires no configuration: drop a `*.spec.ts` next to the file
 * it covers and it is picked up. The layering is designed to make that cheap —
 * the domain has no framework imports and the application layer depends on
 * repository *interfaces*, so use cases can be exercised with in-memory
 * doubles, no Postgres and no Nest container.
 *
 * Once specs exist, re-enable `coverageThreshold` (see the commented block) and
 * ratchet it upward from whatever the suite actually clears.
 */

/**
 * Path aliases are duplicated from tsconfig.json rather than imported from it.
 * Importing needs `resolveJsonModule`, and ts-node parses the file as strict
 * JSON — which chokes on the comments that make tsconfig readable. Two short
 * lists that must agree beat one that breaks the runner.
 */
const moduleNameMapper = {
  '^@app/(.*)$': '<rootDir>/src/app/$1',
  '^@modules/(.*)$': '<rootDir>/src/modules/$1',
  '^@domain/(.*)$': '<rootDir>/src/domain/$1',
  '^@application/(.*)$': '<rootDir>/src/application/$1',
  '^@infrastructure/(.*)$': '<rootDir>/src/infrastructure/$1',
  '^@shared/(.*)$': '<rootDir>/src/shared/$1',
};

const config: Config = {
  rootDir: '.',
  testEnvironment: 'node',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }],
  },
  moduleFileExtensions: ['js', 'json', 'ts'],
  moduleNameMapper,
  clearMocks: true,
  restoreMocks: true,
  // Without this an empty suite is a failure, and CI would be red from day one
  // for a reason that has nothing to do with the code.
  passWithNoTests: true,

  /**
   * Scoped to the layers unit tests are *meant* to cover: the domain, the use
   * cases, and the framework-free helpers.
   *
   * Controllers, Prisma repositories and the bootstrap are excluded on purpose.
   * Unit-testing them means asserting against mocks of Nest and Prisma, which
   * passes whether or not the code works; they belong in an e2e suite running
   * against real Postgres and Redis.
   */
  collectCoverageFrom: [
    'src/domain/**/*.ts',
    'src/application/**/*.ts',
    'src/shared/http/**/*.ts',
    'src/shared/dto/**/*.ts',
    'src/infrastructure/config/env.schema.ts',
    '!src/**/*.module.ts',
    '!src/**/index.ts',
    '!src/**/*.port.ts',
    '!src/**/*.ports.ts',
  ],
  coverageDirectory: '<rootDir>/coverage',
  coverageReporters: ['text-summary', 'lcov', 'json-summary'],

  // Enable once specs exist. Set each number to what the suite actually clears
  // and ratchet upward — never lower one to turn a red build green.
  //
  // coverageThreshold: {
  //   global: { statements: 45, branches: 34, functions: 52, lines: 46 },
  //   './src/domain/': { statements: 88, branches: 80, functions: 85, lines: 88 },
  // },
};

export default config;
