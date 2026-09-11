import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { canonicalizeSourceText } from '../../helpers/canonical-source-text'

const requiredSql = "values (\n    v_tenant_id, v_company_id, 'opportunity.decision_authority', true, operator_id\n  )"

describe('canonicalizeSourceText', () => {
  it('preserves static-source assertions across LF and CRLF checkouts', () => {
    expect(canonicalizeSourceText(requiredSql)).toContain(requiredSql)
    expect(canonicalizeSourceText(requiredSql.replace(/\n/g, '\r\n'))).toContain(requiredSql)
    expect(canonicalizeSourceText(requiredSql.replace('true', 'false'))).not.toContain(requiredSql)
  })

  it('keeps canonical hashes stable across checkout EOLs but detects content changes', () => {
    const hash = (source: string) => createHash('sha256').update(canonicalizeSourceText(source)).digest('hex')

    expect(hash('select 1;\n')).toBe(hash('select 1;\r\n'))
    expect(hash('select 2;\n')).not.toBe(hash('select 1;\n'))
  })

  it('rejects bare carriage returns instead of silently changing source content', () => {
    expect(() => canonicalizeSourceText('select\r1;\n')).toThrow('bare carriage return')
  })
})
