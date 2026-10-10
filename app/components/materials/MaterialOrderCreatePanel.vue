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

    <!-- Alert 3: Create POST was rejected with API Denial / Conflict (409) -->
    <div v-else-if="isCreatePostRejected" class="cockpit-alert cockpit-alert--danger mt-4" role="alert">
      <div class="flex items-start gap-2">
        <UIcon name="i-lucide-alert-circle" class="text-rose-600 text-base shrink-0 mt-0.5" aria-hidden="true" />
        <div class="flex-1">
          <p class="font-semibold text-rose-900">{{ createActionError }}</p>
          <p class="text-sm text-rose-800 mt-0.5">
            Máy chủ đã từ chối lệnh tạo đơn. Bấm "Tải lại dữ liệu" để đồng bộ số lượng còn lại mới nhất từ hệ thống trước khi lập đơn mới.
          </p>
          <div class="mt-2.5">
            <button
              type="button"
              class="cockpit-btn cockpit-btn--secondary btn-sm"
              :disabled="isRecoveryControlDisabled"
              @click="retryCanonicalRejectionRefresh"
            >
              <UIcon v-if="isRejectionRefreshBusy" name="i-lucide-loader-2" class="animate-spin text-sm" aria-hidden="true" />
              <UIcon v-else name="i-lucide-refresh-cw" class="text-sm" aria-hidden="true" />
              Tải lại dữ liệu
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Alert 4: Cancel POST was rejected with API Denial / Conflict (409) -->
    <div v-else-if="isCancelPostRejected" class="cockpit-alert cockpit-alert--danger mt-4" role="alert">
      <div class="flex items-start gap-2">
        <UIcon name="i-lucide-alert-circle" class="text-rose-600 text-base shrink-0 mt-0.5" aria-hidden="true" />
        <div class="flex-1">
          <p class="font-semibold text-rose-900">{{ cancelActionError }}</p>
          <p class="text-sm text-rose-800 mt-0.5">
            Máy chủ từ chối hủy đơn. Bấm "Tải lại dữ liệu" để đồng bộ trạng thái mới nhất từ máy chủ.
          </p>
          <div class="mt-2.5">
            <button
              type="button"
              class="cockpit-btn cockpit-btn--secondary btn-sm"
              :disabled="isRecoveryControlDisabled"
              @click="retryCanonicalRejectionRefresh"
            >
              <UIcon v-if="isRejectionRefreshBusy" name="i-lucide-loader-2" class="animate-spin text-sm" aria-hidden="true" />
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
      <div class="flex items-start justify-between gap-2">
        <div class="flex items-start gap-2 flex-1">
          <UIcon name="i-lucide-alert-circle" class="text-rose-600 text-base shrink-0 mt-0.5" aria-hidden="true" />
          <p class="font-semibold text-rose-900 flex-1">{{ generalError }}</p>
        </div>
        <button
          type="button"
          class="text-rose-600 hover:text-rose-800 text-xs p-1"
          aria-label="Đóng thông báo lỗi"
          @click="generalError = ''"
        >
          <UIcon name="i-lucide-x" class="text-sm" aria-hidden="true" />
        </button>
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
              @input="onSupplierCodeInput"
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
              @input="onSupplierDisplayNameInput"
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
              @input="onSupplierTaxInput"
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
              @input="onSupplierContactNameInput"
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
              @input="onSupplierContactPhoneInput"
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
                @change="onSupplierAckChange"
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
          <div class="flex items-center gap-2">
            <span v-if="finalizedEvidenceFileId" class="cockpit-badge bg-emerald-100 text-emerald-800 text-xs flex items-center gap-1 font-semibold">
              <UIcon name="i-lucide-check" class="text-xs" aria-hidden="true" />
              Báo giá đã hoàn tất
            </span>
            <span
              v-if="analysisResult"
              class="cockpit-badge text-xs flex items-center gap-1 font-semibold"
              :class="analysisResult.matched ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'"
            >
              <UIcon :name="analysisResult.matched ? 'i-lucide-sparkles' : 'i-lucide-alert-circle'" class="text-xs" aria-hidden="true" />
              AI: {{ analysisResult.matched ? 'Khớp toàn bộ' : 'Cần kiểm tra' }}
            </span>
          </div>
        </div>

        <p class="text-xs text-slate-600 mb-3">
          Tải lên báo giá dạng PDF (&le; 25 MiB). Hệ thống tự động phân tích báo giá bằng AI và điền bản nháp để đối chiếu.
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
            <UIcon v-if="isPdfReading" name="i-lucide-loader-2" class="animate-spin text-sm" aria-hidden="true" />
            <UIcon v-else name="i-lucide-external-link" class="text-sm" aria-hidden="true" />
            Xem PDF báo giá
          </button>

          <!-- Nút phân tích lại chủ động -->
          <button
            v-if="finalizedEvidenceFileId"
            type="button"
            class="cockpit-btn cockpit-btn--secondary btn-sm"
            :disabled="isRegularControlDisabled || isRecoveryControlDisabled || isAnalyzing"
            @click="runQuotationAnalysis(finalizedEvidenceFileId)"
          >
            <UIcon v-if="isAnalyzing" name="i-lucide-loader-2" class="animate-spin text-sm" aria-hidden="true" />
            <UIcon v-else name="i-lucide-sparkles" class="text-sm text-sky-600" aria-hidden="true" />
            Phân tích lại (AI)
          </button>
        </div>

        <div v-if="selectedFile" class="text-xs text-slate-500 mt-2 flex items-center gap-2">
          <span>Tệp: <strong>{{ selectedFile.name }}</strong> ({{ (selectedFile.size / 1024 / 1024).toFixed(2) }} MiB)</span>
          <span v-if="uploadSession" class="text-slate-400 italic">· Phiên tải: đang ghi nhận</span>
        </div>

        <div v-if="uploadError" class="text-xs text-rose-600 mt-2 font-medium" role="alert">
          {{ uploadError }}
        </div>

        <!-- AI Analysis Loading State -->
        <div v-if="isAnalyzing" class="mt-3 p-3 bg-sky-50 border border-sky-200 rounded-lg flex items-center gap-2.5 text-xs text-sky-800" role="status">
          <UIcon name="i-lucide-loader-2" class="animate-spin text-sky-600 text-sm shrink-0" aria-hidden="true" />
          <span>Đang dùng AI (gpt-5.4-mini) đọc và phân tích dữ liệu báo giá PDF...</span>
        </div>

        <!-- AI Analysis Error Alert (Non-blocking: PDF preserved, manual entry allowed) -->
        <div v-else-if="analysisError" class="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800" role="alert">
          <div class="flex items-start gap-2">
            <UIcon name="i-lucide-alert-triangle" class="text-amber-600 text-sm shrink-0 mt-0.5" aria-hidden="true" />
            <div class="flex-1">
              <p class="font-semibold text-amber-900 m-0">{{ analysisError }}</p>
              <p class="text-amber-700 mt-0.5 m-0">Tệp PDF vẫn được lưu trữ làm bằng chứng. Bạn có thể tự nhập thông tin thủ công bên dưới hoặc bấm "Phân tích lại (AI)".</p>
            </div>
          </div>
        </div>

        <!-- AI Analysis Succeeded Review Summary -->
        <div v-else-if="analysisResult" class="mt-3 p-3 bg-white border border-slate-200 rounded-lg text-xs space-y-2">
          <div class="flex items-center justify-between gap-2 flex-wrap">
            <div class="flex items-center gap-2 font-semibold text-slate-800">
              <UIcon name="i-lucide-bot" class="text-sky-600 text-sm" aria-hidden="true" />
              <span>Kết quả phân tích báo giá (AI gpt-5.4-mini)</span>
            </div>
            <span class="font-medium" :class="analysisResult.matched ? 'text-emerald-700' : 'text-amber-700'">
              {{ analysisResult.matched ? 'Tất cả các dòng khớp đề xuất' : 'Một số dòng cần kiểm tra lại' }}
            </span>
          </div>

          <div v-if="analysisResult.warnings.length > 0" class="p-2 bg-amber-50 border border-amber-100 rounded text-amber-800 space-y-1">
            <div class="font-semibold text-amber-900 flex items-center gap-1">
              <UIcon name="i-lucide-info" class="text-xs" aria-hidden="true" />
              Lưu ý đối chiếu:
            </div>
            <ul class="list-disc list-inside space-y-0.5 pl-1 text-slate-700">
              <li v-for="(w, idx) in analysisResult.warnings" :key="idx">{{ w }}</li>
            </ul>
          </div>
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
          <div
            v-for="line in proposal.lines"
            :key="line.lineId"
            class="line-allocation-block space-y-1"
          >
            <!-- Per-line AI Comparison Summary (if analysisResult exists) -->
            <div
              v-if="analysisLineMap[line.lineId]"
              class="ai-line-status-bar px-3 py-1.5 rounded-t border border-b-0 text-xs flex items-center justify-between gap-2 flex-wrap"
              :class="analysisLineMap[line.lineId]?.matched ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-amber-50 border-amber-200 text-amber-900'"
            >
              <div class="flex items-center gap-2">
                <UIcon
                  :name="analysisLineMap[line.lineId]?.matched ? 'i-lucide-check-circle-2' : 'i-lucide-alert-circle'"
                  class="text-sm shrink-0"
                  :class="analysisLineMap[line.lineId]?.matched ? 'text-emerald-600' : 'text-amber-600'"
                  aria-hidden="true"
                />
                <span class="font-semibold">
                  AI đối chiếu: {{ analysisLineMap[line.lineId]?.matched ? 'Khớp' : 'Cần kiểm tra' }}
                </span>
                <span v-if="analysisLineMap[line.lineId]?.sourcePage" class="text-slate-500 font-normal">
                  (Trang {{ analysisLineMap[line.lineId]?.sourcePage }})
                </span>
              </div>

              <div class="flex items-center gap-2 flex-wrap text-xs">
                <span
                  class="cockpit-badge"
                  :class="analysisLineMap[line.lineId]?.quantityMatchesProposal ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800 font-semibold'"
                >
                  {{ analysisLineMap[line.lineId]?.quantityMatchesProposal ? 'Khớp số lượng' : 'Số lượng khác đề xuất' }}
                </span>
                <span
                  v-if="analysisLineMap[line.lineId]?.suggestedAllocationQuantity"
                  class="cockpit-badge bg-sky-100 text-sky-800"
                >
                  Gợi ý phân bổ: {{ analysisLineMap[line.lineId]?.suggestedAllocationQuantity }}
                </span>
              </div>

              <!-- Per-line warnings if any -->
              <div
                v-if="(analysisLineMap[line.lineId]?.warnings?.length || 0) > 0"
                class="w-full text-xs text-amber-800 mt-1 pl-5"
              >
                <span v-for="(w, wIdx) in analysisLineMap[line.lineId]?.warnings" :key="wIdx" class="mr-2 inline-block">
                  &bull; {{ w }}
                </span>
              </div>
            </div>

            <MaterialQuotationComparisonPanel
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
        </div>

        <!-- Line Validation Errors Alert -->
        <div v-if="lineValidationErrors.length > 0" class="mt-3 p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 space-y-1" role="alert">
          <div class="font-semibold text-rose-900 flex items-center gap-1.5">
            <UIcon name="i-lucide-alert-circle" class="text-sm shrink-0" aria-hidden="true" />
            Có {{ lineValidationErrors.length }} lỗi phân bổ dòng vật tư:
          </div>
          <ul class="list-disc list-inside space-y-0.5 text-rose-700">
            <li v-for="err in lineValidationErrors" :key="err.lineId + err.message">
              {{ err.message }}
            </li>
          </ul>
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
                <div v-if="order.approvedRevisionId" class="text-[10px] text-slate-400 font-mono">
                  Đợt: {{ order.approvedRevisionId.slice(0, 8) }}...
                </div>
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
                <div class="space-y-1.5">
                  <div
                    v-for="alloc in order.allocations"
                    :key="alloc.orderLineId"
                    class="allocation-line text-[11px] text-slate-700 bg-slate-50 p-1.5 rounded border border-slate-100"
                  >
                    <div class="font-medium text-slate-800">
                      {{ alloc.materialName }}
                      <span v-if="alloc.specification" class="text-slate-500 font-mono text-[10px]">
                        ({{ alloc.specification }})
                      </span>
                    </div>
                    <div class="text-slate-500 text-[10px]">
                      Báo giá: <span class="font-medium text-slate-700">{{ alloc.quotationMaterialName }}</span>
                    </div>
                    <div class="font-mono text-slate-800 mt-0.5">
                      <span class="font-bold text-sky-800">{{ formatMaterialQuantity(alloc.quantity) }} {{ alloc.unit }}</span>
                      <span class="text-slate-400"> &times; </span>
                      <span>{{ alloc.unitPrice }}</span>
                    </div>
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
                <span v-else class="text-slate-500 text-[11px] italic">
                  Chưa có dữ liệu hợp đồng
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
import type {
  MaterialQuotationAnalysisInput,
  MaterialQuotationAnalysisResult,
} from '../../../shared/schemas/costs/material-quotation-analysis'
import { workflowUuidSchema, workflowMoneySchema } from '../../../shared/schemas/costs/cost-workflow'
import { ClientError } from '../../errors/client-error'
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
  actorId?: string
  op?: string
  tokenKey?: string
}

// F1: Independent AsyncRequestTrackers per stream
const currencyTracker = createAsyncRequestTracker<TrackerScope>()
const ordersTracker = createAsyncRequestTracker<TrackerScope>()
const supplierTracker = createAsyncRequestTracker<TrackerScope>()
const uploadTracker = createAsyncRequestTracker<TrackerScope>()
const analysisTracker = createAsyncRequestTracker<TrackerScope>()
const mutationTracker = createAsyncRequestTracker<TrackerScope>()
const pdfReadTracker = createAsyncRequestTracker<TrackerScope>()

let isDisposed = false
let lastEmittedBusy = false

function isPanelBusy(): boolean {
  return Boolean(
    isResolvingSupplier.value ||
    isUploading.value ||
    isAnalyzing.value ||
    isCreateBusy.value ||
    isCancelBusy.value ||
    isRejectionRefreshBusy.value ||
    pendingCreateOrderCommand.value ||
    pendingCancelCommand.value ||
    createPostAcknowledged.value ||
    cancelPostAcknowledged.value
  )
}

function syncParentBusy() {
  emitBusy(isPanelBusy())
}

function emitBusy(val: boolean) {
  if (isDisposed) {
    if (!val && lastEmittedBusy) {
      lastEmittedBusy = false
      emit('busy', false)
    }
    return
  }
  const effectiveVal = val ? true : isPanelBusy()
  if (lastEmittedBusy !== effectiveVal) {
    lastEmittedBusy = effectiveVal
    emit('busy', effectiveVal)
  }
}

function invalidateAllTrackers() {
  currencyTracker.invalidate()
  ordersTracker.invalidate()
  supplierTracker.invalidate()
  uploadTracker.invalidate()
  analysisTracker.invalidate()
  mutationTracker.invalidate()
  pdfReadTracker.invalidate()
}

// Scope & Permission validation
function isLiveScopeValid(cmd?: {
  companyId: string
  projectId: string
  proposalId: string
  approvedRevisionId?: string | null
  actorId?: string
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
    if (cmd.actorId && cmd.actorId !== currentUserId) return false
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

// F2: ClientError parser
function parseApiError(err: unknown): { code?: string; status?: number; kind?: string; message: string } {
  if (err instanceof ClientError) {
    return {
      code: err.code,
      kind: err.kind,
      message: err.message,
    }
  }
  const anyErr = err as { code?: string; statusCode?: number; status?: number; kind?: string; message?: string }
  return {
    code: anyErr?.code,
    status: anyErr?.statusCode ?? anyErr?.status,
    kind: anyErr?.kind,
    message: (err instanceof Error) ? err.message : String(err ?? 'Lỗi không xác định'),
  }
}

function isApiDenialOrConflict(errInfo: { code?: string; status?: number; kind?: string }): boolean {
  return (
    errInfo.status === 409 ||
    errInfo.code === 'PROJECT_COMPLETED' ||
    errInfo.code === 'VERSION_CONFLICT' ||
    errInfo.code === 'IDEMPOTENCY_CONFLICT' ||
    errInfo.code === 'MATERIAL_ALLOCATION_EXCEEDED' ||
    errInfo.code === 'INPUT_INVALID' ||
    errInfo.code === 'RESOURCE_NOT_FOUND' ||
    errInfo.code === 'PERMISSION_DENIED' ||
    errInfo.code === 'COMPANY_FORBIDDEN' ||
    errInfo.kind === 'authorization' ||
    errInfo.kind === 'validation'
  )
}

// Currency
const canonicalCurrency = ref<string | null>(null)
const isCurrencyLoading = ref(false)
const currencyError = ref('')

async function loadCurrency() {
  if (!isLiveScopeValid()) return
  const token = currencyTracker.start({
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
  const token = ordersTracker.start({
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

const userEditedSupplierFields = ref({
  displayName: false,
  taxIdentifier: false,
  contactDisplayName: false,
  contactPhone: false,
})

const aiOwnedSupplierFields = ref({
  displayName: false,
  taxIdentifier: false,
  contactDisplayName: false,
  contactPhone: false,
})

const resolvedSupplierId = ref<string | null>(null)
const lastResolvedInputJson = ref<string | null>(null)
const supplierResolutionKey = ref<string>(crypto.randomUUID())
const isResolvingSupplier = ref(false)
const supplierResolveError = ref('')

function onResolvedSupplierInvalidated() {
  if (resolvedSupplierId.value !== null) {
    resolvedSupplierId.value = null
    supplierResolutionKey.value = crypto.randomUUID()
    // Retain selectedFile bytes for fresh finalization, but invalidate proof & session
    finalizedEvidenceFileId.value = null
    uploadSession.value = null
    uploadError.value = ''
    resetLineConfirmations()
  }
}

// G3: Completing mandatory code or ACK for same PDF-derived supplier does NOT wipe descriptor or retract drafts
function onSupplierCodeInput() {
  onResolvedSupplierInvalidated()
  supplierResolveError.value = ''
}

function onSupplierAckChange() {
  onResolvedSupplierInvalidated()
  supplierResolveError.value = ''
}

function handleSupplierDescriptorChanged(field: 'displayName' | 'taxIdentifier' | 'contactDisplayName' | 'contactPhone') {
  supplierResolveError.value = ''

  if (resolvedSupplierId.value !== null) {
    onResolvedSupplierInvalidated()
    if (analysisResult.value !== null || analysisError.value !== '' || isAnalyzing.value) {
      analysisTracker.invalidate()
      if (isAnalyzing.value) {
        isAnalyzing.value = false
        syncParentBusy()
      }
      analysisResult.value = null
      analysisError.value = ''
      retractAiOwnedDrafts()
    }
    return
  }

  // Before resolution: only a genuine vendor name change away from analyzed supplier retires conflicting proof and mismatched draft
  if (field === 'displayName' && analysisResult.value?.supplier?.name) {
    const aiName = analysisResult.value.supplier.name.trim()
    const currentName = supplierDisplayName.value.trim()
    if (currentName !== '' && currentName !== aiName) {
      finalizedEvidenceFileId.value = null
      uploadSession.value = null
      uploadError.value = ''
      analysisTracker.invalidate()
      if (isAnalyzing.value) {
        isAnalyzing.value = false
        syncParentBusy()
      }
      analysisResult.value = null
      analysisError.value = ''
      retractAiOwnedDrafts()
      resetLineConfirmations()
    }
  }
}

function onSupplierDisplayNameInput() {
  userEditedSupplierFields.value.displayName = true
  aiOwnedSupplierFields.value.displayName = false
  handleSupplierDescriptorChanged('displayName')
}

function onSupplierTaxInput() {
  userEditedSupplierFields.value.taxIdentifier = true
  aiOwnedSupplierFields.value.taxIdentifier = false
  handleSupplierDescriptorChanged('taxIdentifier')
}

function onSupplierContactNameInput() {
  userEditedSupplierFields.value.contactDisplayName = true
  aiOwnedSupplierFields.value.contactDisplayName = false
  handleSupplierDescriptorChanged('contactDisplayName')
}

function onSupplierContactPhoneInput() {
  userEditedSupplierFields.value.contactPhone = true
  aiOwnedSupplierFields.value.contactPhone = false
  handleSupplierDescriptorChanged('contactPhone')
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

  const previousLastJson = lastResolvedInputJson.value
  const currentJson = JSON.stringify(parsed.data)
  if (currentJson !== previousLastJson) {
    supplierResolutionKey.value = crypto.randomUUID()
    lastResolvedInputJson.value = currentJson
    if (previousLastJson !== null) {
      // Retain selectedFile bytes for fresh finalization, but invalidate proof & session on genuine supplier change
      finalizedEvidenceFileId.value = null
      uploadSession.value = null
      uploadError.value = ''
      resetLineConfirmations()
    }
  }

  const token = supplierTracker.start({
    companyId: props.companyId,
    projectId: props.projectId,
    proposalId: props.proposal.id,
    actorId: authStore?.user?.id ?? '',
    op: 'resolve-supplier',
  })

  isResolvingSupplier.value = true
  supplierResolveError.value = ''
  emitBusy(true)

  try {
    const res = await repo.resolveSupplier(parsed.data, { idempotencyKey: supplierResolutionKey.value })
    // F5: Guard token, disposed, scope and material.supplier.record permission
    if (!token.isCurrent() || isDisposed || !isLiveScopeValid() || !canRecordSupplier.value) return
    resolvedSupplierId.value = res.resourceId
    lastResolvedInputJson.value = currentJson
  } catch (err: unknown) {
    if (!token.isCurrent() || isDisposed || !isLiveScopeValid()) return
    const errInfo = parseApiError(err)
    supplierResolveError.value = errInfo.message || 'Lỗi khi ghi nhận nhà cung cấp.'
  } finally {
    if (token.isCurrent() && !isDisposed) {
      isResolvingSupplier.value = false
      syncParentBusy()
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
  analysisResult.value = null
  analysisError.value = ''
  analysisTracker.invalidate()
  retractAiOwnedDrafts()
  resetLineConfirmations()
}

async function handleUploadPdf() {
  if (!isLiveScopeValid() || !selectedFile.value || isRegularControlDisabled.value) return
  if (!props.proposal.approvedRevisionId) {
    uploadError.value = 'Phiếu chưa có phiên bản duyệt hợp lệ để đính kèm báo giá.'
    return
  }

  const token = uploadTracker.start({
    companyId: props.companyId,
    projectId: props.projectId,
    proposalId: props.proposal.id,
    approvedRevisionId: props.proposal.approvedRevisionId,
    actorId: authStore?.user?.id ?? '',
    op: 'upload-evidence',
  })

  isUploading.value = true
  uploadError.value = ''
  emitBusy(true)

  let newlyFinalizedFileId: string | null = null

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
    newlyFinalizedFileId = result.evidenceFileId
  } catch (err: unknown) {
    if (!token.isCurrent() || isDisposed || !isLiveScopeValid()) return
    const errInfo = parseApiError(err)
    uploadError.value = errInfo.message || 'Lỗi tải lên và hoàn tất báo giá PDF.'
  } finally {
    if (token.isCurrent() && !isDisposed) {
      isUploading.value = false
      syncParentBusy()
    }
  }

  // Trigger analysis once for this newly finalized file after upload busy has ended
  if (newlyFinalizedFileId && token.isCurrent() && !isDisposed && isLiveScopeValid()) {
    void runQuotationAnalysis(newlyFinalizedFileId)
  }
}

// F5: Scoped PDF reading with pdfReadTracker
const isPdfReading = ref(false)

async function openEvidencePdf(fileId: string) {
  if (!isLiveScopeValid() || !fileId || isPdfReading.value) return
  const token = pdfReadTracker.start({
    companyId: props.companyId,
    projectId: props.projectId,
    proposalId: props.proposal.id,
    actorId: authStore?.user?.id ?? '',
    op: 'open-pdf',
  })
  isPdfReading.value = true
  generalError.value = ''
  try {
    const res = await repo.readEvidenceUrl(props.projectId, fileId, { disposition: 'inline' })
    if (!token.isCurrent() || isDisposed || !isLiveScopeValid()) return
    if (res?.url) {
      window.open(res.url, '_blank', 'noopener,noreferrer')
    }
  } catch (err: unknown) {
    if (!token.isCurrent() || isDisposed || !isLiveScopeValid()) return
    generalError.value = 'Không thể mở tệp PDF báo giá. Vui lòng thử lại.'
  } finally {
    if (token.isCurrent() && !isDisposed) {
      isPdfReading.value = false
    }
  }
}

// AI Quotation Analysis State
const isAnalyzing = ref(false)
const analysisError = ref('')
const analysisResult = ref<MaterialQuotationAnalysisResult | null>(null)

interface LineFieldTrack {
  allocationQuantity: boolean
  unitPrice: boolean
  quotedQuantity: boolean
  quotationMaterialName: boolean
}
const userEditedLineFields = ref<Record<string, LineFieldTrack>>({})
const aiOwnedLineFields = ref<Record<string, LineFieldTrack>>({})

const analysisLineMap = computed(() => {
  const map: Record<string, MaterialQuotationAnalysisResult['lines'][number]> = {}
  if (!analysisResult.value?.lines) return map
  for (const l of analysisResult.value.lines) {
    map[l.proposalLineId] = l
  }
  return map
})

function getCanonicalLineProjection(): string {
  if (!props.proposal?.lines) return '[]'
  return JSON.stringify(
    props.proposal.lines.map(l => ({
      lineId: l.lineId,
      materialId: l.materialId,
      materialName: l.materialName,
      specification: l.specification,
      unit: l.unit,
      quantity: l.quantity,
      remainingQuantity: l.remainingQuantity,
      allocatedQuantity: l.allocatedQuantity,
      engineerProposedInvoiceName: l.engineerProposedInvoiceName,
      buyerProposedInvoiceName: l.buyerProposedInvoiceName,
      effectiveInvoiceDisplayName: l.effectiveInvoiceDisplayName,
      buyerOverrideVersion: l.buyerOverrideVersion,
    })),
  )
}

// F2: Minimal analysis-input identity covering all actual inputs
const analysisInputKey = computed(() => {
  return [
    props.companyId,
    props.projectId,
    props.proposal?.id ?? '',
    props.proposal?.approvedRevisionId ?? '',
    String(props.proposal?.version ?? ''),
    canonicalCurrency.value ?? '',
    finalizedEvidenceFileId.value ?? '',
    uploadSession.value?.session?.finalized?.sha256 ?? '',
    getCanonicalLineProjection(),
  ].join('|')
})

const activeAnalysisInputKey = ref<string | null>(null)

function hasAiOwnedDrafts(): boolean {
  if (
    aiOwnedSupplierFields.value.displayName ||
    aiOwnedSupplierFields.value.taxIdentifier ||
    aiOwnedSupplierFields.value.contactDisplayName ||
    aiOwnedSupplierFields.value.contactPhone
  ) {
    return true
  }
  for (const track of Object.values(aiOwnedLineFields.value)) {
    if (track && (track.quotationMaterialName || track.quotedQuantity || track.unitPrice || track.allocationQuantity)) {
      return true
    }
  }
  return false
}

// G1: Synchronous watcher invalidates stale identity, cancels truly old running requests, and retracts old drafts
watch(
  analysisInputKey,
  (newKey, oldKey) => {
    if (newKey !== oldKey) {
      if (isAnalyzing.value && activeAnalysisInputKey.value && activeAnalysisInputKey.value !== newKey) {
        analysisTracker.invalidate()
        isAnalyzing.value = false
        activeAnalysisInputKey.value = null
        syncParentBusy()
      }
      if (analysisResult.value !== null || analysisError.value !== '' || hasAiOwnedDrafts()) {
        analysisResult.value = null
        analysisError.value = ''
        retractAiOwnedDrafts()
        resetLineConfirmations()
      }
    }
  },
  { flush: 'sync' },
)

// F1: Retract only AI-owned fields when source changes, keeping buyer edits intact
function retractAiOwnedDrafts() {
  if (!resolvedSupplierId.value) {
    if (aiOwnedSupplierFields.value.displayName && !userEditedSupplierFields.value.displayName) {
      supplierDisplayName.value = ''
      aiOwnedSupplierFields.value.displayName = false
    }
    if (aiOwnedSupplierFields.value.taxIdentifier && !userEditedSupplierFields.value.taxIdentifier) {
      supplierTaxIdentifier.value = ''
      aiOwnedSupplierFields.value.taxIdentifier = false
    }
    if (aiOwnedSupplierFields.value.contactDisplayName && !userEditedSupplierFields.value.contactDisplayName) {
      supplierContactDisplayName.value = ''
      aiOwnedSupplierFields.value.contactDisplayName = false
    }
    if (aiOwnedSupplierFields.value.contactPhone && !userEditedSupplierFields.value.contactPhone) {
      supplierContactPhone.value = ''
      aiOwnedSupplierFields.value.contactPhone = false
    }
  }

  if (props.proposal?.lines) {
    for (const line of props.proposal.lines) {
      const lineId = line.lineId
      const form = lineFormMap.value[lineId]
      const aiOwned = aiOwnedLineFields.value[lineId]
      const userEdited = userEditedLineFields.value[lineId]
      if (!form || !aiOwned) continue

      if (aiOwned.quotationMaterialName && !userEdited?.quotationMaterialName) {
        form.quotationMaterialName = ''
        aiOwned.quotationMaterialName = false
      }
      if (aiOwned.quotedQuantity && !userEdited?.quotedQuantity) {
        form.quotedQuantity = ''
        aiOwned.quotedQuantity = false
      }
      if (aiOwned.unitPrice && !userEdited?.unitPrice) {
        form.unitPrice = ''
        aiOwned.unitPrice = false
      }
      if (aiOwned.allocationQuantity && !userEdited?.allocationQuantity) {
        form.allocationQuantity = ''
        aiOwned.allocationQuantity = false
      }
      form.mappingConfirmed = false
    }
  }
}

function resetAiOwnedState() {
  aiOwnedSupplierFields.value = {
    displayName: false,
    taxIdentifier: false,
    contactDisplayName: false,
    contactPhone: false,
  }
  const aiMap: Record<string, LineFieldTrack> = {}
  if (props.proposal?.lines) {
    for (const line of props.proposal.lines) {
      aiMap[line.lineId] = {
        quotationMaterialName: false,
        quotedQuantity: false,
        unitPrice: false,
        allocationQuantity: false,
      }
    }
  }
  aiOwnedLineFields.value = aiMap
}

async function runQuotationAnalysis(targetFileId?: string | null) {
  const fileId = targetFileId || finalizedEvidenceFileId.value
  if (!fileId || !isLiveScopeValid() || isAnalyzing.value) return
  if (isRegularControlDisabled.value) return
  if (!props.proposal.approvedRevisionId) return

  // F2 & G5: Clear prior result and line confirmations immediately
  analysisResult.value = null
  analysisError.value = ''
  resetLineConfirmations()

  // Verify hash from finalized upload session
  const expectedSha256 = uploadSession.value?.session?.finalized?.sha256
  if (!expectedSha256) {
    analysisError.value = 'Chưa xác định được mã băm SHA-256 của tệp báo giá đã tải lên. Vui lòng tải lại tệp.'
    return
  }

  // F2 & G1: Capture cache/source identity before request
  const capturedInputKey = analysisInputKey.value
  activeAnalysisInputKey.value = capturedInputKey
  const currentRevisionId = props.proposal.approvedRevisionId
  const currentVersion = props.proposal.version

  const scope: TrackerScope = {
    companyId: props.companyId,
    projectId: props.projectId,
    proposalId: props.proposal.id,
    approvedRevisionId: currentRevisionId,
    actorId: authStore?.user?.id ?? '',
    op: 'analyze-quotation',
    tokenKey: fileId,
  }

  const token = analysisTracker.start(scope)
  isAnalyzing.value = true
  syncParentBusy()

  try {
    const result = await repo.analyzeQuotation(props.projectId, props.proposal.id, {
      evidenceFileId: fileId,
      approvedRevisionId: currentRevisionId,
      expectedProposalVersion: currentVersion,
    })

    if (!token.isCurrent() || isDisposed || !isLiveScopeValid()) return

    // 1. Verify source identity against current context
    if (
      result.source.companyId !== props.companyId ||
      result.source.projectId !== props.projectId ||
      result.source.proposalId !== props.proposal.id ||
      result.source.approvedRevisionId !== props.proposal.approvedRevisionId ||
      result.source.proposalVersion !== props.proposal.version ||
      result.source.evidenceFileId !== finalizedEvidenceFileId.value ||
      result.source.actorId !== authStore?.user?.id
    ) {
      analysisError.value = 'Thông tin nguồn phân tích không khớp với ngữ cảnh hiện tại.'
      return
    }

    // 2. Verify SHA-256 match
    if (result.source.sha256 !== expectedSha256) {
      analysisError.value = 'Mã băm SHA-256 của tệp báo giá không khớp với kết quả phân tích.'
      return
    }

    // 3. Verify captured input key matches current input key
    if (analysisInputKey.value !== capturedInputKey) {
      analysisError.value = 'Dữ liệu vật tư hoặc tiền tệ đã thay đổi trong lúc phân tích. Vui lòng phân tích lại.'
      return
    }

    analysisResult.value = result
    applyQuotationAnalysisDraft(result)
  } catch (err: unknown) {
    if (!token.isCurrent() || isDisposed || !isLiveScopeValid()) return
    const errInfo = parseApiError(err)
    analysisError.value = errInfo.message || 'Không thể phân tích báo giá. Bạn có thể nhập tay.'
  } finally {
    if (token.isCurrent() && !isDisposed) {
      isAnalyzing.value = false
      activeAnalysisInputKey.value = null
      syncParentBusy()
    }
  }
}

// F1: Apply new analysis draft, replacing old AI-owned values while preserving buyer edits
function applyQuotationAnalysisDraft(result: MaterialQuotationAnalysisResult) {
  // 1. Supplier autofill: only if not already resolved
  if (!resolvedSupplierId.value) {
    if (!userEditedSupplierFields.value.displayName) {
      if (result.supplier.name) {
        supplierDisplayName.value = result.supplier.name.trim()
        aiOwnedSupplierFields.value.displayName = true
      } else if (aiOwnedSupplierFields.value.displayName) {
        supplierDisplayName.value = ''
        aiOwnedSupplierFields.value.displayName = false
      }
    }

    if (!userEditedSupplierFields.value.taxIdentifier) {
      if (result.supplier.taxCode) {
        supplierTaxIdentifier.value = result.supplier.taxCode.trim()
        aiOwnedSupplierFields.value.taxIdentifier = true
      } else if (aiOwnedSupplierFields.value.taxIdentifier) {
        supplierTaxIdentifier.value = ''
        aiOwnedSupplierFields.value.taxIdentifier = false
      }
    }

    if (!userEditedSupplierFields.value.contactDisplayName) {
      if (result.supplier.contactName) {
        supplierContactDisplayName.value = result.supplier.contactName.trim()
        aiOwnedSupplierFields.value.contactDisplayName = true
      } else if (aiOwnedSupplierFields.value.contactDisplayName) {
        supplierContactDisplayName.value = ''
        aiOwnedSupplierFields.value.contactDisplayName = false
      }
    }

    if (!userEditedSupplierFields.value.contactPhone) {
      if (result.supplier.phone) {
        supplierContactPhone.value = result.supplier.phone.trim()
        aiOwnedSupplierFields.value.contactPhone = true
      } else if (aiOwnedSupplierFields.value.contactPhone) {
        supplierContactPhone.value = ''
        aiOwnedSupplierFields.value.contactPhone = false
      }
    }
  }

  // 2. Lines autofill & refresh
  const resultLinesMap = new Map<string, MaterialQuotationAnalysisResult['lines'][number]>()
  for (const rl of result.lines) {
    resultLinesMap.set(rl.proposalLineId, rl)
  }

  for (const line of props.proposal.lines) {
    const lineId = line.lineId
    const resLine = resultLinesMap.get(lineId)
    const form = lineFormMap.value[lineId]
    if (!form) continue

    ensureLineTrackers(lineId)
    const userEdited = userEditedLineFields.value[lineId]
    const aiOwned = aiOwnedLineFields.value[lineId]

    // G5: Fresh AI draft refresh clears mapping confirmation; AI never sets mappingConfirmed
    form.mappingConfirmed = false

    // A. quotationMaterialName
    if (!userEdited?.quotationMaterialName) {
      if (resLine?.quotationMaterialName) {
        updateLineFieldInternal(lineId, 'quotationMaterialName', resLine.quotationMaterialName.trim())
        if (aiOwned) aiOwned.quotationMaterialName = true
      } else if (aiOwned?.quotationMaterialName) {
        updateLineFieldInternal(lineId, 'quotationMaterialName', '')
        if (aiOwned) aiOwned.quotationMaterialName = false
      }
    }

    // B. quotedQuantity
    if (!userEdited?.quotedQuantity) {
      if (resLine?.quotationQuantity) {
        updateLineFieldInternal(lineId, 'quotedQuantity', resLine.quotationQuantity)
        if (aiOwned) aiOwned.quotedQuantity = true
      } else if (aiOwned?.quotedQuantity) {
        updateLineFieldInternal(lineId, 'quotedQuantity', '')
        if (aiOwned) aiOwned.quotedQuantity = false
      }
    }

    // C. unitPrice: only if taxBasis === 'exclusive' and result currency === canonicalCurrency
    if (!userEdited?.unitPrice) {
      const isTaxExclusive = resLine?.taxBasis === 'exclusive'
      const isCurrencyMatch = result.currencyCode !== null && result.currencyCode === canonicalCurrency.value
      if (resLine && isTaxExclusive && isCurrencyMatch && resLine.unitPrice) {
        updateLineFieldInternal(lineId, 'unitPrice', resLine.unitPrice)
        if (aiOwned) aiOwned.unitPrice = true
      } else if (aiOwned?.unitPrice) {
        updateLineFieldInternal(lineId, 'unitPrice', '')
        if (aiOwned) aiOwned.unitPrice = false
      }
    }

    // D. allocationQuantity: suggestedAllocationQuantity if <= remainingQuantity
    if (!userEdited?.allocationQuantity) {
      let usableAlloc: string | null = null
      if (resLine?.suggestedAllocationQuantity) {
        try {
          const suggestedDec = new Decimal(resLine.suggestedAllocationQuantity)
          const remainingDec = new Decimal(line.remainingQuantity)
          if (suggestedDec.gt(0) && suggestedDec.lte(remainingDec)) {
            usableAlloc = resLine.suggestedAllocationQuantity
          }
        } catch {
          // Invalid decimal
        }
      }

      if (usableAlloc !== null) {
        updateLineFieldInternal(lineId, 'allocationQuantity', usableAlloc)
        if (aiOwned) aiOwned.allocationQuantity = true
      } else if (aiOwned?.allocationQuantity) {
        updateLineFieldInternal(lineId, 'allocationQuantity', '')
        if (aiOwned) aiOwned.allocationQuantity = false
      }
    }

    // AI never ticks mappingConfirmed
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

function ensureLineTrackers(lineId: string) {
  if (!userEditedLineFields.value[lineId]) {
    userEditedLineFields.value[lineId] = {
      allocationQuantity: false,
      unitPrice: false,
      quotedQuantity: false,
      quotationMaterialName: false,
    }
  }
  if (!aiOwnedLineFields.value[lineId]) {
    aiOwnedLineFields.value[lineId] = {
      allocationQuantity: false,
      unitPrice: false,
      quotedQuantity: false,
      quotationMaterialName: false,
    }
  }
}

function initLineFormMap() {
  const map: Record<string, LineAllocationState> = {}
  const editMap: Record<string, LineFieldTrack> = {}
  const aiMap: Record<string, LineFieldTrack> = {}
  if (props.proposal?.lines) {
    for (const line of props.proposal.lines) {
      map[line.lineId] = {
        allocationQuantity: '',
        unitPrice: '',
        quotedQuantity: '',
        quotationMaterialName: '',
        mappingConfirmed: false,
      }
      editMap[line.lineId] = {
        allocationQuantity: false,
        unitPrice: false,
        quotedQuantity: false,
        quotationMaterialName: false,
      }
      aiMap[line.lineId] = {
        quotationMaterialName: false,
        quotedQuantity: false,
        unitPrice: false,
        allocationQuantity: false,
      }
    }
  }
  lineFormMap.value = map
  userEditedLineFields.value = editMap
  aiOwnedLineFields.value = aiMap
}

function resetLineConfirmations() {
  for (const state of Object.values(lineFormMap.value)) {
    if (state) {
      state.mappingConfirmed = false
    }
  }
}

function updateLineFieldInternal(lineId: string, field: keyof LineAllocationState, value: string | boolean) {
  if (!lineFormMap.value[lineId]) {
    lineFormMap.value[lineId] = {
      allocationQuantity: '',
      unitPrice: '',
      quotedQuantity: '',
      quotationMaterialName: '',
      mappingConfirmed: false,
    }
  }
  const form = lineFormMap.value[lineId]
  if (form) {
    if (field === 'mappingConfirmed') {
      form.mappingConfirmed = Boolean(value)
    } else {
      form[field] = String(value ?? '')
    }
  }
}

function updateLineField(lineId: string, field: keyof LineAllocationState, value: any) {
  ensureLineTrackers(lineId)
  const track = userEditedLineFields.value[lineId]
  const aiTrack = aiOwnedLineFields.value[lineId]
  if (track && field in track) {
    track[field as keyof LineFieldTrack] = true
  }
  if (aiTrack && field in aiTrack) {
    aiTrack[field as keyof LineFieldTrack] = false
  }
  updateLineFieldInternal(lineId, field, value)
}

function handleReturnRequested() {
  emit('returnRequested')
}

function isValidPositiveDecimalString(val: string): boolean {
  const trimmed = (val ?? '').trim()
  if (!trimmed) return false
  const parseRes = workflowMoneySchema.safeParse(trimmed)
  if (!parseRes.success) return false
  try {
    return new Decimal(trimmed).gt(0)
  } catch {
    return false
  }
}

// C3: Strict line validation - only completely blank allocation is considered unselected.
// Any non-blank row with invalid quantity/price/quotationName/mapping must error on that specific line.
interface LineValidationError {
  lineId: string
  materialName: string
  message: string
}

const lineValidationErrors = computed<LineValidationError[]>(() => {
  const errors: LineValidationError[] = []
  if (!props.proposal?.lines) return errors

  for (const line of props.proposal.lines) {
    const form = lineFormMap.value[line.lineId]
    if (!form) continue
    const allocRaw = (form.allocationQuantity ?? '').trim()
    if (allocRaw === '') continue // Unselected

    const allocParse = workflowMoneySchema.safeParse(allocRaw)
    if (!allocParse.success) {
      errors.push({
        lineId: line.lineId,
        materialName: line.materialName,
        message: `Dòng "${line.materialName}": Số lượng phân bổ "${allocRaw}" không hợp lệ (tối đa 16 chữ số nguyên, tối đa 4 chữ số thập phân, không chứa số 0 ở đầu).`,
      })
      continue
    }

    let allocDec: Decimal
    try {
      allocDec = new Decimal(allocRaw)
    } catch {
      errors.push({
        lineId: line.lineId,
        materialName: line.materialName,
        message: `Dòng "${line.materialName}": Không thể phân tích số lượng phân bổ.`,
      })
      continue
    }

    if (!allocDec.gt(0)) {
      errors.push({
        lineId: line.lineId,
        materialName: line.materialName,
        message: `Dòng "${line.materialName}": Số lượng phân bổ phải lớn hơn 0.`,
      })
      continue
    }

    if (allocDec.gt(line.remainingQuantity)) {
      errors.push({
        lineId: line.lineId,
        materialName: line.materialName,
        message: `Dòng "${line.materialName}": Số lượng phân bổ (${allocRaw}) vượt quá số lượng còn lại (${formatMaterialQuantity(line.remainingQuantity)}).`,
      })
      continue
    }

    const quoteName = (form.quotationMaterialName ?? '').trim()
    if (!quoteName) {
      errors.push({
        lineId: line.lineId,
        materialName: line.materialName,
        message: `Dòng "${line.materialName}": Chưa nhập tên trên báo giá PDF.`,
      })
      continue
    }

    const priceRaw = (form.unitPrice ?? '').trim()
    const priceParse = workflowMoneySchema.safeParse(priceRaw)
    if (!priceParse.success) {
      errors.push({
        lineId: line.lineId,
        materialName: line.materialName,
        message: `Dòng "${line.materialName}": Đơn giá "${priceRaw}" không hợp lệ (tối đa 16 chữ số nguyên, tối đa 4 chữ số thập phân, không chứa số 0 ở đầu).`,
      })
      continue
    }

    try {
      if (!new Decimal(priceRaw).gt(0)) {
        errors.push({
          lineId: line.lineId,
          materialName: line.materialName,
          message: `Dòng "${line.materialName}": Đơn giá phải lớn hơn 0.`,
        })
        continue
      }
    } catch {
      errors.push({
        lineId: line.lineId,
        materialName: line.materialName,
        message: `Dòng "${line.materialName}": Đơn giá không hợp lệ.`,
      })
      continue
    }

    if (!form.mappingConfirmed) {
      errors.push({
        lineId: line.lineId,
        materialName: line.materialName,
        message: `Dòng "${line.materialName}": Chưa xác nhận đối chiếu với báo giá PDF.`,
      })
    }
  }
  return errors
})

const selectedAllocations = computed(() => {
  const list: Array<{
    proposalLineId: string
    quantity: string
    unitPrice: string
    quotationMaterialName: string
    mappingConfirmed: true
  }> = []

  if (!props.proposal?.lines) return list

  for (const line of props.proposal.lines) {
    const form = lineFormMap.value[line.lineId]
    if (!form) continue
    const allocRaw = (form.allocationQuantity ?? '').trim()
    if (allocRaw === '') continue

    list.push({
      proposalLineId: line.lineId,
      quantity: allocRaw,
      unitPrice: form.unitPrice.trim(),
      quotationMaterialName: form.quotationMaterialName.trim(),
      mappingConfirmed: true,
    })
  }
  return list
})

const formattedTotalOrderValue = computed(() => {
  let sum = new Decimal(0)
  for (const item of selectedAllocations.value) {
    if (isValidPositiveDecimalString(item.quantity) && isValidPositiveDecimalString(item.unitPrice)) {
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
  if (lineValidationErrors.value.length > 0) {
    return lineValidationErrors.value[0]?.message ?? 'Có dòng vật tư chưa hợp lệ.'
  }
  if (selectedAllocations.value.length === 0) return 'Chọn ít nhất 1 dòng vật tư để phân bổ đơn hàng.'
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
  readonly actorId: string
  readonly input: CreateMaterialOrderInput
  readonly idempotencyKey: string
}

const pendingCreateOrderCommand = ref<CreateOrderCommand | null>(null)
const createPostAcknowledged = ref(false)
const isCreatePostRejected = ref(false)
const createdOrderId = ref<string | null>(null)
const createActionError = ref('')
const isCreateBusy = ref(false)
const isRejectionRefreshBusy = ref(false)

function startCreateOrder() {
  if (!canCreateOrder.value || pendingCreateOrderCommand.value) return
  if (!isLiveScopeValid() || !props.proposal.approvedRevisionId || !resolvedSupplierId.value || !canonicalCurrency.value || !finalizedEvidenceFileId.value) return

  generalError.value = ''
  createActionError.value = ''

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
    const errorMsg = parsed.error.issues[0]?.message || 'Dữ liệu tạo đơn không hợp lệ.'
    generalError.value = `Lỗi dữ liệu tạo đơn: ${errorMsg}`
    createActionError.value = errorMsg
    return
  }

  const cmd: CreateOrderCommand = Object.freeze({
    companyId: props.companyId,
    projectId: props.projectId,
    proposalId: props.proposal.id,
    approvedRevisionId: props.proposal.approvedRevisionId,
    actorId: authStore?.user?.id ?? '',
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
  const token = mutationTracker.start({
    companyId: cmd.companyId,
    projectId: cmd.projectId,
    proposalId: cmd.proposalId,
    approvedRevisionId: cmd.approvedRevisionId,
    actorId: cmd.actorId,
    tokenKey: cmd.idempotencyKey,
  })

  isCreateBusy.value = true
  createActionError.value = ''
  emitBusy(true)

  // Step 1: POST createOrder if not already acknowledged and not already rejected
  if (!createPostAcknowledged.value && !isCreatePostRejected.value) {
    try {
      const res = await repo.createOrder(cmd.projectId, cmd.proposalId, cmd.input, { idempotencyKey: cmd.idempotencyKey })
      if (!token.isCurrent() || isDisposed || !isLiveScopeValid(cmd)) return
      createPostAcknowledged.value = true
      createdOrderId.value = res.resourceId
    } catch (err: unknown) {
      if (!token.isCurrent() || isDisposed || !isLiveScopeValid(cmd)) return

      const errInfo = parseApiError(err)
      if (isApiDenialOrConflict(errInfo)) {
        isCreatePostRejected.value = true
        if (errInfo.code === 'PROJECT_COMPLETED') {
          createActionError.value = 'Dự án đã hoàn tất (PROJECT_COMPLETED): Không thể tạo đơn mua hàng.'
        } else if (errInfo.code === 'VERSION_CONFLICT' || errInfo.status === 409) {
          createActionError.value = 'Xung đột phiên bản (409): Dữ liệu phiếu đã thay đổi hoặc số lượng còn lại không đủ.'
        } else if (errInfo.code === 'MATERIAL_ALLOCATION_EXCEEDED') {
          createActionError.value = 'Số lượng đặt mua vượt quá hạn mức còn lại được duyệt (MATERIAL_ALLOCATION_EXCEEDED).'
        } else if (errInfo.code === 'IDEMPOTENCY_CONFLICT') {
          createActionError.value = 'Xung đột thao tác (IDEMPOTENCY_CONFLICT): Yêu cầu trùng lặp với nội dung khác.'
        } else {
          createActionError.value = errInfo.message || 'Yêu cầu tạo đơn bị máy chủ từ chối.'
        }

        // F2-F4: Denial routes to canonical reload
        await runRejectionCanonicalRefresh(cmd)
        return
      }

      // F2-F4: Network error / 5xx where outcome is not determined before ACK.
      // Sibling lock remains true! Do not emit busy=false!
      createActionError.value = errInfo.message || 'Lỗi kết nối máy chủ. Lệnh tạo đơn chưa xác định được kết quả commit. Vui lòng bấm thử lại để tiếp tục với đúng lệnh này.'
      isCreateBusy.value = false
      return
    }
  }

  // Step 2: Canonical reload after ACK
  if (createPostAcknowledged.value && createdOrderId.value) {
    try {
      const [readOrd, canonicalProp, freshOrders] = await Promise.all([
        repo.readOrder(cmd.projectId, createdOrderId.value),
        repo.readProposal(cmd.projectId, cmd.proposalId),
        repo.listOrders(cmd.projectId),
      ])
      if (!token.isCurrent() || isDisposed || !isLiveScopeValid(cmd)) return

      // C2: Check readOrd identity, proposalId, and frozen revision against captured command
      if (
        readOrd.id !== createdOrderId.value ||
        readOrd.proposalId !== cmd.proposalId ||
        readOrd.approvedRevisionId !== cmd.approvedRevisionId
      ) {
        throw new Error('ORDER_IDENTITY_OR_REVISION_MISMATCH')
      }

      // C2: Check canonical proposal identity and project against captured command
      // Note: canonicalProp.approvedRevisionId may be returned or reapproved as R2;
      // we do not force it back to R1 or reject here.
      if (
        canonicalProp.id !== cmd.proposalId ||
        canonicalProp.projectId !== cmd.projectId
      ) {
        throw new Error('PROPOSAL_IDENTITY_MISMATCH')
      }

      orders.value = freshOrders.filter(o => o.proposalId === cmd.proposalId)
      pendingCreateOrderCommand.value = null
      createPostAcknowledged.value = false
      isCreatePostRejected.value = false
      createdOrderId.value = null
      createActionError.value = ''
      isCreateBusy.value = false

      initLineFormMap()
      // G4: Retract AI drafts and clear supplier fields so no residual data survives
      retractAiOwnedDrafts()
      resetAiOwnedState()
      supplierCode.value = ''
      supplierDisplayName.value = ''
      supplierTaxIdentifier.value = ''
      supplierContactDisplayName.value = ''
      supplierContactPhone.value = ''
      supplierAlreadyChosenAcknowledged.value = false
      userEditedSupplierFields.value = {
        displayName: false,
        taxIdentifier: false,
        contactDisplayName: false,
        contactPhone: false,
      }
      resolvedSupplierId.value = null
      lastResolvedInputJson.value = null
      selectedFile.value = null
      finalizedEvidenceFileId.value = null
      uploadSession.value = null
      supplierResolutionKey.value = crypto.randomUUID()
      analysisResult.value = null
      analysisError.value = ''
      analysisTracker.invalidate()

      emit('canonical', canonicalProp)
      syncParentBusy()
    } catch (err: unknown) {
      if (!token.isCurrent() || isDisposed || !isLiveScopeValid(cmd)) return
      isCreateBusy.value = false
      // F2-F4: Sibling lock stays held! Do not emit busy(false)
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
  readonly actorId: string
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
    actorId: authStore?.user?.id ?? '',
    idempotencyKey: crypto.randomUUID(),
  })

  pendingCancelCommand.value = cmd
  cancelPostAcknowledged.value = false
  isCancelPostRejected.value = false
  void executeCancelOrder(cmd)
}

async function executeCancelOrder(cmd: CancelOrderCommand) {
  const token = mutationTracker.start({
    companyId: cmd.companyId,
    projectId: cmd.projectId,
    proposalId: cmd.proposalId,
    actorId: cmd.actorId,
    tokenKey: cmd.idempotencyKey,
  })

  isCancelBusy.value = true
  cancelActionError.value = ''
  emitBusy(true)

  if (!cancelPostAcknowledged.value && !isCancelPostRejected.value) {
    try {
      await repo.cancelOrder(cmd.projectId, cmd.orderId, {
        expectedOrderVersion: cmd.orderVersion,
        reason: cmd.reason,
      }, { idempotencyKey: cmd.idempotencyKey })

      if (!token.isCurrent() || isDisposed || !isLiveScopeValid(cmd)) return
      cancelPostAcknowledged.value = true
    } catch (err: unknown) {
      if (!token.isCurrent() || isDisposed || !isLiveScopeValid(cmd)) return

      const errInfo = parseApiError(err)
      if (isApiDenialOrConflict(errInfo)) {
        isCancelPostRejected.value = true
        if (errInfo.code === 'PROJECT_COMPLETED') {
          cancelActionError.value = 'Dự án đã hoàn tất (PROJECT_COMPLETED): Không thể hủy đơn mua hàng.'
        } else if (errInfo.code === 'VERSION_CONFLICT' || errInfo.status === 409) {
          cancelActionError.value = 'Xung đột khi hủy đơn (409): Trạng thái đơn mua đã bị thay đổi hoặc đã ký hợp đồng.'
        } else {
          cancelActionError.value = errInfo.message || 'Yêu cầu hủy đơn bị từ chối.'
        }
        await runRejectionCanonicalRefresh(cmd)
        return
      }

      // F2-F4: Network error / 5xx where outcome is not determined before ACK.
      cancelActionError.value = errInfo.message || 'Lỗi kết nối máy chủ khi hủy đơn. Vui lòng bấm thử lại để tiếp tục với đúng lệnh này.'
      isCancelBusy.value = false
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

      // C2: Verify readOrd confirms cancellation and matches captured proposal
      if (
        readOrd.id !== cmd.orderId ||
        readOrd.proposalId !== cmd.proposalId ||
        readOrd.orderState !== 'cancelled'
      ) {
        throw new Error('CANCEL_CONFIRMATION_FAILED')
      }

      // C2: Verify canonical proposal identity and project
      if (
        canonicalProp.id !== cmd.proposalId ||
        canonicalProp.projectId !== cmd.projectId
      ) {
        throw new Error('PROPOSAL_IDENTITY_MISMATCH')
      }

      orders.value = freshOrders.filter(o => o.proposalId === cmd.proposalId)
      pendingCancelCommand.value = null
      cancelPostAcknowledged.value = false
      isCancelPostRejected.value = false
      cancellingOrderId.value = null
      cancelReason.value = ''
      cancelActionError.value = ''
      isCancelBusy.value = false

      emit('canonical', canonicalProp)
      syncParentBusy()
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

// F2-F4: Safe canonical rejection refresh
async function runRejectionCanonicalRefresh(cmd: {
  companyId: string
  projectId: string
  proposalId: string
  actorId?: string
  approvedRevisionId?: string | null
}) {
  const token = mutationTracker.start({
    companyId: cmd.companyId,
    projectId: cmd.projectId,
    proposalId: cmd.proposalId,
    approvedRevisionId: cmd.approvedRevisionId,
    actorId: cmd.actorId,
    op: 'rejection-canonical-refresh',
  })

  isRejectionRefreshBusy.value = true
  emitBusy(true)

  try {
    const [canonicalProp, freshOrders] = await Promise.all([
      repo.readProposal(cmd.projectId, cmd.proposalId),
      repo.listOrders(cmd.projectId),
    ])
    if (!token.isCurrent() || isDisposed || !isLiveScopeValid(cmd)) return

    if (
      canonicalProp.id !== cmd.proposalId ||
      canonicalProp.projectId !== cmd.projectId
    ) {
      throw new Error('CANONICAL_IDENTITY_MISMATCH')
    }

    orders.value = freshOrders.filter(o => o.proposalId === cmd.proposalId)

    // F2: Rejection confirmed and fresh state loaded: retire command & rejection state
    pendingCreateOrderCommand.value = null
    createPostAcknowledged.value = false
    isCreatePostRejected.value = false
    createdOrderId.value = null

    pendingCancelCommand.value = null
    cancelPostAcknowledged.value = false
    isCancelPostRejected.value = false
    cancellingOrderId.value = null
    analysisResult.value = null
    analysisError.value = ''
    analysisTracker.invalidate()

    // G4: Retract applicable old AI-owned values before resetting provenance
    retractAiOwnedDrafts()
    resetAiOwnedState()
    resetLineConfirmations()

    // G2: End refresh loader & create/cancel busy BEFORE publishing final busy=false
    isRejectionRefreshBusy.value = false
    isCreateBusy.value = false
    isCancelBusy.value = false

    emit('canonical', canonicalProp)
    syncParentBusy()
  } catch (err: unknown) {
    if (!token.isCurrent() || isDisposed || !isLiveScopeValid(cmd)) return
    // Keep error banner and keep pending command
    if (isCreatePostRejected.value) {
      createActionError.value += ' Đồng thời chưa thể tải lại dữ liệu mới nhất từ máy chủ.'
    }
    if (isCancelPostRejected.value) {
      cancelActionError.value += ' Đồng thời chưa thể tải lại dữ liệu mới nhất từ máy chủ.'
    }
  } finally {
    if (token.isCurrent() && !isDisposed) {
      isRejectionRefreshBusy.value = false
      isCreateBusy.value = false
      isCancelBusy.value = false
      syncParentBusy()
    }
  }
}

function retryCanonicalRejectionRefresh() {
  if (isRecoveryControlDisabled.value) return
  const cmd = pendingCreateOrderCommand.value || pendingCancelCommand.value
  if (!cmd) return
  void runRejectionCanonicalRefresh(cmd)
}

function computeOrderTotal(order: MaterialOrderView): string {
  let sum = new Decimal(0)
  for (const alloc of order.allocations) {
    if (isValidPositiveDecimalString(alloc.quantity) && isValidPositiveDecimalString(alloc.unitPrice)) {
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
    isAnalyzing.value ||
    isCreateBusy.value ||
    isCancelBusy.value ||
    isPdfReading.value ||
    isRejectionRefreshBusy.value
  )
})

const busyStatusMessage = computed(() => {
  if (isUploading.value) return 'Đang tải lên tệp báo giá PDF...'
  if (isAnalyzing.value) return 'Đang phân tích báo giá bằng AI...'
  if (isResolvingSupplier.value) return 'Đang ghi nhận nhà cung cấp...'
  if (isCreateBusy.value) return 'Đang xử lý tạo đơn mua hàng...'
  if (isCancelBusy.value) return 'Đang xử lý hủy đơn mua hàng...'
  if (isPdfReading.value) return 'Đang mở tệp báo giá...'
  if (isRejectionRefreshBusy.value) return 'Đang đồng bộ dữ liệu mới nhất...'
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
    cancelPostAcknowledged.value ||
    isCreatePostRejected.value ||
    isCancelPostRejected.value
  )
})

// F4: Honors props.disabled from sibling
const isRecoveryControlDisabled = computed(() => {
  return Boolean(props.disabled || !isLiveScopeValid() || isTransportBusy.value)
})

// F5: Comprehensive scope teardown watcher
watch(
  [
    () => companyAccess?.activeCompanyId,
    () => authStore?.user?.id,
    () => companyAccess?.hasPermission('material.read'),
    () => companyAccess?.hasPermission('material.order.manage'),
    () => companyAccess?.hasPermission('material.supplier.record'),
    () => props.companyId,
    () => props.projectId,
    () => props.proposal?.id,
    () => props.proposal?.approvedRevisionId,
  ],
  ([newCo, newActor, newRead, newManage, newRecord, newPropCo, newPropProj, newPropProposal, newPropRev],
   [oldCo, oldActor, oldRead, oldManage, oldRecord, oldPropCo, oldPropProj, oldPropProposal, oldPropRev]) => {
    const changed =
      newCo !== oldCo ||
      newActor !== oldActor ||
      newRead !== oldRead ||
      newManage !== oldManage ||
      newRecord !== oldRecord ||
      newPropCo !== oldPropCo ||
      newPropProj !== oldPropProj ||
      newPropProposal !== oldPropProposal ||
      newPropRev !== oldPropRev

    if (changed) {
      // Invalidate all streams
      invalidateAllTrackers()

      // Reset all loading flags
      isCurrencyLoading.value = false
      isOrdersLoading.value = false
      isResolvingSupplier.value = false
      isUploading.value = false
      isAnalyzing.value = false
      isCreateBusy.value = false
      isCancelBusy.value = false
      isPdfReading.value = false
      isRejectionRefreshBusy.value = false

      // Clear pending commands
      pendingCreateOrderCommand.value = null
      createPostAcknowledged.value = false
      isCreatePostRejected.value = false
      createdOrderId.value = null

      pendingCancelCommand.value = null
      cancelPostAcknowledged.value = false
      isCancelPostRejected.value = false
      cancellingOrderId.value = null

      // Clear errors
      createActionError.value = ''
      cancelActionError.value = ''
      generalError.value = ''
      supplierResolveError.value = ''
      uploadError.value = ''
      analysisError.value = ''
      analysisResult.value = null
      ordersError.value = ''
      currencyError.value = ''

      // Clear data & forms
      orders.value = []
      canonicalCurrency.value = null
      supplierCode.value = ''
      supplierDisplayName.value = ''
      supplierTaxIdentifier.value = ''
      supplierContactDisplayName.value = ''
      supplierContactPhone.value = ''
      supplierAlreadyChosenAcknowledged.value = false
      userEditedSupplierFields.value = {
        displayName: false,
        taxIdentifier: false,
        contactDisplayName: false,
        contactPhone: false,
      }
      resetAiOwnedState()
      resolvedSupplierId.value = null
      lastResolvedInputJson.value = null
      selectedFile.value = null
      finalizedEvidenceFileId.value = null
      uploadSession.value = null
      initLineFormMap()

      // Emit busy false on teardown
      emitBusy(false)

      // Start fresh loads if new scope is valid
      if (isLiveScopeValid()) {
        void loadCurrency()
        void loadOrders()
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
  invalidateAllTrackers()
  if (lastEmittedBusy) {
    lastEmittedBusy = false
    emit('busy', false)
  }
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
