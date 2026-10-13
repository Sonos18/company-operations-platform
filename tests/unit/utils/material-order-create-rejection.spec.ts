import { describe, expect, it } from 'vitest'
import { supplierInputRejectionMessage } from '../../../app/utils/materials/order-create-rejection'

describe('supplierInputRejectionMessage', () => {
  it('treats ambiguous and unavailable supplier rejections as correctable supplier input, even without an HTTP status', () => {
    expect(supplierInputRejectionMessage({ code: 'SUPPLIER_AMBIGUOUS' }, true))
      .toBe('Có nhiều nhà cung cấp trùng tên trong hệ thống. Vui lòng nhập đúng mã nhà cung cấp.')
    expect(supplierInputRejectionMessage({ code: 'SUPPLIER_UNAVAILABLE' }, true))
      .toBe('Nhà cung cấp này đã ngừng sử dụng hoặc không phải tổ chức.')
  })

  it('treats permission denial as a supplier problem only when the buyer cannot create suppliers', () => {
    expect(supplierInputRejectionMessage({ code: 'PERMISSION_DENIED' }, false))
      .toBe('Bạn chưa có quyền tạo nhà cung cấp mới. Hãy nhập mã của nhà cung cấp đã có hoặc nhờ người có quyền.')
    expect(supplierInputRejectionMessage({ code: 'PERMISSION_DENIED' }, true)).toBeNull()
  })

  it('leaves every other rejection to the canonical denial flow', () => {
    for (const code of ['MATERIAL_ALLOCATION_EXCEEDED', 'VERSION_CONFLICT', 'INPUT_INVALID', undefined]) {
      expect(supplierInputRejectionMessage({ code }, false)).toBeNull()
    }
  })
})
