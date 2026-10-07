import { expect, it } from 'vitest'
import { workflowMoneySchema } from '../../../shared/schemas/costs/cost-workflow'
it('rejects amounts outside PostgreSQL numeric(20,4) instead of failing during posting', () => {
 expect(workflowMoneySchema.safeParse('9999999999999999.9999').success).toBe(true)
 expect(workflowMoneySchema.safeParse('10000000000000000').success).toBe(false)
})
