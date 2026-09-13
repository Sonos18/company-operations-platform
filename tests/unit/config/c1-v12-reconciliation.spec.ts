import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const path = (...parts: string[]) => resolve(root, ...parts)

describe('C1 v1.2 P2.0 reconciliation', () => {
  it('keeps only the P1 C1 fixture and removes the superseded runtime-upload path', () => {
    const runner = readFileSync(path('scripts/run-c1-cloud-dev-tests.mjs'), 'utf8')
    const packageJson = readFileSync(path('package.json'), 'utf8')
    expect(runner).toContain("const allowlist = ['c1_foundation.test.sql']")
    expect(packageJson).not.toContain('"xlsx"')
    for (const target of [
      'supabase/migrations/20260912062227_taskovia_c1_sources_files.sql',
      'supabase/tests/database/c1/c1_sources_files_security.test.sql',
      'supabase/tests/database/c1/c1_sources_files_commands.test.sql',
      'server/features/files/file.service.ts',
      'server/features/files/xlsx-preview.service.ts',
      'app/components/costs/SourceWizard.vue',
    ]) expect(existsSync(path(target))).toBe(false)
  })
})
