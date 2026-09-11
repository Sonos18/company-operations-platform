import { describe, expect, it } from 'vitest'
import { runC1CloudDevTests } from '../../../scripts/run-c1-cloud-dev-tests.mjs'

describe('C1 Cloud DEV runner', () => {
  it.each([
    ["begin;\nselect 1;\ncommit;\nrollback;", 'C1 SQL verification cannot commit'],
    ["begin;\nmigration repair;\nrollback;", 'C1 SQL contains a forbidden Cloud DEV operation'],
    ["begin;\nselect 'VQH';\nrollback;", 'C1 SQL cannot reference real VQH identifiers'],
  ])('rejects unsafe SQL before spawning: %s', (sql, message) => {
    let spawns = 0
    expect(() => runC1CloudDevTests({ files: [{ path: 'c1_foundation.test.sql', sql }], spawn: () => { spawns += 1 } })).toThrow(message)
    expect(spawns).toBe(0)
  })
})
