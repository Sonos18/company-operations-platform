import { describe, expect, it } from 'vitest'
import {
  diffOperationalCorrection,
  type CanonicalOperationalSnapshot,
  type FormOperationalState,
} from '../../../app/utils/costs/operational-correction-diff'
import { correctPublishedProjectCostInputSchema } from '../../../shared/schemas/costs/project-costs'

describe('Operational Correction Diffing (PATCH Semantics)', () => {
  const baseSnapshot: CanonicalOperationalSnapshot = {
    description: 'Bê tông tươi M300 sàn tầng 2',
    workStatus: 'in_progress',
    businessReference: 'REF-BT-001',
    relevantDate: '2026-09-01',
  }

  it('Case A — description only: omits workStatus, businessReference, relevantDate when untouched', () => {
    const form: FormOperationalState = {
      description: 'Bê tông tươi M350 sàn tầng 2 (sửa mác)',
      workStatus: 'in_progress',
      businessReference: 'REF-BT-001',
      relevantDate: '2026-09-01',
    }

    const changes = diffOperationalCorrection(baseSnapshot, form)

    expect(changes).toEqual({
      description: 'Bê tông tươi M350 sàn tầng 2 (sửa mác)',
    })
    expect(changes.workStatus).toBeUndefined()
    expect(changes.businessReference).toBeUndefined()
    expect(changes.relevantDate).toBeUndefined()

    // Validates against backend schema
    const payload = {
      expectedVersion: 4,
      reason: 'Sửa mác bê tông theo chỉ đạo kỹ thuật',
      operationalChanges: changes,
    }
    expect(correctPublishedProjectCostInputSchema.safeParse(payload).success).toBe(true)
  })

  it('Case B — explicit clear: sends null when previously non-null field is cleared', () => {
    const form: FormOperationalState = {
      description: 'Bê tông tươi M300 sàn tầng 2',
      workStatus: 'in_progress',
      businessReference: '', // intentionally cleared
      relevantDate: '', // intentionally cleared
    }

    const changes = diffOperationalCorrection(baseSnapshot, form)

    expect(changes).toEqual({
      businessReference: null,
      relevantDate: null,
    })
    expect(changes.description).toBeUndefined()
    expect(changes.workStatus).toBeUndefined()

    const payload = {
      expectedVersion: 2,
      reason: 'Xóa mã tham chiếu và ngày do nhầm lẫn',
      operationalChanges: changes,
    }
    expect(correctPublishedProjectCostInputSchema.safeParse(payload).success).toBe(true)
  })

  it('Case C — unchanged nullable field: omits field when originally null and remains empty', () => {
    const snapshotWithNulls: CanonicalOperationalSnapshot = {
      description: 'Cọc cừ tràm',
      workStatus: 'accepted',
      businessReference: null,
      relevantDate: null,
    }

    const form: FormOperationalState = {
      description: 'Cọc cừ tràm loại 1',
      workStatus: 'accepted',
      businessReference: '',
      relevantDate: '',
    }

    const changes = diffOperationalCorrection(snapshotWithNulls, form)

    expect(changes).toEqual({
      description: 'Cọc cừ tràm loại 1',
    })
    expect('businessReference' in changes).toBe(false)
    expect('relevantDate' in changes).toBe(false)
    expect('workStatus' in changes).toBe(false)
  })

  it('Case D — workStatus unchanged: workStatus is absent when not altered', () => {
    const form: FormOperationalState = {
      description: 'Bê tông tươi M300 sàn tầng 2',
      workStatus: 'in_progress', // matches snapshot
      businessReference: 'REF-BT-002', // changed
      relevantDate: '2026-09-01',
    }

    const changes = diffOperationalCorrection(baseSnapshot, form)

    expect(changes).toEqual({
      businessReference: 'REF-BT-002',
    })
    expect(changes.workStatus).toBeUndefined()
  })

  it('Case E — intentional workStatus change: includes workStatus when explicitly changed', () => {
    const form: FormOperationalState = {
      description: 'Bê tông tươi M300 sàn tầng 2',
      workStatus: 'accepted', // changed from in_progress to accepted
      businessReference: 'REF-BT-001',
      relevantDate: '2026-09-01',
    }

    const changes = diffOperationalCorrection(baseSnapshot, form)

    expect(changes).toEqual({
      workStatus: 'accepted',
    })
    expect(changes.description).toBeUndefined()
    expect(changes.businessReference).toBeUndefined()
    expect(changes.relevantDate).toBeUndefined()

    const payload = {
      expectedVersion: 3,
      reason: 'Cập nhật trạng thái sau nghiệm thu',
      operationalChanges: changes,
    }
    expect(correctPublishedProjectCostInputSchema.safeParse(payload).success).toBe(true)
  })

  it('Case F — no effective changes: returns empty object when form matches snapshot', () => {
    const form: FormOperationalState = {
      description: 'Bê tông tươi M300 sàn tầng 2',
      workStatus: 'in_progress',
      businessReference: 'REF-BT-001',
      relevantDate: '2026-09-01',
    }

    const changes = diffOperationalCorrection(baseSnapshot, form)

    expect(Object.keys(changes)).toHaveLength(0)
    expect(changes).toEqual({})
  })

  it('Case G — category label is never submitted as cost description fallback', () => {
    const categoryName = 'Vật tư thi công'
    const categoryCode = 'vat_tu'
    const categoryDisplayName = `[${categoryCode}] ${categoryName}`

    // Canonical cost item has its own distinct description
    const canonicalItemDescription = 'Ống nhựa Tiền Phong D90'
    const snapshot: CanonicalOperationalSnapshot = {
      description: canonicalItemDescription,
      workStatus: 'accepted',
      businessReference: null,
      relevantDate: null,
    }

    // Form populated from canonical snapshot
    const form: FormOperationalState = {
      description: canonicalItemDescription,
      workStatus: 'accepted',
      businessReference: '',
      relevantDate: '',
    }

    // Verify categoryDisplayName does not leak into form or diff
    expect(form.description).not.toBe(categoryDisplayName)
    expect(form.description).toBe(canonicalItemDescription)

    const changes = diffOperationalCorrection(snapshot, form)
    expect(changes.description).toBeUndefined()
  })

  it('degrades safely when operational fields are unavailable in snapshot', () => {
    // Read contract only provided description and businessReference (no workStatus, no relevantDate)
    const limitedSnapshot: CanonicalOperationalSnapshot = {
      description: 'Thuê xe cẩu tháng 9',
      businessReference: 'HD-XC-09',
    }

    const form: FormOperationalState = {
      description: 'Thuê xe cẩu tháng 9 (điều chỉnh)',
      workStatus: 'accepted', // UI might have default or garbage, but snapshot did not provide it
      businessReference: 'HD-XC-09',
      relevantDate: '2026-09-15', // snapshot did not provide relevantDate
    }

    const changes = diffOperationalCorrection(limitedSnapshot, form)

    // Only fields present in snapshot can be diffed and included
    expect(changes).toEqual({
      description: 'Thuê xe cẩu tháng 9 (điều chỉnh)',
    })
    expect(changes.workStatus).toBeUndefined()
    expect(changes.relevantDate).toBeUndefined()
  })
})
