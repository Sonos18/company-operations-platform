import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('C1 ordinary detail publish hash correction', () => {
  it('canonicalizes the receipt payload before converting it to bytes', () => {
    const directory = resolve(process.cwd(), 'supabase/migrations')
    const names = readdirSync(directory).filter(name => name.endsWith('_c1_ordinary_cost_detail_publish_hash_fix.sql'))
    expect(names).toHaveLength(1)
    const sql = readFileSync(resolve(directory, names[0]!), 'utf8')
    expect(sql).toContain('private.c1_jsonb_canonical_text(')
    expect(sql).not.toMatch(/convert_to\(jsonb_build_object/iu)
  })
})
