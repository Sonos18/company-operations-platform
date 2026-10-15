/**
 * Classifies order-create rejections caused by the supplier descriptor.
 *
 * The server resolves, updates or creates the supplier inside the order transaction, so these
 * rejections roll back everything: nothing changed server-side and the buyer only needs to correct
 * the supplier fields. Returns the message to show, or null when the rejection belongs to the
 * canonical denial/refresh flow.
 */
export function supplierInputRejectionMessage(
  errInfo: { code?: string },
  canRecordSupplier: boolean,
): string | null {
  switch (errInfo.code) {
    case 'SUPPLIER_UNAVAILABLE':
      return 'Nhà cung cấp này đã ngừng sử dụng hoặc không phải tổ chức.'
    case 'SUPPLIER_CODE_CONFLICT':
      return 'Tên nhà cung cấp gần trùng với một nhà cung cấp khác đã có (chỉ khác dấu hoặc ký tự đặc biệt). Vui lòng kiểm tra lại tên.'
    case 'PERMISSION_DENIED':
      // Without supplier.record the only permission the order path can newly need is creating or updating the supplier.
      return canRecordSupplier
        ? null
        : 'Bạn chưa có quyền tạo hoặc cập nhật nhà cung cấp. Hãy nhập đúng tên và thông tin của nhà cung cấp đã có, hoặc nhờ người có quyền.'
    default:
      return null
  }
}
