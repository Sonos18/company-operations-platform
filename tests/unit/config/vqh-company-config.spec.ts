import { describe, expect, it } from 'vitest'
import { VQH_COMPANY_CONFIG } from '../../../app/config/companies/vqh.company'

describe('VQH company configuration', () => {
  it('matches the independently versioned seven-department catalog', () => {
    expect(VQH_COMPANY_CONFIG.departments).toEqual([
      { code: 'BLD', name: 'Ban lãnh đạo' },
      { code: 'HR', name: 'Phòng Nhân sự' },
      { code: 'TECH', name: 'Phòng Kỹ thuật' },
      { code: 'DESIGN', name: 'Phòng Thiết kế' },
      { code: 'CONSTRUCTION', name: 'Thi công – Hiện trường' },
      { code: 'PROCUREMENT', name: 'Vật tư – Mua hàng' },
      { code: 'ACCOUNTING', name: 'Phòng Kế toán' },
    ])
  })
})
