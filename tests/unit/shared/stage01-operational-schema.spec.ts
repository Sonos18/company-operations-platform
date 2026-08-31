import { describe, expect, it } from 'vitest'
import { stage01OperationalDetailSchema } from '../../../shared/schemas/stage01-operational'

describe('Stage 01 operational detail schema', () => {
  // Defect caught: an operational response could omit the bound configuration, contacts, or decision-cycle history.
  it('requires the operational read-model additions beyond the legacy detail response', () => {
    expect(stage01OperationalDetailSchema.safeParse({}).success).toBe(false)
    expect(stage01OperationalDetailSchema.shape.configuration).toBeDefined()
    expect(stage01OperationalDetailSchema.shape.relatedContacts).toBeDefined()
    expect(stage01OperationalDetailSchema.shape.decisionCycles).toBeDefined()
  })
})
