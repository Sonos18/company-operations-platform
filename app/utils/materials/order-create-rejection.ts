/**
 * Classifies order-create rejections caused by the supplier descriptor.
 *
 * The server resolves or creates the supplier inside the order transaction, so these rejections
 * roll back everything: nothing changed server-side and the buyer only needs to correct the
 * supplier fields. Returns the message to show, or null when the rejection belongs to the
 * canonical denial/refresh flow.
 */
export function supplierInputRejectionMessage(
  errInfo: { code?: string },
  canCreateSupplier: boolean,
): string | null {
  switch (errInfo.code) {
    case 'SUPPLIER_AMBIGUOUS':
      return 'Có nhiều nhà cung cấp trùng tên trong hệ thống. Vui lòng nhập đúng mã nhà cung cấp.'
    case 'SUPPLIER_UNAVAILABLE':
      return 'Nhà cung cấp này đã ngừng sử dụng hoặc không phải tổ chức.'
    case 'PERMISSION_DENIED':
      // Without supplier.record the only permission the order path can newly need is supplier creation.
      return canCreateSupplier
        ? null
        : 'Bạn chưa có quyền tạo nhà cung cấp mới. Hãy nhập mã của nhà cung cấp đã có hoặc nhờ người có quyền.'
    default:
      return null
  }
}
