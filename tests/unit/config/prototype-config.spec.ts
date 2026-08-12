import { describe, expect, it } from 'vitest'
import { PROTOTYPE_CONFIG } from '../../../app/config/prototype'

describe('PROTOTYPE_CONFIG', () => {
  it('keeps the prototype advisory, mock-only, and scoped to VQH', () => {
    expect(PROTOTYPE_CONFIG).toEqual({
      dataSource: 'mock',
      enforcementMode: 'advisory',
      locale: 'vi-VN',
      initialTenantId: 'tenant-vqh',
      initialCompanyId: 'company-vqh',
    })
  })
})
