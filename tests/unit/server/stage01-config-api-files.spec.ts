import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '../../..')
const routeFiles = [
  'server/api/companies/[companyId]/stage-01/config/index.get.ts',
  'server/api/companies/[companyId]/stage-01/config/draft/index.post.ts',
  'server/api/companies/[companyId]/stage-01/config/draft/index.put.ts',
  'server/api/companies/[companyId]/stage-01/config/draft/index.delete.ts',
  'server/api/companies/[companyId]/stage-01/config/draft/publish.post.ts',
]

describe('Stage 01 configuration API files', () => {
  it('contains every approved company-scoped config endpoint as a thin adapter', () => {
    for (const file of routeFiles) {
      const path = resolve(root, file)
      expect(existsSync(path), file).toBe(true)
      const source = readFileSync(path, 'utf8')
      expect(source, file).toContain('runApiRoute')
      expect(source, file).toContain('createSupabaseStage01ConfigRoutes')
      expect(source, file).not.toMatch(/\.rpc\(|service[_-]?role|createSupabaseAdminClient/u)
    }
  })
})
