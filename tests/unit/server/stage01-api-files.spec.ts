import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '../../..')
const routeFiles = [
  'server/api/companies/[companyId]/opportunities/index.get.ts',
  'server/api/companies/[companyId]/opportunities/index.post.ts',
  'server/api/companies/[companyId]/opportunities/[opportunityId].get.ts',
  'server/api/companies/[companyId]/opportunities/[opportunityId].patch.ts',
  'server/api/companies/[companyId]/opportunities/[opportunityId]/stage-01.get.ts',
  'server/api/companies/[companyId]/opportunities/[opportunityId]/workflow.get.ts',
  'server/api/companies/[companyId]/contacts/index.post.ts',
  'server/api/companies/[companyId]/contacts/[contactId].patch.ts',
  'server/api/companies/[companyId]/contacts/[contactId]/methods/index.post.ts',
  'server/api/companies/[companyId]/contacts/[contactId]/methods/[methodId].patch.ts',
  'server/api/companies/[companyId]/opportunities/[opportunityId]/contacts/index.post.ts',
  'server/api/companies/[companyId]/opportunities/[opportunityId]/primary-contact.post.ts',
  'server/api/companies/[companyId]/opportunities/[opportunityId]/contacts/[opportunityContactId]/end.post.ts',
  'server/api/companies/[companyId]/opportunities/[opportunityId]/scopes/index.post.ts',
  'server/api/companies/[companyId]/opportunities/[opportunityId]/scopes/[scopeId]/retire.post.ts',
  'server/api/companies/[companyId]/opportunities/[opportunityId]/referrers/index.post.ts',
  'server/api/companies/[companyId]/opportunities/[opportunityId]/primary-referrer.post.ts',
  'server/api/companies/[companyId]/opportunities/[opportunityId]/referrers/[referrerId]/end.post.ts',
  'server/api/companies/[companyId]/opportunities/[opportunityId]/intake-records/index.post.ts',
  'server/api/companies/[companyId]/opportunities/[opportunityId]/intake-records/[recordId]/corrections.post.ts',
  'server/api/companies/[companyId]/opportunities/[opportunityId]/duplicate-concerns/index.post.ts',
  'server/api/companies/[companyId]/opportunities/[opportunityId]/duplicate-concerns/[concernId]/resolve.post.ts',
  'server/api/companies/[companyId]/opportunities/[opportunityId]/invalidate.post.ts',
  'server/api/companies/[companyId]/opportunities/[opportunityId]/restore.post.ts',
  'server/api/companies/[companyId]/workflow-nodes/[nodeExecutionId]/start.post.ts',
  'server/api/companies/[companyId]/workflow-nodes/[nodeExecutionId]/complete.post.ts',
  'server/api/companies/[companyId]/workflow-nodes/[nodeExecutionId]/reopen.post.ts',
  'server/api/companies/[companyId]/workflow-nodes/[nodeExecutionId]/revalidate.post.ts',
  'server/api/companies/[companyId]/workflow-nodes/[nodeExecutionId]/assignments/index.post.ts',
  'server/api/companies/[companyId]/workflow-assignments/[assignmentId]/end.post.ts',
  'server/api/companies/[companyId]/workflow-nodes/[nodeExecutionId]/blockers/index.post.ts',
  'server/api/companies/[companyId]/workflow-blockers/[blockerId]/resolve.post.ts',
  'server/api/companies/[companyId]/opportunities/[opportunityId]/stage-01/evaluations/[criterionKey]/revisions.post.ts',
  'server/api/companies/[companyId]/opportunities/[opportunityId]/stage-01/recommendations/index.post.ts',
  'server/api/companies/[companyId]/opportunities/[opportunityId]/stage-01/clarification-returns/index.post.ts',
  'server/api/companies/[companyId]/opportunities/[opportunityId]/stage-01/final-decision.post.ts',
  'server/api/companies/[companyId]/opportunities/[opportunityId]/stage-01/reactivate.post.ts',
]

describe('Stage 01 API file matrix', () => {
  it('contains every approved explicit route as a thin adapter', () => {
    for (const file of routeFiles) {
      const path = resolve(root, file)
      expect(existsSync(path), file).toBe(true)
      const source = readFileSync(path, 'utf8')
      expect(source, file).toContain('runApiRoute')
      expect(source, file).not.toMatch(/service[_-]?role|createSupabaseAdminClient/u)
    }
  })
})
