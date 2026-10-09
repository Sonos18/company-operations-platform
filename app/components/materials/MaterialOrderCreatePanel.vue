<template>
  <div
    v-if="canViewProcurement"
    class="material-order-create-panel cockpit-card"
    role="region"
    aria-label="Tạo và quản lý đơn mua hàng vật tư"
  >
    <!-- Panel Header -->
    <div class="panel-header border-b border-slate-200 pb-4">
      <div class="flex items-center justify-between gap-3 flex-wrap">
        <div class="flex items-center gap-2.5">
          <UIcon name="i-lucide-shopping-cart" class="text-sky-600 text-xl shrink-0" aria-hidden="true" />
          <div>
            <h3 class="panel-title text-base font-bold text-slate-900 m-0">Tạo & Quản lý đơn mua vật tư</h3>
            <p class="text-xs text-slate-500 m-0 mt-0.5">
              Ghi nhận nhà cung cấp ngoài hệ thống, tải báo giá PDF, đối chiếu khối lượng và lập đơn mua.
            </p>
          </div>
        </div>

        <div class="header-badges flex items-center gap-2 flex-wrap">
          <!-- Currency Indicator -->
          <div class="currency-tag flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-100 text-xs">
            <span class="text-slate-500">Tiền tệ:</span>
            <span v-if="canonicalCurrency" class="font-mono font-bold text-slate-800">{{ canonicalCurrency }}</span>
            <span v-else-if="isCurrencyLoading" class="text-slate-400 italic">Đang tải...</span>
            <span v-else class="text-rose-600 font-medium">Chưa xác định</span>
            <button
              v-if="!canonicalCurrency && !isCurrencyLoading"
              type="button"
              class="text-sky-600 hover:underline ml-1 font-semibold"
              :disabled="isRecoveryControlDisabled"
              @click="loadCurrency"
            >
              Thử lại
            </button>
          </div>

          <!-- Proposal Revision & State -->
          <span class="cockpit-badge cockpit-badge--neutral text-xs font-mono">
            Phiên bản: v{{ proposal.version }}
          </span>
          <span
            class="cockpit-badge text-xs font-semibold"
            :class="{
              'bg-emerald-100 text-emerald-800': proposal.reviewState === 'approved',
              'bg-amber-100 text-amber-800': proposal.reviewState === 'submitted',
              'bg-rose-100 text-rose-800': proposal.reviewState === 'returned',
              'bg-slate-100 text-slate-700': proposal.reviewState === 'draft',
            }"
          >
            {{ reviewStateLabel }}
          </span>
        </div>
      </div>
    </div>

    <!-- Alert 1: ACK succeeded but Canonical GET failed for Create Order -->
    <div v-if="createPostAcknowledged" class="cockpit-alert cockpit-alert--warning mt-4" role="alert">
      <div class="flex items-start gap-2">
        <UIcon name="i-lucide-alert-triangle" class="text-amber-600 text-base shrink-0 mt-0.5" aria-hidden="true" />
        <div class="flex-1">
          <p class="font-semibold text-amber-900">Đã gửi lệnh; chưa xác nhận dữ liệu mới</p>
          <p class="text-sm text-amber-800 mt-0.5">
            Đơn mua đã được tạo trên hệ thống nhưng chưa tải lại được dữ liệu phiếu và danh sách đơn mới nhất. Vui lòng bấm thử lại để làm mới dữ liệu mà không tạo trùng đơn.
          </p>
          <div class="mt-2.5">
            <button
              type="button"
              class="cockpit-btn cockpit-btn--primary btn-sm"
              :disabled="isRecoveryControlDisabled"
              @click="retryCanonicalAfterCreate"
            >
              <UIcon v-if="isCreateBusy" name="i-lucide-loader-2" class="animate-spin text-sm" aria-hidden="true" />
              <UIcon v-else name="i-lucide-refresh-cw" class="text-sm" aria-hidden="true" />
              Tải lại dữ liệu mới
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Alert 2: ACK succeeded but Canonical GET failed for Cancel Order -->
    <div v-else-if="cancelPostAcknowledged" class="cockpit-alert cockpit-alert--warning mt-4" role="alert">
      <div class="flex items-start gap-2">
        <UIcon name="i-lucide-alert-triangle" class="text-amber-600 text-base shrink-0 mt-0.5" aria-hidden="true" />
        <div class="flex-1">
          <p class="font-semibold text-amber-900">Đã gửi lệnh; chưa xác nhận dữ liệu mới</p>
          <p class="text-sm text-amber-800 mt-0.5">
            Lệnh hủy đơn mua đã được ghi nhận trên hệ thống nhưng chưa tải lại được dữ liệu phiếu mới nhất. Vui lòng bấm thử lại để làm mới trạng thái.
          </p>
          <div class="mt-2.5">
            <button
              type="button"
              class="cockpit-btn cockpit-btn--primary btn-sm"
              :disabled="isRecoveryControlDisabled"
              @click="retryCanonicalAfterCancel"
            >
              <UIcon v-if="isCancelBusy" name="i-lucide-loader-2" class="animate-spin text-sm" aria-hidden="true" />
              <UIcon v-else name="i-lucide-refresh-cw" class="text-sm" aria-hidden="true" />
              Tải lại dữ liệu mới
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Alert 3: Create POST was rejected with Conflict (409) -->
    <div v-else-if="isCreatePostRejected" class="cockpit-alert cockpit-alert--danger mt-4" role="alert">
      <div class="flex items-start gap-2">
        <UIcon name="i-lucide-alert-circle" class="text-rose-600 text-base shrink-0 mt-0.5" aria-hidden="true" />
        <div class="flex-1">
          <p class="font-semibold text-rose-900">{{ createActionError }}</p>
          <p class="text-sm text-rose-800 mt-0.5">
            Dữ liệu phiếu hoặc số lượng còn lại đã thay đổi. Vui lòng tải lại dữ liệu mới nhất để đối chiếu lại.
          </p>
          <div class="mt-2.5">
            <button
              type="button"
              class="cockpit-btn cockpit-btn--secondary btn-sm"
              :disabled="isRecoveryControlDisabled"
              @click="retryCanonicalRefresh"
            >
              <UIcon v-if="isTransportBusy" name="i-lucide-loader-2" class="animate-spin text-sm" aria-hidden="true" />
              <UIcon v-else name="i-lucide-refresh-cw" class="text-sm" aria-hidden="true" />
              Tải lại dữ liệu
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Alert 4: Cancel POST was rejected with Conflict (409) -->
    <div v-else-if="isCancelPostRejected" class="cockpit-alert cockpit-alert--danger mt-4" role="alert">
      <div class="flex items-start gap-2">
        <UIcon name="i-lucide-alert-circle" class="text-rose-600 text-base shrink-0 mt-0.5" aria-hidden="true" />
        <div class="flex-1">
          <p class="font-semibold text-rose-900">{{ cancelActionError }}</p>
          <div class="mt-2.5">
            <button
              type="button"
              class="cockpit-btn cockpit-btn--secondary btn-sm"
              :disabled="isRecoveryControlDisabled"
              @click="retryCanonicalRefresh"
            >
              <UIcon v-if="isTransportBusy" name="i-lucide-loader-2" class="animate-spin text-sm" aria-hidden="true" />
              <UIcon v-else name="i-lucide-refresh-cw" class="text-sm" aria-hidden="true" />
              Tải lại dữ liệu
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Alert 5: Pending Create command interrupted before ACK (e.g. network lost) -->
    <div v-else-if="pendingCreateOrderCommand" class="cockpit-alert cockpit-alert--danger mt-4" role="alert">
      <div class="flex items-start gap-2">
        <UIcon name="i-lucide-alert-circle" class="text-rose-600 text-base shrink-0 mt-0.5" aria-hidden="true" />
        <div class="flex-1">
          <p class="font-semibold text-rose-900">{{ createActionError || 'Lỗi kết nối máy chủ' }}</p>
          <p class="text-sm text-rose-800 mt-0.5">
            Lệnh tạo đơn chưa xác nhận được kết quả commit. Vui lòng bấm thử lại để tiếp tục gửi đúng lệnh và khóa idempotent này.
          </p>
          <div class="mt-2.5">
            <button
              type="button"
              class="cockpit-btn cockpit-btn--secondary btn-sm"
              :disabled="isRecoveryControlDisabled"
              @click="retryPendingCreateCommand"
            >
              <UIcon v-if="isCreateBusy" name="i-lucide-loader-2" class="animate-spin text-sm" aria-hidden="true" />
              <UIcon v-else name="i-lucide-rotate-cw" class="text-sm" aria-hidden="true" />
              Thử lại lệnh vừa gửi
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Alert 6: Pending Cancel command interrupted before ACK -->
    <div v-else-if="pendingCancelCommand" class="cockpit-alert cockpit-alert--danger mt-4" role="alert">
      <div class="flex items-start gap-2">
        <UIcon name="i-lucide-alert-circle" class="text-rose-600 text-base shrink-0 mt-0.5" aria-hidden="true" />
        <div class="flex-1">
          <p class="font-semibold text-rose-900">{{ cancelActionError || 'Lỗi kết nối máy chủ khi hủy đơn' }}</p>
          <p class="text-sm text-rose-800 mt-0.5">
            Lệnh hủy đơn chưa xác nhận được kết quả commit. Vui lòng bấm thử lại để tiếp tục với đúng lệnh này.
          </p>
          <div class="mt-2.5">
            <button
              type="button"
              class="cockpit-btn cockpit-btn--secondary btn-sm"
              :disabled="isRecoveryControlDisabled"
              @click="retryPendingCancelCommand"
            >
              <UIcon v-if="isCancelBusy" name="i-lucide-loader-2" class="animate-spin text-sm" aria-hidden="true" />
              <UIcon v-else name="i-lucide-rotate-cw" class="text-sm" aria-hidden="true" />
              Thử lại lệnh hủy vừa gửi
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Alert 7: General Action Error Banner -->
    <div v-else-if="generalError" class="cockpit-alert cockpit-alert--danger mt-4" role="alert">
      <div class="flex items-start gap-2">
        <UIcon name="i-lucide-alert-circle" class="text-rose-600 text-base shrink-0 mt-0.5" aria-hidden="true" />
        <p class="font-semibold text-rose-900 flex-1">{{ generalError }}</p>
      </div>
    </div>

    <!-- Busy progress banner -->
    <div v-if="isTransportBusy" class="busy-banner mt-3" role="status" aria-live="polite">
      <UIcon name="i-lucide-loader-2" class="animate-spin text-sky-600 shrink-0" aria-hidden="true" />
      <span class="text-sm font-medium text-slate-700">{{ busyStatusMessage }}</span>
    </div>

    <!-- Non-approved proposal notice -->
    <div v-if="!isProposalApproved" class="cockpit-alert cockpit-alert--neutral mt-4">
      <div class="flex items-center gap-2 text-slate-700 text-sm">
        <UIcon name="i-lucide-info" class="text-slate-500 text-base shrink-0" aria-hidden="true" />
        <span>
          Chỉ có thể tạo đơn mua từ phiếu yêu cầu đã được duyệt hợp lệ (approved).
          <template v-if="proposal.reviewState === 'submitted'">
            Phiếu đang chờ duyệt tiếp nhận.
          </template>
          <template v-else-if="proposal.reviewState === 'returned'">
            Phiếu đã bị trả lại cho kỹ sư.
          </template>
        </span>
      </div>
    </div>

    <!-- SECTION: ORDER CREATION WORKFLOW (Only for approved proposals) -->
    <div v-if="isProposalApproved && !pendingCreateOrderCommand && !createPostAcknowledged" class="create-workflow-container mt-6 space-y-6">
      <!-- 1. Supplier Recording Section -->
      <section class="supplier-section cockpit-card bg-slate-50 border border-slate-200 p-4 rounded-lg" aria-labelledby="supplier-section-title">
        <div class="flex items-center justify-between gap-2 flex-wrap mb-3">
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-truck" class="text-sky-600 text-base" aria-hidden="true" />
            <h4 id="supplier-section-title" class="font-bold text-slate-900 text-sm m-0">1. Nhà cung cấp đã chọn bên ngoài</h4>
          </div>
          <span v-if="resolvedSupplierId" class="cockpit-badge bg-emerald-100 text-emerald-800 text-xs flex items-center gap-1 font-semibold">
            <UIcon name="i-lucide-check" class="text-xs" aria-hidden="true" />
            Đã ghi nhận NCC
          </span>
        </div>

        <p class="text-xs text-slate-600 mb-3">
          Nhập thông tin nhà cung cấp đã được đàm phán và lựa chọn ngoài hệ thống (bắt buộc Mã NCC và Tên hiển thị).
        </p>

        <div v-if="!canRecordSupplier" class="text-xs text-amber-700 italic mb-2">
          Tài khoản của bạn không có quyền ghi nhận nhà cung cấp (material.supplier.record).
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label for="supplier-code-input" class="field-label">Mã nhà cung cấp <span class="text-rose-500">*</span></label>
            <input
              id="supplier-code-input"
              v-model="supplierCode"
              type="text"
              class="cockpit-input w-full text-sm font-mono"
              placeholder="VD: NCC-HOAPHAT"
              :disabled="isRegularControlDisabled || !canRecordSupplier"
              maxlength="200"
              @input="onSupplierInputChanged"
            >
          </div>

          <div>
            <label for="supplier-name-input" class="field-label">Tên nhà cung cấp <span class="text-rose-500">*</span></label>
            <input
              id="supplier-name-input"
              v-model="supplierDisplayName"
              type="text"
              class="cockpit-input w-full text-sm"
              placeholder="VD: Công ty TNHH Thép Hòa Phát"
              :disabled="isRegularControlDisabled || !canRecordSupplier"
              maxlength="200"
              @input="onSupplierInputChanged"
            >
          </div>

          <div>
            <label for="supplier-tax-input" class="field-label">Mã số thuế</label>
            <input
              id="supplier-tax-input"
              v-model="supplierTaxIdentifier"
              type="text"
              class="cockpit-input w-full text-sm font-mono"
              placeholder="VD: 0102030405"
              :disabled="isRegularControlDisabled || !canRecordSupplier"
              maxlength="100"
              @input="onSupplierInputChanged"
            >
          </div>

          <div>
            <label for="supplier-contact-name-input" class="field-label">Người liên hệ</label>
            <input
              id="supplier-contact-name-input"
              v-model="supplierContactDisplayName"
              type="text"
              class="cockpit-input w-full text-sm"
              placeholder="VD: Nguyễn Văn A"
              :disabled="isRegularControlDisabled || !canRecordSupplier"
              maxlength="200"
              @input="onSupplierInputChanged"
            >
          </div>

          <div>
            <label for="supplier-contact-phone-input" class="field-label">Số điện thoại</label>
            <input
              id="supplier-contact-phone-input"
              v-model="supplierContactPhone"
              type="text"
              class="cockpit-input w-full text-sm"
              placeholder="VD: 0912345678"
              :disabled="isRegularControlDisabled || !canRecordSupplier"
              maxlength="100"
              @input="onSupplierInputChanged"
            >
          </div>

          <div class="flex items-end">
            <div class="flex items-center gap-2 mb-2">
              <input
                id="supplier-ack-checkbox"
                v-model="supplierAlreadyChosenAcknowledged"
                type="checkbox"
                class="cockpit-checkbox h-4 w-4 text-sky-600 rounded border-slate-300 focus:ring-sky-500 cursor-pointer disabled:cursor-not-allowed"
                :disabled="isRegularControlDisabled || !canRecordSupplier"
                @change="onSupplierInputChanged"
              >
              <label for="supplier-ack-checkbox" class="text-xs font-medium text-slate-700 cursor-pointer select-none">
                Xác nhận NCC chọn bên ngoài <span class="text-rose-500">*</span>
              </label>
            </div>
          </div>
        </div>

        <div v-if="supplierResolveError" class="text-xs text-rose-600 mt-2 font-medium" role="alert">
          {{ supplierResolveError }}
        </div>

        <div class="mt-3 flex items-center gap-3">
          <button
            type="button"
            class="cockpit-btn cockpit-btn--primary btn-sm"
            :disabled="isRegularControlDisabled || !canRecordSupplier || !canTriggerSupplierResolve"
            @click="handleResolveSupplier"
          >
            <UIcon v-if="isResolvingSupplier" name="i-lucide-loader-2" class="animate-spin text-sm" aria-hidden="true" />
            <UIcon v-else name="i-lucide-save" class="text-sm" aria-hidden="true" />
            {{ resolvedSupplierId ? 'Ghi nhận lại nhà cung cấp' : 'Ghi nhận nhà cung cấp' }}
          </button>
          <span v-if="resolvedSupplierId" class="text-xs text-emerald-700 font-mono">
            ID NCC: {{ resolvedSupplierId }}
          </span>
        </div>
      </section>

      <!-- 2. PDF Quotation Evidence Section -->
      <section class="evidence-section cockpit-card bg-slate-50 border border-slate-200 p-4 rounded-lg" aria-labelledby="evidence-section-title">
        <div class="flex items-center justify-between gap-2 flex-wrap mb-3">
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-file-text" class="text-sky-600 text-base" aria-hidden="true" />
            <h4 id="evidence-section-title" class="font-bold text-slate-900 text-sm m-0">2. Tệp báo giá đính kèm (PDF)</h4>
          </div>
          <span v-if="finalizedEvidenceFileId" class="cockpit-badge bg-emerald-100 text-emerald-800 text-xs flex items-center gap-1 font-semibold">
            <UIcon name="i-lucide-check" class="text-xs" aria-hidden="true" />
            Báo giá đã hoàn tất
          </span>
        </div>

        <p class="text-xs text-slate-600 mb-3">
          Tải lên báo giá dạng PDF (&le; 25 MiB). Tệp được lưu trữ làm bằng chứng báo giá chưa ký (unsigned quotation).
        </p>

        <div class="flex items-center gap-3 flex-wrap">
          <input
            id="quotation-pdf-input"
            type="file"
            accept=".pdf,application/pdf"
            class="cockpit-input text-sm file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-sky-50 file:text-sky-700 hover:file:bg-sky-100 cursor-pointer"
            :disabled="isRegularControlDisabled"
            @change="onFileSelected"
          >

          <button
            v-if="selectedFile && !finalizedEvidenceFileId"
            type="button"
            class="cockpit-btn cockpit-btn--primary btn-sm"
            :disabled="isRegularControlDisabled || isUploading"
            @click="handleUploadPdf"
          >
            <UIcon v-if="isUploading" name="i-lucide-loader-2" class="animate-spin text-sm" aria-hidden="true" />
            <UIcon v-else name="i-lucide-upload" class="text-sm" aria-hidden="true" />
            Tải lên & Hoàn tất
          </button>

          <button
            v-if="finalizedEvidenceFileId"
            type="button"
            class="cockpit-btn cockpit-btn--secondary btn-sm"
            :disabled="isRecoveryControlDisabled"
            @click="openEvidencePdf(finalizedEvidenceFileId)"
          >
            <UIcon name="i-lucide-external-link" class="text-sm" aria-hidden="true" />
            Xem PDF báo giá
          </button>
        </div>

        <div v-if="selectedFile" class="text-xs text-slate-500 mt-2 flex items-center gap-2">
          <span>Tệp: <strong>{{ selectedFile.name }}</strong> ({{ (selectedFile.size / 1024 / 1024).toFixed(2) }} MiB)</span>
          <span v-if="uploadSession" class="text-slate-400 italic">· Phiên tải: đang ghi nhận</span>
        </div>

        <div v-if="uploadError" class="text-xs text-rose-600 mt-2 font-medium" role="alert">
          {{ uploadError }}
        </div>
      </section>

      <!-- 3. Line Allocation & Comparison Section -->
      <section class="allocation-section" aria-labelledby="allocation-section-title">
        <div class="flex items-center justify-between gap-2 flex-wrap mb-3">
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-scale" class="text-sky-600 text-base" aria-hidden="true" />
            <h4 id="allocation-section-title" class="font-bold text-slate-900 text-sm m-0">3. Đối chiếu báo giá & Phân bổ đơn hàng</h4>
          </div>
          <span class="text-xs text-slate-500">
            Đã phân bổ <strong>{{ selectedAllocations.length }}</strong> / {{ proposal.lines.length }} dòng vật tư
          </span>
        </div>

        <p class="text-xs text-slate-600 mb-4">
          Đối chiếu trực tiếp từng dòng vật tư được duyệt với số lượng và tên trên báo giá PDF. Nhập đơn giá và số lượng phân bổ cho đơn đặt hàng này.
        </p>

        <!-- Lines list of MaterialQuotationComparisonPanel -->
        <div class="space-y-3">
          <MaterialQuotationComparisonPanel
            v-for="line in proposal.lines"
            :key="line.lineId"
            :line="line"
            :allocation-quantity="lineFormMap[line.lineId]?.allocationQuantity ?? ''"
            :unit-price="lineFormMap[line.lineId]?.unitPrice ?? ''"
            :quoted-quantity="lineFormMap[line.lineId]?.quotedQuantity ?? ''"
            :quotation-material-name="lineFormMap[line.lineId]?.quotationMaterialName ?? ''"
            :mapping-confirmed="lineFormMap[line.lineId]?.mappingConfirmed ?? false"
            :disabled="isRegularControlDisabled"
            @update:allocation-quantity="val => updateLineField(line.lineId, 'allocationQuantity', val)"
            @update:unit-price="val => updateLineField(line.lineId, 'unitPrice', val)"
            @update:quoted-quantity="val => updateLineField(line.lineId, 'quotedQuantity', val)"
            @update:quotation-material-name="val => updateLineField(line.lineId, 'quotationMaterialName', val)"
            @update:mapping-confirmed="val => updateLineField(line.lineId, 'mappingConfirmed', val)"
            @return-requested="handleReturnRequested"
          />
        </div>

        <!-- Order Creation Summary Bar -->
        <div class="order-submit-bar mt-4 p-4 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between gap-4 flex-wrap">
          <div class="summary-details">
            <div class="text-xs text-slate-500">Tổng giá trị đơn mua dự kiến:</div>
            <div class="text-lg font-mono font-bold text-slate-900">
              {{ formattedTotalOrderValue }} <span class="text-sm font-semibold text-sky-700">{{ canonicalCurrency }}</span>
            </div>
            <div v-if="createValidationReason" class="text-xs text-amber-700 mt-0.5">
              {{ createValidationReason }}
            </div>
          </div>

          <div class="actions">
            <button
              type="button"
              class="cockpit-btn cockpit-btn--primary"
              :disabled="!canCreateOrder"
              @click="startCreateOrder"
            >
              <UIcon v-if="isCreateBusy" name="i-lucide-loader-2" class="animate-spin text-sm" aria-hidden="true" />
              <UIcon v-else name="i-lucide-shopping-cart" class="text-sm" aria-hidden="true" />
              Tạo đơn mua hàng
            </button>
          </div>
        </div>
      </section>
    </div>

    <!-- SECTION: EXISTING ORDERS LIST FOR THIS PROPOSAL -->
    <section class="existing-orders-section mt-8 pt-6 border-t border-slate-200" aria-labelledby="existing-orders-title">
      <div class="flex items-center justify-between gap-3 flex-wrap mb-4">
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-package" class="text-sky-600 text-lg" aria-hidden="true" />
          <h4 id="existing-orders-title" class="font-bold text-slate-900 text-sm m-0">Đơn mua hiện có của phiếu</h4>
          <span class="cockpit-badge cockpit-badge--neutral text-xs font-mono">
            {{ orders.length }}
          </span>
        </div>

        <button
          type="button"
          class="cockpit-btn cockpit-btn--secondary btn-sm"
          :disabled="isRecoveryControlDisabled"
          @click="loadOrders"
        >
          <UIcon v-if="isOrdersLoading" name="i-lucide-loader-2" class="animate-spin text-xs" aria-hidden="true" />
          <UIcon v-else name="i-lucide-refresh-cw" class="text-xs" aria-hidden="true" />
          Làm mới danh sách
        </button>
      </div>

      <div v-if="ordersError" class="text-xs text-rose-600 mb-3" role="alert">
        {{ ordersError }}
      </div>

      <!-- Empty state -->
      <div v-if="orders.length === 0 && !isOrdersLoading" class="text-center py-6 bg-slate-50 rounded-lg border border-dashed border-slate-200">
        <UIcon name="i-lucide-inbox" class="text-slate-400 text-2xl mx-auto mb-1" aria-hidden="true" />
        <p class="text-xs text-slate-500 m-0">Chưa có đơn mua nào được tạo cho phiếu yêu cầu này.</p>
      </div>

      <!-- Orders table -->
      <div v-else class="orders-table-wrapper overflow-x-auto">
        <table class="cockpit-table w-full text-left text-xs border border-slate-200 rounded-lg">
          <thead class="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
            <tr>
              <th class="p-2.5">Mã đơn</th>
              <th class="p-2.5">Nhà cung cấp</th>
              <th class="p-2.5">Trạng thái</th>
              <th class="p-2.5">Phân bổ vật tư</th>
              <th class="p-2.5 text-right">Tổng tiền</th>
              <th class="p-2.5 text-center">Báo giá PDF</th>
              <th class="p-2.5 text-center">Hợp đồng</th>
              <th class="p-2.5 text-center">Thao tác</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 bg-white">
            <tr v-for="order in orders" :key="order.id" class="hover:bg-slate-50 transition-colors">
              <td class="p-2.5 font-mono text-slate-600 align-top">
                <span :title="order.id">{{ order.id.slice(0, 8) }}...</span>
                <div class="text-[10px] text-slate-400">v{{ order.version }}</div>
              </td>

              <td class="p-2.5 font-medium text-slate-800 align-top">
                {{ order.supplierName }}
              </td>

              <td class="p-2.5 align-top">
                <span
                  class="cockpit-badge text-[11px] font-semibold"
                  :class="{
                    'bg-emerald-100 text-emerald-800': order.orderState === 'active',
                    'bg-amber-100 text-amber-800': order.orderState === 'suspended',
                    'bg-slate-100 text-slate-600': order.orderState === 'cancelled',
                  }"
                >
                  <template v-if="order.orderState === 'active'">Đang hoạt động</template>
                  <template v-else-if="order.orderState === 'suspended'">Tạm dừng (giữ chỗ)</template>
                  <template v-else-if="order.orderState === 'cancelled'">Đã hủy</template>
                </span>
                <div v-if="order.orderState === 'suspended'" class="text-[10px] text-amber-700 mt-0.5">
                  Đang bảo lưu hạn mức
                </div>
              </td>

              <td class="p-2.5 align-top">
                <div class="space-y-1">
                  <div
                    v-for="alloc in order.allocations"
                    :key="alloc.orderLineId"
                    class="allocation-line text-[11px] text-slate-700"
                  >
                    <span class="font-medium">{{ alloc.materialName }}</span>
                    <span class="text-slate-400"> ({{ alloc.quotationMaterialName }}): </span>
                    <span class="font-mono font-semibold">{{ formatMaterialQuantity(alloc.quantity) }} {{ alloc.unit }}</span>
                    <span class="text-slate-400"> &times; {{ alloc.unitPrice }}</span>
                  </div>
                </div>
              </td>

              <td class="p-2.5 font-mono font-bold text-right text-slate-900 align-top">
                {{ computeOrderTotal(order) }} <span class="text-[11px] font-medium text-slate-500">{{ order.currencyCode }}</span>
              </td>

              <td class="p-2.5 text-center align-top">
                <button
                  type="button"
                  class="text-sky-600 hover:text-sky-800 text-xs inline-flex items-center gap-1 font-medium"
                  :disabled="isRecoveryControlDisabled"
                  @click="openEvidencePdf(order.unsignedQuotationEvidenceFileId)"
                >
                  <UIcon name="i-lucide-file-text" class="text-xs" aria-hidden="true" />
                  Mở PDF
                </button>
              </td>

              <td class="p-2.5 text-center align-top">
                <span v-if="order.contract !== null" class="cockpit-badge bg-sky-100 text-sky-800 text-[11px] font-medium">
                  Đã ký HĐ
                </span>
                <span v-else class="text-slate-400 text-[11px]">
                  Chưa ký HĐ
                </span>
              </td>

              <td class="p-2.5 text-center align-top">
                <button
                  v-if="canCancelOrder(order)"
                  type="button"
                  class="cockpit-btn cockpit-btn--danger btn-sm text-[11px] py-1 px-2.5"
                  :disabled="isRegularControlDisabled"
                  @click="startCancelOrder(order)"
                >
                  Hủy đơn
                </button>
                <span v-else class="text-slate-400 text-[11px]">—</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Cancel Order Inline Dialog -->
      <div v-if="cancellingOrderId" class="cancel-dialog mt-4 p-4 bg-rose-50 border border-rose-200 rounded-lg">
        <div class="flex items-center gap-2 mb-2 text-rose-900 font-bold text-sm">
          <UIcon name="i-lucide-alert-triangle" class="text-rose-600 text-base" aria-hidden="true" />
          <span>Xác nhận hủy đơn mua vật tư (Mã: {{ cancellingOrderId.slice(0, 8) }}...)</span>
        </div>
        <p class="text-xs text-rose-800 mb-3">
          Sau khi hủy, hạn mức số lượng đã phân bổ sẽ được giải phóng và hoàn trả về số lượng còn lại của phiếu yêu cầu vật tư.
        </p>

        <div class="mb-3">
          <label for="cancel-reason-textarea" class="field-label text-rose-900">
            Lý do hủy đơn <span class="text-rose-600">*</span>
          </label>
          <textarea
            id="cancel-reason-textarea"
            v-model="cancelReason"
            rows="2"
            class="cockpit-input w-full text-sm"
            placeholder="Nhập lý do hủy đơn (tối đa 2000 ký tự)..."
            :disabled="isCancelBusy"
            maxlength="2000"
          />
          <div class="flex justify-between items-center text-[11px] text-rose-700 mt-1">
            <span v-if="cancelReasonError" class="font-medium" role="alert">{{ cancelReasonError }}</span>
            <span v-else />
            <span>{{ cancelReason.length }}/2000 ký tự</span>
          </div>
        </div>

        <div class="flex items-center gap-2">
          <button
            type="button"
            class="cockpit-btn cockpit-btn--danger btn-sm"
            :disabled="isCancelBusy"
            @click="confirmCancelOrder"
          >
            <UIcon v-if="isCancelBusy" name="i-lucide-loader-2" class="animate-spin text-sm" aria-hidden="true" />
            <UIcon v-else name="i-lucide-check" class="text-sm" aria-hidden="true" />
            Xác nhận hủy
          </button>
          <button
            type="button"
            class="cockpit-btn cockpit-btn--secondary btn-sm"
            :disabled="isCancelBusy"
            @click="closeCancelDialog"
          >
            Đóng
          </button>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import Decimal from 'decimal.js'
import type {
  MaterialProposalView,
  MaterialOrderView,
  CreateMaterialOrderInput,
} from '../../../shared/schemas/costs/material-procurement'
import {
  chosenSupplierInputSchema,
  createMaterialOrderInputSchema,
} from '../../../shared/schemas/costs/material-procurement'
import { workflowUuidSchema } from '../../../shared/schemas/costs/cost-workflow'
import { formatMaterialQuantity } from '../../utils/materials/quantity-display'
import {
  uploadMaterialEvidence,
  type MaterialEvidenceUploadSession,
} from '../../utils/costs/material-evidence-uploader'
import { createAsyncRequestTracker } from '../../utils/costs/async-request-tracker'
import MaterialQuotationComparisonPanel from './MaterialQuotationComparisonPanel.vue'

interface Props {
  companyId: string
  projectId: string
  proposal: MaterialProposalView
  disabled?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  disabled: false,
})

const emit = defineEmits<{
  (e: 'busy', value: boolean): void
  (e: 'canonical', proposal: MaterialProposalView): void
  (e: 'returnRequested'): void
}>()

// Stores & repositories
const nuxtApp = useNuxtApp()
const companyAccess = nuxtApp.$companyAccessStore
const authStore = nuxtApp.$authStore
const supabaseClient = nuxtApp.$supabaseClient
const repositories = useRepositories()
const repo = repositories.materialProcurement

type TrackerScope = {
  companyId: string
  projectId: string
  proposalId: string
  approvedRevisionId?: string | null
  op: string
}

const tracker = createAsyncRequestTracker<TrackerScope>()
let isDisposed = false
let lastEmittedBusy = false

function emitBusy(val: boolean) {
  if (lastEmittedBusy !== val) {
    lastEmittedBusy = val
    emit('busy', val)
  }
}

// Scope & Permission validation
function isLiveScopeValid(cmd?: {
  companyId: string
  projectId: string
  proposalId: string
  approvedRevisionId?: string | null
}): boolean {
  if (isDisposed) return false
  const activeCompanyId = companyAccess?.activeCompanyId
  const currentUserId = authStore?.user?.id
  if (!activeCompanyId || !currentUserId) return false
  if (activeCompanyId !== props.companyId) return false
  if (!workflowUuidSchema.safeParse(props.companyId).success) return false
  if (!props.projectId || props.projectId !== props.proposal?.projectId) return false
  if (!workflowUuidSchema.safeParse(props.projectId).success) return false
  if (!props.proposal?.id || !workflowUuidSchema.safeParse(props.proposal.id).success) return false

  // Indepedently check material.read and material.order.manage
  if (!Boolean(companyAccess?.hasPermission('material.read'))) return false
  if (!Boolean(companyAccess?.hasPermission('material.order.manage'))) return false

  if (cmd) {
    if (cmd.companyId !== activeCompanyId) return false
    if (cmd.projectId !== props.projectId) return false
    if (cmd.proposalId !== props.proposal.id) return false
    if (cmd.approvedRevisionId !== undefined && cmd.approvedRevisionId !== props.proposal.approvedRevisionId) return false
  }
  return true
}

const canViewProcurement = computed(() => {
  return isLiveScopeValid()
})

const canRecordSupplier = computed(() => {
  if (!isLiveScopeValid()) return false
  return Boolean(companyAccess?.hasPermission('material.supplier.record'))
})

const isProposalApproved = computed(() => {
  return props.proposal?.reviewState === 'approved' && Boolean(props.proposal?.approvedRevisionId)
})

const reviewStateLabel = computed(() => {
  switch (props.proposal?.reviewState) {
    case 'approved': return 'Đã duyệt'
    case 'submitted': return 'Chờ duyệt'
    case 'returned': return 'Bị trả lại'
    case 'draft': return 'Bản nháp'
    default: return props.proposal?.reviewState ?? ''
  }
})

// Currency
const canonicalCurrency = ref<string | null>(null)
const isCurrencyLoading = ref(false)
const currencyError = ref('')

async function loadCurrency() {
  if (!isLiveScopeValid()) return
  const token = tracker.start({
    companyId: props.companyId,
    projectId: props.projectId,
    proposalId: props.proposal.id,
    approvedRevisionId: props.proposal.approvedRevisionId,
    op: 'load-currency',
  })
  isCurrencyLoading.value = true
  currencyError.value = ''
  try {
    const res = await repo.readOrderCurrency()
    if (!token.isCurrent() || isDisposed || !isLiveScopeValid()) return
    canonicalCurrency.value = res.currencyCode
  } catch (err: unknown) {
    if (!token.isCurrent() || isDisposed || !isLiveScopeValid()) return
    canonicalCurrency.value = null
    currencyError.value = 'Chưa tải được đơn vị tiền tệ công ty. Vui lòng bấm thử lại.'
  } finally {
    if (token.isCurrent() && !isDisposed) {
      isCurrencyLoading.value = false
    }
  }
}

// Orders
const orders = ref<MaterialOrderView[]>([])
const isOrdersLoading = ref(false)
const ordersError = ref('')

async function loadOrders() {
  if (!isLiveScopeValid()) return
  const token = tracker.start({
    companyId: props.companyId,
    projectId: props.projectId,
    proposalId: props.proposal.id,
    approvedRevisionId: props.proposal.approvedRevisionId,
    op: 'load-orders',
  })
  isOrdersLoading.value = true
  ordersError.value = ''
  try {
    const res = await repo.listOrders(props.projectId)
    if (!token.isCurrent() || isDisposed || !isLiveScopeValid()) return
    orders.value = res.filter(o => o.proposalId === props.proposal.id)
  } catch (err: unknown) {
    if (!token.isCurrent() || isDisposed || !isLiveScopeValid()) return
    ordersError.value = 'Chưa tải được danh sách đơn mua hiện có.'
  } finally {
    if (token.isCurrent() && !isDisposed) {
      isOrdersLoading.value = false
    }
  }
}

// Supplier state
const supplierCode = ref('')
const supplierDisplayName = ref('')
const supplierTaxIdentifier = ref('')
const supplierContactDisplayName = ref('')
const supplierContactPhone = ref('')
const supplierAlreadyChosenAcknowledged = ref(false)

const resolvedSupplierId = ref<string | null>(null)
const lastResolvedInputJson = ref<string | null>(null)
const supplierResolutionKey = ref<string>(crypto.randomUUID())
const isResolvingSupplier = ref(false)
const supplierResolveError = ref('')

function onSupplierInputChanged() {
  if (resolvedSupplierId.value !== null) {
    resolvedSupplierId.value = null
    supplierResolutionKey.value = crypto.randomUUID()
  }
  supplierResolveError.value = ''
}

const canTriggerSupplierResolve = computed(() => {
  return (
    supplierCode.value.trim().length > 0 &&
    supplierDisplayName.value.trim().length > 0 &&
    supplierAlreadyChosenAcknowledged.value
  )
})

async function handleResolveSupplier() {
  if (!isLiveScopeValid() || !canRecordSupplier.value || isRegularControlDisabled.value) return
  if (!supplierAlreadyChosenAcknowledged.value) {
    supplierResolveError.value = 'Vui lòng xác nhận nhà cung cấp được lựa chọn ngoài hệ thống.'
    return
  }

  const rawInput = {
    code: supplierCode.value.trim(),
    displayName: supplierDisplayName.value.trim(),
    partyKind: 'organization' as const,
    supplierAlreadyChosen: true as const,
    taxIdentifier: supplierTaxIdentifier.value.trim() || undefined,
    contactDisplayName: supplierContactDisplayName.value.trim() || undefined,
    contactPhone: supplierContactPhone.value.trim() || undefined,
  }

  const parsed = chosenSupplierInputSchema.safeParse(rawInput)
  if (!parsed.success) {
    supplierResolveError.value = parsed.error.issues[0]?.message || 'Thông tin nhà cung cấp không hợp lệ.'
    return
  }

  const currentJson = JSON.stringify(parsed.data)
  if (currentJson !== lastResolvedInputJson.value) {
    supplierResolutionKey.value = crypto.randomUUID()
    lastResolvedInputJson.value = currentJson
  }

  const token = tracker.start({
    companyId: props.companyId,
    projectId: props.projectId,
    proposalId: props.proposal.id,
    op: 'resolve-supplier',
  })

  isResolvingSupplier.value = true
  supplierResolveError.value = ''
  emitBusy(true)

  try {
    const res = await repo.resolveSupplier(parsed.data, { idempotencyKey: supplierResolutionKey.value })
    if (!token.isCurrent() || isDisposed || !isLiveScopeValid()) return
    resolvedSupplierId.value = res.resourceId
  } catch (err: unknown) {
    if (!token.isCurrent() || isDisposed || !isLiveScopeValid()) return
    supplierResolveError.value = (err as Error)?.message || 'Lỗi khi ghi nhận nhà cung cấp.'
  } finally {
    if (token.isCurrent() && !isDisposed) {
      isResolvingSupplier.value = false
      emitBusy(false)
    }
  }
}

// PDF Evidence
const selectedFile = ref<File | null>(null)
const uploadSession = ref<MaterialEvidenceUploadSession | null>(null)
const finalizedEvidenceFileId = ref<string | null>(null)
const isUploading = ref(false)
const uploadError = ref('')

function onFileSelected(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  const maxBytes = 25 * 1024 * 1024
  if (file.size > maxBytes) {
    uploadError.value = 'Dung lượng tệp PDF không được vượt quá 25 MiB.'
    input.value = ''
    return
  }
  if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
    uploadError.value = 'Chỉ chấp nhận tệp định dạng PDF.'
    input.value = ''
    return
  }

  selectedFile.value = file
  uploadError.value = ''
  finalizedEvidenceFileId.value = null
  uploadSession.value = null
  resetLineConfirmations()
}

async function handleUploadPdf() {
  if (!isLiveScopeValid() || !selectedFile.value || isRegularControlDisabled.value) return
  if (!props.proposal.approvedRevisionId) {
    uploadError.value = 'Phiếu chưa có phiên bản duyệt hợp lệ để đính kèm báo giá.'
    return
  }

  const token = tracker.start({
    companyId: props.companyId,
    projectId: props.projectId,
    proposalId: props.proposal.id,
    approvedRevisionId: props.proposal.approvedRevisionId,
    op: 'upload-evidence',
  })

  isUploading.value = true
  uploadError.value = ''
  emitBusy(true)

  try {
    const result = await uploadMaterialEvidence({
      companyId: props.companyId,
      projectId: props.projectId,
      file: selectedFile.value,
      evidenceRole: 'unsigned_quotation',
      target: {
        kind: 'material_proposal',
        proposalId: props.proposal.id,
        revisionId: props.proposal.approvedRevisionId,
      },
      repository: repo,
      supabaseClient: supabaseClient as any,
      session: uploadSession.value,
      onSessionChange: s => {
        if (token.isCurrent() && !isDisposed && isLiveScopeValid()) {
          uploadSession.value = s
        }
      },
      isScopeCurrent: () => token.isCurrent() && !isDisposed && isLiveScopeValid(),
    })

    if (!token.isCurrent() || isDisposed || !isLiveScopeValid()) return
    finalizedEvidenceFileId.value = result.evidenceFileId
  } catch (err: unknown) {
    if (!token.isCurrent() || isDisposed || !isLiveScopeValid()) return
    uploadError.value = (err as Error)?.message || 'Lỗi tải lên và hoàn tất báo giá PDF.'
  } finally {
    if (token.isCurrent() && !isDisposed) {
      isUploading.value = false
      emitBusy(false)
    }
  }
}

async function openEvidencePdf(fileId: string) {
  if (!isLiveScopeValid() || !fileId) return
  try {
    const res = await repo.readEvidenceUrl(props.projectId, fileId, { disposition: 'inline' })
    if (!isLiveScopeValid()) return
    if (res?.url) {
      window.open(res.url, '_blank', 'noopener,noreferrer')
    }
  } catch (err: unknown) {
    generalError.value = 'Không thể mở tệp PDF báo giá. Vui lòng thử lại.'
  }
}

// Line comparison and allocation state
interface LineAllocationState {
  allocationQuantity: string
  unitPrice: string
  quotedQuantity: string
  quotationMaterialName: string
  mappingConfirmed: boolean
}

const lineFormMap = ref<Record<string, LineAllocationState>>({})

function initLineFormMap() {
  const map: Record<string, LineAllocationState> = {}
  if (props.proposal?.lines) {
    for (const line of props.proposal.lines) {
      map[line.lineId] = {
        allocationQuantity: '',
        unitPrice: '',
        quotedQuantity: '',
        quotationMaterialName: '',
        mappingConfirmed: false,
      }
    }
  }
  lineFormMap.value = map
}

function resetLineConfirmations() {
  for (const lineId in lineFormMap.value) {
    lineFormMap.value[lineId].mappingConfirmed = false
  }
}

function updateLineField(lineId: string, field: keyof LineAllocationState, value: any) {
  if (!lineFormMap.value[lineId]) {
    lineFormMap.value[lineId] = {
      allocationQuantity: '',
      unitPrice: '',
      quotedQuantity: '',
      quotationMaterialName: '',
      mappingConfirmed: false,
    }
  }
  (lineFormMap.value[lineId] as any)[field] = value
}

function handleReturnRequested() {
  emit('returnRequested')
}

function isValidPositive(val: string): boolean {
  const trimmed = (val ?? '').trim()
  if (!trimmed || !/^\d+(\.\d{1,4})?$/.test(trimmed)) return false
  try {
    return new Decimal(trimmed).gt(0)
  } catch {
    return false
  }
}

const selectedAllocations = computed(() => {
  const list: Array<{
    proposalLineId: string
    quantity: string
    unitPrice: string
    quotationMaterialName: string
    mappingConfirmed: boolean
  }> = []

  if (!props.proposal?.lines) return list

  for (const line of props.proposal.lines) {
    const form = lineFormMap.value[line.lineId]
    if (!form) continue
    const allocQty = form.allocationQuantity.trim()
    if (allocQty && isValidPositive(allocQty)) {
      list.push({
        proposalLineId: line.lineId,
        quantity: allocQty,
        unitPrice: form.unitPrice.trim(),
        quotationMaterialName: form.quotationMaterialName.trim(),
        mappingConfirmed: form.mappingConfirmed,
      })
    }
  }
  return list
})

const formattedTotalOrderValue = computed(() => {
  let sum = new Decimal(0)
  for (const item of selectedAllocations.value) {
    if (isValidPositive(item.quantity) && isValidPositive(item.unitPrice)) {
      sum = sum.plus(new Decimal(item.quantity).times(item.unitPrice))
    }
  }
  return formatMaterialQuantity(sum.toFixed(4))
})

const createValidationReason = computed(() => {
  if (!isProposalApproved.value) return 'Phiếu chưa được duyệt.'
  if (!canonicalCurrency.value) return 'Chưa có đơn vị tiền tệ công ty.'
  if (!resolvedSupplierId.value) return 'Cần ghi nhận nhà cung cấp.'
  if (!finalizedEvidenceFileId.value) return 'Cần hoàn tất tệp báo giá PDF.'
  if (selectedAllocations.value.length === 0) return 'Chọn ít nhất 1 dòng vật tư để phân bổ đơn hàng.'

  for (const item of selectedAllocations.value) {
    const line = props.proposal.lines.find(l => l.lineId === item.proposalLineId)
    if (!line) return 'Dòng vật tư không tồn tại trên phiếu.'
    if (!item.quotationMaterialName) return `Dòng "${line.materialName}" chưa có tên trên báo giá.`
    if (!isValidPositive(item.quantity)) return `Dòng "${line.materialName}" số lượng phân bổ chưa hợp lệ.`
    if (!isValidPositive(item.unitPrice)) return `Dòng "${line.materialName}" đơn giá chưa hợp lệ.`
    if (new Decimal(item.quantity).gt(line.remainingQuantity)) {
      return `Dòng "${line.materialName}" số lượng phân bổ vượt quá số lượng còn lại.`
    }
    if (!item.mappingConfirmed) return `Dòng "${line.materialName}" chưa được xác nhận đối chiếu.`
  }
  return ''
})

const canCreateOrder = computed(() => {
  if (isRegularControlDisabled.value) return false
  return createValidationReason.value === ''
})

// Create Order Command State
interface CreateOrderCommand {
  readonly companyId: string
  readonly projectId: string
  readonly proposalId: string
  readonly approvedRevisionId: string
  readonly input: CreateMaterialOrderInput
  readonly idempotencyKey: string
}

const pendingCreateOrderCommand = ref<CreateOrderCommand | null>(null)
const createPostAcknowledged = ref(false)
const isCreatePostRejected = ref(false)
const createdOrderId = ref<string | null>(null)
const createActionError = ref('')
const isCreateBusy = ref(false)

function startCreateOrder() {
  if (!canCreateOrder.value || pendingCreateOrderCommand.value) return
  if (!isLiveScopeValid() || !props.proposal.approvedRevisionId || !resolvedSupplierId.value || !canonicalCurrency.value || !finalizedEvidenceFileId.value) return

  const inputPayload: CreateMaterialOrderInput = {
    approvedRevisionId: props.proposal.approvedRevisionId,
    supplierId: resolvedSupplierId.value,
    currencyCode: canonicalCurrency.value,
    unsignedQuotationEvidenceFileId: finalizedEvidenceFileId.value,
    allocations: selectedAllocations.value.map(a => ({
      proposalLineId: a.proposalLineId,
      quantity: a.quantity,
      unitPrice: a.unitPrice,
      quotationMaterialName: a.quotationMaterialName,
      mappingConfirmed: true as const,
    })),
  }

  const parsed = createMaterialOrderInputSchema.safeParse(inputPayload)
  if (!parsed.success) {
    createActionError.value = parsed.error.issues[0]?.message || 'Dữ liệu tạo đơn không hợp lệ.'
    return
  }

  const cmd: CreateOrderCommand = Object.freeze({
    companyId: props.companyId,
    projectId: props.projectId,
    proposalId: props.proposal.id,
    approvedRevisionId: props.proposal.approvedRevisionId,
    input: parsed.data,
    idempotencyKey: crypto.randomUUID(),
  })

  pendingCreateOrderCommand.value = cmd
  createPostAcknowledged.value = false
  isCreatePostRejected.value = false
  createdOrderId.value = null
  void executeCreateOrder(cmd)
}

async function executeCreateOrder(cmd: CreateOrderCommand) {
  const token = tracker.start({
    companyId: cmd.companyId,
    projectId: cmd.projectId,
    proposalId: cmd.proposalId,
    approvedRevisionId: cmd.approvedRevisionId,
    op: 'execute-create-order',
  })

  isCreateBusy.value = true
  createActionError.value = ''
  emitBusy(true)

  if (!createPostAcknowledged.value) {
    try {
      const res = await repo.createOrder(cmd.projectId, cmd.proposalId, cmd.input, { idempotencyKey: cmd.idempotencyKey })
      if (!token.isCurrent() || isDisposed || !isLiveScopeValid(cmd)) return
      createPostAcknowledged.value = true
      createdOrderId.value = res.resourceId
    } catch (err: unknown) {
      if (!token.isCurrent() || isDisposed || !isLiveScopeValid(cmd)) return
      isCreateBusy.value = false
      emitBusy(false)

      const errMsg = (err as Error)?.message || ''
      if (errMsg.includes('409') || errMsg.includes('CONFLICT') || errMsg.includes('VERSION_CONFLICT')) {
        isCreatePostRejected.value = true
        createActionError.value = 'Xung đột khi tạo đơn mua hàng (409). Máy chủ từ chối do dữ liệu đã thay đổi.'
        void refreshCanonicalOnly(cmd)
      } else {
        createActionError.value = 'Lỗi kết nối máy chủ. Lệnh tạo đơn chưa xác định được kết quả commit. Vui lòng bấm thử lại để tiếp tục với đúng lệnh này.'
      }
      return
    }
  }

  if (createPostAcknowledged.value && createdOrderId.value) {
    try {
      const [readOrd, canonicalProp, freshOrders] = await Promise.all([
        repo.readOrder(cmd.projectId, createdOrderId.value),
        repo.readProposal(cmd.projectId, cmd.proposalId),
        repo.listOrders(cmd.projectId),
      ])
      if (!token.isCurrent() || isDisposed || !isLiveScopeValid(cmd)) return

      if (canonicalProp.id !== cmd.proposalId || readOrd.id !== createdOrderId.value) {
        throw new Error('CANONICAL_IDENTITY_MISMATCH')
      }

      orders.value = freshOrders.filter(o => o.proposalId === cmd.proposalId)
      pendingCreateOrderCommand.value = null
      createPostAcknowledged.value = false
      isCreatePostRejected.value = false
      createdOrderId.value = null
      createActionError.value = ''
      isCreateBusy.value = false

      initLineFormMap()
      resolvedSupplierId.value = null
      selectedFile.value = null
      finalizedEvidenceFileId.value = null
      uploadSession.value = null

      emit('canonical', canonicalProp)
      emitBusy(false)
    } catch (err: unknown) {
      if (!token.isCurrent() || isDisposed || !isLiveScopeValid(cmd)) return
      isCreateBusy.value = false
      createActionError.value = 'Đã gửi lệnh; chưa xác nhận dữ liệu mới. Vui lòng bấm thử lại để tải lại dữ liệu.'
    }
  }
}

function retryPendingCreateCommand() {
  if (isRecoveryControlDisabled.value || !pendingCreateOrderCommand.value || createPostAcknowledged.value) return
  void executeCreateOrder(pendingCreateOrderCommand.value)
}

function retryCanonicalAfterCreate() {
  if (isRecoveryControlDisabled.value || !pendingCreateOrderCommand.value || !createPostAcknowledged.value) return
  void executeCreateOrder(pendingCreateOrderCommand.value)
}

// Cancel Order Command State
interface CancelOrderCommand {
  readonly companyId: string
  readonly projectId: string
  readonly proposalId: string
  readonly orderId: string
  readonly orderVersion: number
  readonly reason: string
  readonly idempotencyKey: string
}

const cancellingOrderId = ref<string | null>(null)
const cancelReason = ref('')
const cancelReasonError = ref('')
const pendingCancelCommand = ref<CancelOrderCommand | null>(null)
const cancelPostAcknowledged = ref(false)
const isCancelPostRejected = ref(false)
const isCancelBusy = ref(false)
const cancelActionError = ref('')

function canCancelOrder(order: MaterialOrderView): boolean {
  if (props.disabled || isTransportBusy.value) return false
  if (order.contract !== null) return false
  return order.orderState === 'active' || order.orderState === 'suspended'
}

function startCancelOrder(order: MaterialOrderView) {
  if (isRegularControlDisabled.value) return
  cancellingOrderId.value = order.id
  cancelReason.value = ''
  cancelReasonError.value = ''
  cancelActionError.value = ''
}

function closeCancelDialog() {
  if (isCancelBusy.value) return
  cancellingOrderId.value = null
  cancelReason.value = ''
  cancelReasonError.value = ''
}

function confirmCancelOrder() {
  if (!cancellingOrderId.value || isRegularControlDisabled.value || pendingCancelCommand.value) return
  const order = orders.value.find(o => o.id === cancellingOrderId.value)
  if (!order) return

  const trimmed = cancelReason.value.trim()
  if (!trimmed) {
    cancelReasonError.value = 'Vui lòng nhập lý do hủy đơn mua.'
    return
  }
  if (trimmed.length > 2000) {
    cancelReasonError.value = 'Lý do hủy không được vượt quá 2000 ký tự.'
    return
  }

  const cmd: CancelOrderCommand = Object.freeze({
    companyId: props.companyId,
    projectId: props.projectId,
    proposalId: props.proposal.id,
    orderId: order.id,
    orderVersion: order.version,
    reason: trimmed,
    idempotencyKey: crypto.randomUUID(),
  })

  pendingCancelCommand.value = cmd
  cancelPostAcknowledged.value = false
  isCancelPostRejected.value = false
  void executeCancelOrder(cmd)
}

async function executeCancelOrder(cmd: CancelOrderCommand) {
  const token = tracker.start({
    companyId: cmd.companyId,
    projectId: cmd.projectId,
    proposalId: cmd.proposalId,
    op: 'execute-cancel-order',
  })

  isCancelBusy.value = true
  cancelActionError.value = ''
  emitBusy(true)

  if (!cancelPostAcknowledged.value) {
    try {
      await repo.cancelOrder(cmd.projectId, cmd.orderId, {
        expectedOrderVersion: cmd.orderVersion,
        reason: cmd.reason,
      }, { idempotencyKey: cmd.idempotencyKey })

      if (!token.isCurrent() || isDisposed || !isLiveScopeValid(cmd)) return
      cancelPostAcknowledged.value = true
    } catch (err: unknown) {
      if (!token.isCurrent() || isDisposed || !isLiveScopeValid(cmd)) return
      isCancelBusy.value = false
      emitBusy(false)

      const errMsg = (err as Error)?.message || ''
      if (errMsg.includes('409') || errMsg.includes('CONFLICT') || errMsg.includes('VERSION_CONFLICT')) {
        isCancelPostRejected.value = true
        cancelActionError.value = 'Xung đột khi hủy đơn (409). Trạng thái đơn mua đã bị thay đổi hoặc đã ký hợp đồng.'
        void refreshCanonicalOnly(cmd)
      } else {
        cancelActionError.value = 'Lỗi kết nối máy chủ khi hủy đơn. Vui lòng bấm thử lại để tiếp tục với đúng lệnh này.'
      }
      return
    }
  }

  if (cancelPostAcknowledged.value) {
    try {
      const [readOrd, canonicalProp, freshOrders] = await Promise.all([
        repo.readOrder(cmd.projectId, cmd.orderId),
        repo.readProposal(cmd.projectId, cmd.proposalId),
        repo.listOrders(cmd.projectId),
      ])
      if (!token.isCurrent() || isDisposed || !isLiveScopeValid(cmd)) return

      orders.value = freshOrders.filter(o => o.proposalId === cmd.proposalId)
      pendingCancelCommand.value = null
      cancelPostAcknowledged.value = false
      isCancelPostRejected.value = false
      cancellingOrderId.value = null
      cancelReason.value = ''
      cancelActionError.value = ''
      isCancelBusy.value = false

      emit('canonical', canonicalProp)
      emitBusy(false)
    } catch (err: unknown) {
      if (!token.isCurrent() || isDisposed || !isLiveScopeValid(cmd)) return
      isCancelBusy.value = false
      cancelActionError.value = 'Đã gửi lệnh; chưa xác nhận dữ liệu mới. Vui lòng bấm thử lại.'
    }
  }
}

function retryPendingCancelCommand() {
  if (isRecoveryControlDisabled.value || !pendingCancelCommand.value || cancelPostAcknowledged.value) return
  void executeCancelOrder(pendingCancelCommand.value)
}

function retryCanonicalAfterCancel() {
  if (isRecoveryControlDisabled.value || !pendingCancelCommand.value || !cancelPostAcknowledged.value) return
  void executeCancelOrder(pendingCancelCommand.value)
}

async function refreshCanonicalOnly(cmd: { companyId: string; projectId: string; proposalId: string }) {
  try {
    const [canonicalProp, freshOrders] = await Promise.all([
      repo.readProposal(cmd.projectId, cmd.proposalId),
      repo.listOrders(cmd.projectId),
    ])
    if (isDisposed || !isLiveScopeValid(cmd)) return
    orders.value = freshOrders.filter(o => o.proposalId === cmd.proposalId)
    emit('canonical', canonicalProp)
  } catch {
    // Ignore secondary refresh failure
  }
}

async function retryCanonicalRefresh() {
  if (isRecoveryControlDisabled.value) return
  isCreatePostRejected.value = false
  isCancelPostRejected.value = false
  createActionError.value = ''
  cancelActionError.value = ''
  await refreshCanonicalOnly({
    companyId: props.companyId,
    projectId: props.projectId,
    proposalId: props.proposal.id,
  })
}

function computeOrderTotal(order: MaterialOrderView): string {
  let sum = new Decimal(0)
  for (const alloc of order.allocations) {
    if (isValidPositive(alloc.quantity) && isValidPositive(alloc.unitPrice)) {
      sum = sum.plus(new Decimal(alloc.quantity).times(alloc.unitPrice))
    }
  }
  return formatMaterialQuantity(sum.toFixed(4))
}

const generalError = ref('')

const isTransportBusy = computed(() => {
  return (
    isCurrencyLoading.value ||
    isOrdersLoading.value ||
    isResolvingSupplier.value ||
    isUploading.value ||
    isCreateBusy.value ||
    isCancelBusy.value
  )
})

const busyStatusMessage = computed(() => {
  if (isUploading.value) return 'Đang tải lên tệp báo giá PDF...'
  if (isResolvingSupplier.value) return 'Đang ghi nhận nhà cung cấp...'
  if (isCreateBusy.value) return 'Đang xử lý tạo đơn mua hàng...'
  if (isCancelBusy.value) return 'Đang xử lý hủy đơn mua hàng...'
  if (isCurrencyLoading.value) return 'Đang tải tiền tệ...'
  if (isOrdersLoading.value) return 'Đang tải danh sách đơn...'
  return 'Đang xử lý...'
})

const isRegularControlDisabled = computed(() => {
  return Boolean(
    props.disabled ||
    isTransportBusy.value ||
    pendingCreateOrderCommand.value ||
    pendingCancelCommand.value ||
    createPostAcknowledged.value ||
    cancelPostAcknowledged.value
  )
})

const isRecoveryControlDisabled = computed(() => {
  return Boolean(!isLiveScopeValid() || isTransportBusy.value)
})

// Watchers
watch(
  [
    () => companyAccess?.activeCompanyId,
    () => authStore?.user?.id,
    () => companyAccess?.hasPermission('material.read'),
    () => companyAccess?.hasPermission('material.order.manage'),
    () => props.companyId,
    () => props.projectId,
    () => props.proposal?.id,
    () => props.proposal?.approvedRevisionId,
  ],
  ([newCo, newActor, newRead, newManage, newPropCo, newPropProj, newPropProposal, newPropRev],
   [oldCo, oldActor, oldRead, oldManage, oldPropCo, oldPropProj, oldPropProposal, oldPropRev]) => {
    const changed =
      newCo !== oldCo ||
      newActor !== oldActor ||
      newRead !== oldRead ||
      newManage !== oldManage ||
      newPropCo !== oldPropCo ||
      newPropProj !== oldPropProj ||
      newPropProposal !== oldPropProposal ||
      newPropRev !== oldPropRev

    if (changed) {
      tracker.invalidate()
      isCreateBusy.value = false
      isCancelBusy.value = false
      pendingCreateOrderCommand.value = null
      createPostAcknowledged.value = false
      isCreatePostRejected.value = false
      createdOrderId.value = null
      pendingCancelCommand.value = null
      cancelPostAcknowledged.value = false
      isCancelPostRejected.value = false
      cancellingOrderId.value = null
      createActionError.value = ''
      cancelActionError.value = ''
      generalError.value = ''

      supplierCode.value = ''
      supplierDisplayName.value = ''
      supplierTaxIdentifier.value = ''
      supplierContactDisplayName.value = ''
      supplierContactPhone.value = ''
      supplierAlreadyChosenAcknowledged.value = false
      resolvedSupplierId.value = null
      lastResolvedInputJson.value = null
      selectedFile.value = null
      finalizedEvidenceFileId.value = null
      uploadSession.value = null
      initLineFormMap()

      if (isLiveScopeValid()) {
        void loadCurrency()
        void loadOrders()
      } else {
        canonicalCurrency.value = null
        orders.value = []
      }
    }
  },
  { flush: 'sync' },
)

onMounted(() => {
  initLineFormMap()
  if (isLiveScopeValid()) {
    void loadCurrency()
    void loadOrders()
  }
})

onUnmounted(() => {
  isDisposed = true
  tracker.invalidate()
})
</script>

<style scoped>
.material-order-create-panel {
  padding: 20px 24px;
  background: #ffffff;
  border-left: 4px solid var(--accent, #0284c7);
}

.panel-title {
  color: var(--ink, #0f172a);
}

.field-label {
  display: block;
  font-size: 0.8rem;
  font-weight: 600;
  color: #334155;
  margin-bottom: 4px;
}

.cockpit-input {
  padding: 8px 12px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  color: #0f172a;
  background: #ffffff;
  box-sizing: border-box;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.cockpit-input:focus {
  outline: none;
  border-color: #0284c7;
  box-shadow: 0 0 0 3px rgba(2, 132, 199, 0.15);
}

.cockpit-input:disabled {
  background: #f1f5f9;
  cursor: not-allowed;
  opacity: 0.7;
}

.cockpit-alert--warning {
  background: #fffbeb;
  color: #92400e;
  border: 1px solid #fde68a;
  padding: 12px 16px;
  border-radius: 6px;
  font-size: 0.88rem;
}

.cockpit-alert--danger {
  background: #fef2f2;
  color: #991b1b;
  border: 1px solid #fecaca;
  padding: 12px 16px;
  border-radius: 6px;
  font-size: 0.88rem;
}

.cockpit-alert--neutral {
  background: #f8fafc;
  color: #475569;
  border: 1px solid #e2e8f0;
  padding: 12px 16px;
  border-radius: 6px;
  font-size: 0.88rem;
}

.busy-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: #f0f9ff;
  border: 1px solid #bae6fd;
  border-radius: 6px;
}

.cockpit-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  text-decoration: none;
  transition: background 0.15s ease, opacity 0.15s ease;
  border: none;
}

.cockpit-btn--primary {
  background: #0284c7;
  color: #ffffff;
}

.cockpit-btn--primary:hover:not(:disabled) {
  background: #0369a1;
}

.cockpit-btn--secondary {
  background: #ffffff;
  color: #334155;
  border: 1px solid #cbd5e1;
}

.cockpit-btn--secondary:hover:not(:disabled) {
  background: #f8fafc;
}

.cockpit-btn--danger {
  background: #dc2626;
  color: #ffffff;
}

.cockpit-btn--danger:hover:not(:disabled) {
  background: #b91c1c;
}

.cockpit-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.btn-sm {
  padding: 5px 12px;
  font-size: 0.8rem;
}

.cockpit-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 600;
}

.cockpit-badge--neutral {
  background: #f1f5f9;
  color: #475569;
}

.orders-table-wrapper {
  max-width: 100%;
}
</style>
