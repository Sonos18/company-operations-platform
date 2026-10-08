<template>
  <div class="cockpit-card cost-request-panel">
    <div class="panel-top-row">
      <div class="panel-title-area">
        <h4>Rà soát & Đề nghị khoản chi</h4>
        <span v-if="project" class="project-indicator">
          {{ project.projectCode }} · {{ project.projectName }}
        </span>
      </div>
      <div class="panel-status-badges">
        <span v-if="isReadonly" class="cockpit-badge">Chỉ đọc ({{ initial?.status }})</span>
        <span v-else-if="retryReady" class="cockpit-badge warn">Chờ xác nhận kết quả gửi trước</span>
      </div>
    </div>

    <div v-if="context.operationalState === 'completed'" class="alert warn" role="status">
      Dự án đã hoàn thành, không thể gửi yêu cầu lập đề nghị mới.
    </div>
    <div v-if="errorMessage" class="alert error" role="alert">{{ errorMessage }}</div>
    <div v-if="scanNotice" class="alert warn" role="status">{{ scanNotice }}</div>

    <form class="request-form" @submit.prevent="handleSubmit">
      <!-- PHẦN 1: THÔNG TIN KHOẢN CHI -->
      <fieldset class="form-section">
        <legend class="section-legend">
          <span class="step-num">1</span>
          Thông tin khoản chi
        </legend>

        <!-- Hướng dẫn phân biệt Hạng mục / Cơ sở chi / Hợp đồng căn cứ -->
        <div class="field-guide-card">
          <div class="guide-item">
            <span class="guide-tag">Hạng mục</span>
            <span>Khoản mục ngân sách dự toán của dự án (ví dụ: Thi công, Vật tư, Quản lý...).</span>
          </div>
          <div class="guide-item">
            <span class="guide-tag">Cơ sở chi</span>
            <span>Bản chất thực tế của khoản chi cần thanh toán (Vật tư, Hợp đồng phụ, Nhân công VQH, Máy thi công, Khác).</span>
          </div>
          <div class="guide-item">
            <span class="guide-tag">Hợp đồng căn cứ</span>
            <span>Hợp đồng hoặc thỏa thuận dùng chung hạn mức đã ký kết với đối tác (tùy chọn, để đối chiếu hạn mức).</span>
          </div>
        </div>

        <div class="grid">
          <label>Đối tác *
            <select v-model="partyId" class="cockpit-select" :disabled="isReadonly || isSubmitting || retryReady">
              <option value="">-- Chọn đối tác --</option>
              <option v-for="p in parties" :key="p.id" :value="p.id">
                {{ formatPartyOption(p) }}
              </option>
            </select>
            <span v-if="selectedPartyDuplicateNotice" class="field-tip text-warning">
              {{ selectedPartyDuplicateNotice }}
            </span>
          </label>

          <label>Hạng mục chi phí *
            <select v-model="categoryId" class="cockpit-select" :disabled="isReadonly || isSubmitting || retryReady">
              <option value="">-- Chọn hạng mục --</option>
              <option v-for="c in categories" :key="c.id" :value="c.id">{{ c.name }}</option>
            </select>
          </label>

          <label>Hợp đồng căn cứ (tùy chọn)
            <select v-model="contractVersionId" class="cockpit-select" :disabled="isReadonly || isSubmitting || retryReady">
              <option value="">-- Không gắn HĐ căn cứ --</option>
              <option v-for="ct in filteredContracts" :key="ct.id" :value="ct.versionId">
                {{ ct.reference }} (Hạn mức: {{ formatFinanceMoney(ct.cap, ct.currencyCode, ct.currencyCode === 'VND' ? 0 : 2) }})
              </option>
            </select>
          </label>
        </div>

        <div class="grid">
          <label>Số tiền đề nghị *
            <input
              v-model="amount"
              class="cockpit-input"
              type="text"
              placeholder="Ví dụ: 10000000"
              :disabled="isReadonly || isSubmitting || retryReady"
            >
            <span v-if="amountFormatted" class="field-tip">
              Định dạng: <strong>{{ amountFormatted }}</strong>
            </span>
          </label>

          <label>Tiền tệ *
            <input
              v-model="currencyCode"
              class="cockpit-input"
              type="text"
              maxlength="3"
              placeholder="VND"
              :disabled="isReadonly || isSubmitting || retryReady"
            >
          </label>

          <label>Phân loại cơ sở chi *
            <select v-model="basisKind" class="cockpit-select" :disabled="isReadonly || isSubmitting || retryReady">
              <option value="materials">Vật tư</option>
              <option value="subcontract">Hợp đồng phụ</option>
              <option value="direct_labor">Nhân công VQH</option>
              <option value="machinery">Máy thi công</option>
              <option value="other">Chi phí khác</option>
            </select>
          </label>
        </div>

        <!-- Chi tiết cơ sở chi -->
        <div class="basis-details-container">
          <!-- Vật tư -->
          <div v-if="basisKind === 'materials'">
            <label class="mb-2">Địa điểm giao hàng *
              <input v-model="deliverySite" class="cockpit-input" placeholder="Ví dụ: Công trường dự án" :disabled="isReadonly || isSubmitting || retryReady">
            </label>
            <div class="lines-table-header">
              <span class="font-medium text-sm">Các dòng vật tư:</span>
            </div>
            <div v-for="(l, i) in matLines" :key="i" class="line-grid">
              <label>Tên vật tư * <input v-model="l.description" class="cockpit-input" placeholder="Tên vật tư" :disabled="isReadonly || isSubmitting || retryReady"></label>
              <label>Số lượng * <input v-model="l.quantity" class="cockpit-input" placeholder="SL" :disabled="isReadonly || isSubmitting || retryReady"></label>
              <label>Đơn vị tính * <input v-model="l.unit" class="cockpit-input" placeholder="ĐVT" :disabled="isReadonly || isSubmitting || retryReady"></label>
              <label>Đơn giá * <input v-model="l.unitPrice" class="cockpit-input" placeholder="Đơn giá" :disabled="isReadonly || isSubmitting || retryReady"></label>
              <button v-if="!isReadonly && matLines.length > 1" type="button" class="cockpit-btn cockpit-btn--sm" @click="matLines.splice(i, 1)">Xóa</button>
            </div>
            <button v-if="!isReadonly && !retryReady" type="button" class="cockpit-btn cockpit-btn--sm mt-2" @click="matLines.push({ description: '', quantity: '1', unit: 'cái', unitPrice: '0' })">
              + Thêm dòng vật tư
            </button>
          </div>

          <!-- Hợp đồng phụ -->
          <div v-else-if="basisKind === 'subcontract'" class="grid">
            <label>Hợp đồng phụ *
              <select v-model="subcontractId" class="cockpit-select" :disabled="isReadonly || isSubmitting || retryReady">
                <option value="">-- Chọn hợp đồng phụ --</option>
                <option v-for="contract in filteredContracts.filter(item => item.sourceSubcontractId)" :key="contract.id" :value="contract.sourceSubcontractId">
                  {{ contract.reference }}
                </option>
              </select>
            </label>
            <label>Số BB nghiệm thu *
              <input v-model="acceptanceReference" class="cockpit-input" placeholder="Số biên bản nghiệm thu" :disabled="isReadonly || isSubmitting || retryReady">
            </label>
            <label>Tiền giữ lại bảo hành
              <input v-model="retentionAmount" class="cockpit-input" placeholder="0" :disabled="isReadonly || isSubmitting || retryReady">
            </label>
          </div>

          <!-- Nhân công VQH -->
          <div v-else-if="basisKind === 'direct_labor'">
            <label class="mb-2">Ngày đầu tuần chấm công (YYYY-MM-DD) *
              <input v-model="weekStart" class="cockpit-input" type="date" :disabled="isReadonly || isSubmitting || retryReady">
            </label>
            <div class="lines-table-header">
              <span class="font-medium text-sm">Danh sách thợ / nhân công:</span>
            </div>
            <div v-for="(w, i) in laborWorkers" :key="i" class="line-grid">
              <label>Thợ / Nhân công * <input v-model="w.workerReference" class="cockpit-input" placeholder="Tên thợ" :disabled="isReadonly || isSubmitting || retryReady"></label>
              <label>Số công * <input v-model="w.days" class="cockpit-input" placeholder="Công" :disabled="isReadonly || isSubmitting || retryReady"></label>
              <label>Đơn giá ngày * <input v-model="w.dailyRate" class="cockpit-input" placeholder="Đơn giá" :disabled="isReadonly || isSubmitting || retryReady"></label>
              <label>Phụ cấp <input v-model="w.allowance" class="cockpit-input" placeholder="Phụ cấp" :disabled="isReadonly || isSubmitting || retryReady"></label>
              <button v-if="!isReadonly && laborWorkers.length > 1" type="button" class="cockpit-btn cockpit-btn--sm" @click="laborWorkers.splice(i, 1)">Xóa</button>
            </div>
            <button v-if="!isReadonly && !retryReady" type="button" class="cockpit-btn cockpit-btn--sm mt-2" @click="laborWorkers.push({ workerReference: '', days: '1', dailyRate: '0', allowance: '0' })">
              + Thêm thợ
            </button>
          </div>

          <!-- Máy hoặc khác -->
          <div v-else>
            <div class="lines-table-header">
              <span class="font-medium text-sm">Các dòng chi phí chi tiết:</span>
            </div>
            <div v-for="(l, i) in genericLines" :key="i" class="line-grid">
              <label>Diễn giải * <input v-model="l.description" class="cockpit-input" placeholder="Diễn giải" :disabled="isReadonly || isSubmitting || retryReady"></label>
              <label>Số lượng * <input v-model="l.quantity" class="cockpit-input" placeholder="SL" :disabled="isReadonly || isSubmitting || retryReady"></label>
              <label>Đơn vị tính * <input v-model="l.unit" class="cockpit-input" placeholder="ĐVT" :disabled="isReadonly || isSubmitting || retryReady"></label>
              <label>Đơn giá * <input v-model="l.unitPrice" class="cockpit-input" placeholder="Đơn giá" :disabled="isReadonly || isSubmitting || retryReady"></label>
              <button v-if="!isReadonly && genericLines.length > 1" type="button" class="cockpit-btn cockpit-btn--sm" @click="genericLines.splice(i, 1)">Xóa</button>
            </div>
            <button v-if="!isReadonly && !retryReady" type="button" class="cockpit-btn cockpit-btn--sm mt-2" @click="genericLines.push({ description: '', quantity: '1', unit: 'lần', unitPrice: '0' })">
              + Thêm dòng
            </button>
          </div>
        </div>

        <!-- So sánh đối chiếu tổng các dòng vs Số tiền đề nghị -->
        <div v-if="linesSumFormatted !== null" class="lines-reconciliation-panel">
          <div class="reconciliation-row">
            <div class="reconciliation-item">
              <span class="reconciliation-label">Tổng các dòng chi tiết:</span>
              <strong class="reconciliation-val">{{ linesSumFormatted }}</strong>
            </div>
            <div class="reconciliation-item">
              <span class="reconciliation-label">Số tiền đề nghị:</span>
              <strong class="reconciliation-val">{{ amountFormatted || 'Chưa nhập' }}</strong>
            </div>
          </div>
          <p v-if="isLinesSumDifferent" class="reconciliation-note">
            <UIcon name="i-lucide-info" class="inline-icon" aria-hidden="true" />
            Lưu ý đối chiếu: Tổng các dòng chi tiết và số tiền đề nghị có chênh lệch. Điều này được cho phép nếu chênh lệch do thuế VAT, phụ cấp hoặc các chi phí được giải trình bên dưới.
          </p>
        </div>

        <div class="grid mt-2">
          <label>Ghi chú cơ sở VAT (tùy chọn)
            <input v-model="vatBasis" class="cockpit-input" placeholder="Ví dụ: Đã bao gồm 8% VAT" :disabled="isReadonly || isSubmitting || retryReady">
          </label>
          <label>Ghi chú làm tròn (tùy chọn)
            <input v-model="roundingBasis" class="cockpit-input" placeholder="Ví dụ: Làm tròn đến hàng nghìn" :disabled="isReadonly || isSubmitting || retryReady">
          </label>
          <label>Ghi chú phụ cấp (tùy chọn)
            <input v-model="allowanceBasis" class="cockpit-input" placeholder="Ví dụ: Phụ cấp đi lại/ăn trưa" :disabled="isReadonly || isSubmitting || retryReady">
          </label>
        </div>
      </fieldset>

      <!-- PHẦN 2: HỒ SƠ CHỨNG TỪ GỐC & TRÍCH XUẤT GỢI Ý -->
      <fieldset class="form-section">
        <legend class="section-legend">
          <span class="step-num">2</span>
          Hồ sơ chứng từ gốc & Trích xuất gợi ý (Tùy chọn)
        </legend>

        <div class="step-guide-card">
          <h5 class="guide-title">
            <UIcon name="i-lucide-file-text" class="guide-icon" aria-hidden="true" />
            Trình tự chuẩn bị chứng từ & trích xuất gợi ý
          </h5>
          <ol class="step-list">
            <li><strong>Bước 1:</strong> Tải lên tệp chứng từ gốc (hóa đơn, biên bản, báo giá...) hoặc chọn báo giá đã lưu trong dự án.</li>
            <li><strong>Bước 2 (Tùy chọn):</strong> Chọn phạm vi trang PDF và bấm <em>"Trích xuất gợi ý"</em> để AI đọc và gợi ý điền nhanh các dòng chi.</li>
            <li><strong>Bước 3:</strong> <strong>Luôn đối chiếu lại với chứng từ gốc:</strong> Dữ liệu OCR chỉ mang tính hỗ trợ gợi ý, người lập đề nghị chịu trách nhiệm kiểm tra tính chính xác của toàn bộ số liệu theo bản gốc trước khi gửi duyệt.</li>
          </ol>
        </div>

        <CostWorkflowOriginalUpload
          v-if="!isReadonly && !retryReady && !isScanning && !scanRetryReady && !ocrPending"
          :company-id="companyId"
          :project-id="projectId"
          :target="{ kind: 'request', ...(currentRequestId ? { id: currentRequestId } : {}) }"
          @finalized="onEvidenceFinalized"
          @busy="uploadBusy = $event"
        />

        <section class="quotation-picker" aria-label="Chọn báo giá đã tải lên">
          <button type="button" class="cockpit-btn cockpit-btn--secondary" :disabled="!canPickQuotation || quotationLoading" @click="listQuotations">
            <UIcon name="i-lucide-folder-search" aria-hidden="true" />
            Chọn báo giá đã tải lên trước đây
          </button>
          <p v-if="quotationLoading" role="status" class="text-sm text-muted">Đang tải danh sách báo giá…</p>
          <p v-else-if="quotationError" class="alert error" role="alert">Không thể tải báo giá. Vui lòng thử lại.</p>
          <p v-else-if="quotationListed && !quotationChoices.length" role="status" class="text-sm text-muted">Không có báo giá đã tải lên phù hợp trong dự án này.</p>
          <ul v-else-if="quotationChoices.length" class="quotation-list">
            <li v-for="quotation in quotationChoices" :key="quotation.id">
              <span>{{ quotation.originalFilename }} · Tải lên: <time :datetime="quotation.finalizedAt">{{ quotation.finalizedAt }}</time> · {{ quotation.sizeBytes }} bytes</span>
              <button
                type="button"
                class="cockpit-btn cockpit-btn--sm"
                :data-quotation-id="quotation.id"
                :disabled="!canPickQuotation || quotationLoading || evidenceList.some(ev => ev.id === quotation.id)"
                @click="selectQuotation(quotation)"
              >
                {{ evidenceList.some(ev => ev.id === quotation.id) ? 'Đã thêm' : 'Chọn báo giá này' }}
              </button>
            </li>
          </ul>
        </section>

        <!-- Danh sách chứng từ đã đính kèm -->
        <div class="evidence-list-container">
          <div class="evidence-header">
            <strong>Hồ sơ chứng từ gốc đính kèm ({{ evidenceList.length }}):</strong>
            <span v-if="evidenceList.length === 0" class="field-error-inline">Cần tối thiểu 1 chứng từ gốc để gửi duyệt</span>
          </div>

          <div v-for="ev in evidenceList" :key="ev.id" class="evidence-row">
            <div class="evidence-identity">
              <UIcon name="i-lucide-file" class="file-icon" aria-hidden="true" />
              <span class="evidence-name">{{ ev.name }}</span>
            </div>
            <div class="evidence-actions">
              <button type="button" class="cockpit-btn cockpit-btn--sm" :disabled="!companyAccess.hasPermission('cost.request.file.read')" @click="previewEvidence(ev.id)">Xem</button>
              <button type="button" class="cockpit-btn cockpit-btn--sm" :disabled="!companyAccess.hasPermission('cost.request.file.read')" @click="previewEvidence(ev.id,'attachment')">Tải</button>
              <template v-if="!isReadonly && !retryReady">
                <label class="pdf-scope-label">Trang PDF:
                  <select v-model="pdfScopes[ev.id]" class="cockpit-select cockpit-select--sm" :disabled="isScanning || scanRetryReady || ocrPending">
                    <option value="">-- Chọn trang PDF --</option>
                    <option value="1">Trang 1</option>
                    <option value="1-2">Trang 1–2</option>
                  </select>
                </label>
                <label v-if="pdfScopes[ev.id]" class="pdf-count-label">Số trang:
                  <input v-model="pdfCounts[ev.id]" class="cockpit-input cockpit-input--sm" type="number" min="1" step="1" :disabled="isScanning || scanRetryReady || ocrPending">
                </label>
                <button type="button" class="cockpit-btn cockpit-btn--sm cockpit-btn--primary" :disabled="!canScanEvidence(ev)" @click="scanEvidence(ev.id)">
                  {{ scanRetryReady && scanSession.pendingFileId === ev.id ? 'Thử lại trích xuất' : ocrPollingState.fileId === ev.id ? 'Lấy kết quả' : 'Trích xuất gợi ý' }}
                </button>
              </template>
              <button v-if="!isReadonly && !retryReady" type="button" class="cockpit-btn cockpit-btn--sm" :disabled="isScanning || scanRetryReady || ocrPending" @click="removeEvidence(ev.id)">Gỡ</button>
            </div>
          </div>
        </div>

        <!-- Khối kết quả OCR gợi ý -->
        <div v-if="suggestedResult?.warnings.includes('OCR_DOCUMENT_KIND_REQUIRED')" class="alert warn" role="status">
          Chứng từ chưa có loại hợp lệ để quét. Hãy kiểm tra loại chứng từ của bản gốc.
        </div>
        <div v-if="suggestedResult?.azurePdfCoverage" class="alert warn" role="status">
          PDF: yêu cầu trang {{ suggestedResult.azurePdfCoverage.requestedPages.join(', ') }};
          nhận trang {{ suggestedResult.azurePdfCoverage.returnedPages.join(', ') || 'chưa có' }}.
          {{ suggestedResult.azurePdfCoverage.requestedPagesMatched ? 'Khớp phạm vi đã chọn.' : 'Chưa xác nhận đủ trang đã chọn.' }}
          <span v-if="suggestedResult.azurePdfCoverage.sourcePageCount.kind === 'unknown'">Chưa biết tổng số trang của bản gốc.</span>
          <span v-else-if="suggestedResult.azurePdfCoverage.sourcePageCount.kind === 'user-declared'">Người tải khai báo {{ suggestedResult.azurePdfCoverage.sourcePageCount.count }} trang; chưa xác minh.</span>
          <span v-else>Tổng số trang từ metadata đã kiểm tra: {{ suggestedResult.azurePdfCoverage.sourcePageCount.count }}.</span>
          Kết quả chưa xác nhận đầy đủ tài liệu. Hãy kiểm tra bản gốc và số liệu trước khi gửi duyệt.
        </div>

        <div v-if="suggestedResult && ['ready', 'needs_review'].includes(suggestedResult.status) && Object.keys(suggestedResult.fields).length" class="alert warn ocr-suggestion-box">
          <div class="suggestion-header">
            <strong>Dữ liệu AI trích xuất gợi ý:</strong>
            <span>Số tiền: {{ suggestedResult.fields.amount || '' }} {{ suggestedResult.fields.currencyCode || '' }} | Đối tác gợi ý: {{ suggestedResult.fields.partyHint || 'Chưa rõ' }} (chọn thủ công)</span>
          </div>
          <p v-if="suggestedResult.fields.amount" class="text-xs">Tổng tiền: {{ suggestionSource('amount') }}</p>
          <p v-if="suggestedResult.fields.accountingBasis?.vatBasis" class="text-xs">{{ suggestedResult.fields.accountingBasis.vatBasis }} — {{ suggestionSource('accountingBasis.vatBasis') }}</p>

          <section v-if="materialsSourceReview" class="material-source-review" aria-label="Rà soát dòng vật tư từ chứng từ">
            <p>{{ materialsSourceReview.lines.length }} dòng nguồn: {{ materialsSourceReview.applicableCount }} dòng có thể áp dụng; {{ materialsSourceReview.withheldCount }} dòng giữ lại để rà soát.</p>
            <p v-if="materialsSourceReview.withheldCount"><strong>Cơ sở vật tư chưa đầy đủ:</strong> {{ materialsSourceReview.withheldCount }} dòng có thành tiền in khác SL × đơn giá nên chưa được áp dụng. Đối chiếu bản gốc và hoàn thiện các dòng này thủ công trước khi xác nhận đã rà soát.</p>
            <div style="overflow-x:auto">
              <table>
                <caption>Dòng nguồn để kế toán đối chiếu; số tiền in được giữ nguyên</caption>
                <thead><tr><th scope="col">Tên vật tư</th><th scope="col">SL</th><th scope="col">ĐVT</th><th scope="col">Đơn giá</th><th scope="col">Thành tiền in</th><th scope="col">SL × đơn giá</th><th scope="col">Rà soát</th><th scope="col">Nguồn và độ tin cậy OCR</th></tr></thead>
                <tbody>
                  <tr v-for="(line, index) in materialsSourceReview.lines" :key="`${line.pageNumber}-${line.tableIndex}-${line.rowIndex}`">
                    <td>{{ line.description }}</td><td>{{ line.quantity }}</td><td>{{ line.unit }}</td><td>{{ line.unitPrice }}</td><td>{{ line.printedLineAmount }}</td><td>{{ line.calculatedLineAmount }}</td>
                    <td>{{ line.status === 'reconciled' ? 'Có thể áp dụng' : 'Giữ lại để rà soát' }}</td>
                    <td>Trang {{ line.pageNumber }}, bảng {{ line.tableIndex + 1 }}, dòng {{ line.rowIndex + 1 }};
                      {{ suggestionSource(`basis.sourceLines.${index}.description`) }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <button v-if="canApplySuggestion" type="button" class="cockpit-btn cockpit-btn--primary mt-2" @click="applySuggestion">
            Áp dụng dữ liệu gợi ý vào biểu mẫu
          </button>
        </div>
      </fieldset>

      <!-- PHẦN 3: RÀ SOÁT VÀ GỬI DUYỆT -->
      <fieldset class="form-section">
        <legend class="section-legend">
          <span class="step-num">3</span>
          Rà soát và gửi duyệt
        </legend>

        <label class="row review-confirm-label">
          <input
            v-model="reviewed"
            type="checkbox"
            :disabled="isReadonly || isSubmitting || retryReady || isScanning || scanRetryReady || ocrPending"
          >
          <span class="font-medium">Đã rà soát hợp lệ chứng từ và số liệu chi.</span>
        </label>

        <!-- Lý do nút bị khóa khi chưa đủ điều kiện -->
        <div v-if="!canSubmit && !isReadonly && submitDisabledReasons.length" class="disabled-reasons-box">
          <span class="reasons-heading">Chưa thể gửi duyệt vì:</span>
          <ul class="reasons-list">
            <li v-for="r in submitDisabledReasons" :key="r">{{ r }}</li>
          </ul>
        </div>

        <div class="actions">
          <button type="button" class="cockpit-btn" :disabled="isSubmitting" @click="$emit('cancel')">Hủy</button>
          <button
            v-if="!isReadonly"
            type="submit"
            class="cockpit-btn cockpit-btn--primary"
            :disabled="!canSubmit"
          >
            {{ isSubmitting ? 'Đang gửi...' : retryReady ? 'Thử lại gửi duyệt khoản chi' : 'Gửi duyệt khoản chi' }}
          </button>
        </div>
      </fieldset>
    </form>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue'
import Decimal from 'decimal.js'
import {
  costRequestInputSchema,
  type CostRequestInput,
  type CostBasisInput,
  type CostRequestView,
  type WorkflowContractView,
  type WorkflowProjectContext,
  type WorkflowPartyOption,
} from '../../../shared/schemas/costs/cost-workflow'
import { costExtractionCommandSchema, type CostExtractionView, type ExtractionResult } from '../../../shared/schemas/costs/cost-extraction'
import type { CostWorkflowRepository } from '../../repositories/cost-workflow.contracts'
import type { WorkflowRecoverableQuotation } from '../../../shared/schemas/costs/cost-workflow-evidence'
import { createReviewedRequestSubmission } from '../../utils/costs/cost-request-submission'
import { createEvidenceExtractionSession } from '../../utils/costs/cost-extraction-session'
import { createEvidenceExtractionPolling, hasApplicableExtractionFields, type EvidenceExtractionPollingState } from '../../utils/costs/cost-extraction-polling'
import { sumMaterialReviewLines } from '../../utils/costs/cost-extraction-review'
import { createAsyncRequestTracker } from '../../utils/costs/async-request-tracker'
import { formatFinanceMoney } from '../../utils/costs/finance-display'
import CostWorkflowOriginalUpload from './CostWorkflowOriginalUpload.vue'

const props = defineProps<{
  companyId: string
  projectId: string
  project?: { projectCode?: string; projectName?: string } | null
  context: WorkflowProjectContext
  parties: WorkflowPartyOption[]
  categories: Array<{ id: string; name: string }>
  contracts: WorkflowContractView[]
  initial?: CostRequestView
}>()

const emit = defineEmits<{
  (e: 'submitted', requestId: string): void
  (e: 'cancel'): void
  (e: 'dirty', isDirty: boolean): void
}>()

const repo: CostWorkflowRepository = useRepositories().costWorkflow
const companyAccess = useNuxtApp().$companyAccessStore
const auth = useNuxtApp().$authStore
const permissionFingerprint = () => JSON.stringify([...companyAccess.permissions].sort())
const scopeCurrent = () => companyAccess.activeCompanyId === props.companyId && companyAccess.hasPermission('cost.request.read')
const uploadBusy = ref(false)

const partyId = ref(props.initial?.partyId || '')
const categoryId = ref(props.initial?.categoryId || '')
const contractVersionId = ref(props.initial?.contractVersionId || '')
const amount = ref(props.initial?.amount || '')
const currencyCode = ref(props.initial?.currencyCode || 'VND')
const basisKind = ref<'materials' | 'subcontract' | 'direct_labor' | 'machinery' | 'other'>(props.initial?.basis.kind || 'materials')

const deliverySite = ref(props.initial?.basis.kind === 'materials' ? props.initial.basis.deliverySite : '')
const matLines = ref(props.initial?.basis.kind === 'materials' ? props.initial.basis.lines.map(l => ({ ...l })) : [{ description: '', quantity: '1', unit: 'cái', unitPrice: '0' }])
const subcontractId = ref(props.initial?.basis.kind === 'subcontract' ? props.initial.basis.subcontractId : '')
const acceptanceReference = ref(props.initial?.basis.kind === 'subcontract' ? props.initial.basis.acceptanceReference : '')
const retentionAmount = ref(props.initial?.basis.kind === 'subcontract' ? props.initial.basis.retentionAmount : '0')
const weekStart = ref(props.initial?.basis.kind === 'direct_labor' ? props.initial.basis.weekStart : '')
const laborWorkers = ref(props.initial?.basis.kind === 'direct_labor' ? props.initial.basis.workers.map(w => ({ ...w })) : [{ workerReference: '', days: '1', dailyRate: '0', allowance: '0' }])
const genericLines = ref(props.initial?.basis.kind === 'machinery' || props.initial?.basis.kind === 'other' ? props.initial.basis.lines.map(l => ({ ...l })) : [{ description: '', quantity: '1', unit: 'lần', unitPrice: '0' }])

const vatBasis = ref(props.initial?.accountingBasis?.vatBasis || '')
const roundingBasis = ref(props.initial?.accountingBasis?.roundingBasis || '')
const allowanceBasis = ref(props.initial?.accountingBasis?.allowanceBasis || '')

const evidenceList = ref<Array<{ id: string; name: string }>>(
  props.initial?.evidenceFileIds.map((id, i) => ({ id, name: `Hồ sơ gốc #${i + 1} (${id.slice(0, 8)})` })) || []
)
const reviewed = ref(false)
const isSubmitting = ref(false)
const isScanning = ref(false)
const retryReady = ref(false)
const errorMessage = ref('')
const scanNotice = ref('')
const suggestedResult = ref<ExtractionResult | null>(null)
const suggestedFileId = ref<string | null>(null)
const pdfScopes = ref<Record<string, string>>(Object.fromEntries(evidenceList.value.map(ev => [ev.id, ''])))
const pdfCounts = ref<Record<string, string | number>>({})
const scanRetryReady = ref(false)
const ocrPollingState = ref<EvidenceExtractionPollingState>({ phase: 'idle', fileId: null, automaticRequests: 0, manualReady: false })
const ocrPending = computed(() => ocrPollingState.value.fileId !== null)

const currentRequestId = ref<string | null>(props.initial?.id || null)
const expectedVersion = ref<number>(props.initial?.version ?? 0)
let lifecycleGeneration = 0
let submission = createSession()
let scanSession = createScanSession()
let scanPolling = createScanPolling()

// Track dirty state to warn user on leave
const isFormDirty = computed(() => {
  if (props.initial) return false
  return Boolean(
    partyId.value ||
    categoryId.value ||
    (amount.value && amount.value !== '0') ||
    evidenceList.value.length > 0 ||
    vatBasis.value ||
    roundingBasis.value ||
    allowanceBasis.value
  )
})
watch(isFormDirty, dirty => emit('dirty', dirty), { immediate: true })

// Party disambiguation
const partyNameCounts = computed(() => {
  const counts: Record<string, number> = {}
  for (const p of props.parties) {
    counts[p.name] = (counts[p.name] || 0) + 1
  }
  return counts
})

function formatPartyOption(p: WorkflowPartyOption): string {
  const isDuplicate = (partyNameCounts.value[p.name] || 0) > 1
  const kindTag = p.kind === 'crew'
    ? (p.crewOwnership === 'vqh_internal' ? 'Tổ đội nội bộ VQH' : p.crewOwnership === 'external' ? 'Tổ đội ngoài' : 'Tổ đội')
    : 'Nhà cung cấp'
  if (isDuplicate) {
    return `${p.name} (${kindTag} · ID: ...${p.id.slice(-6)}) [Trùng tên]`
  }
  return `${p.name} (${kindTag})`
}

const selectedParty = computed(() => props.parties.find(p => p.id === partyId.value))
const selectedPartyDuplicateNotice = computed(() => {
  if (!selectedParty.value) return ''
  if ((partyNameCounts.value[selectedParty.value.name] || 0) > 1) {
    return `Đối tác này có tên trùng với đối tác khác trong danh mục. Mã định danh đầy đủ: ${selectedParty.value.id}`
  }
  return ''
})

// Amount formatted
const amountFormatted = computed(() => {
  if (!amount.value) return ''
  return formatFinanceMoney(amount.value, currencyCode.value, currencyCode.value === 'VND' ? 0 : 2)
})

// Lines reconciliation
const calculatedLinesSum = computed(() => {
  try {
    let sum = new Decimal(0)
    if (basisKind.value === 'materials') {
      for (const l of matLines.value) {
        if (!l.quantity || !l.unitPrice) continue
        const q = new Decimal(l.quantity)
        const p = new Decimal(l.unitPrice)
        if (q.isFinite() && p.isFinite()) {
          const lineVal = currencyCode.value === 'VND' ? q.mul(p).round() : q.mul(p)
          sum = sum.add(lineVal)
        }
      }
    } else if (basisKind.value === 'direct_labor') {
      for (const w of laborWorkers.value) {
        const d = new Decimal(w.days || 0)
        const r = new Decimal(w.dailyRate || 0)
        const a = new Decimal(w.allowance || 0)
        if (d.isFinite() && r.isFinite() && a.isFinite()) {
          const lineVal = currencyCode.value === 'VND' ? d.mul(r).add(a).round() : d.mul(r).add(a)
          sum = sum.add(lineVal)
        }
      }
    } else if (basisKind.value === 'machinery' || basisKind.value === 'other') {
      for (const l of genericLines.value) {
        if (!l.quantity || !l.unitPrice) continue
        const q = new Decimal(l.quantity)
        const p = new Decimal(l.unitPrice)
        if (q.isFinite() && p.isFinite()) {
          const lineVal = currencyCode.value === 'VND' ? q.mul(p).round() : q.mul(p)
          sum = sum.add(lineVal)
        }
      }
    } else {
      return null
    }
    return sum.toString()
  } catch {
    return null
  }
})

const linesSumFormatted = computed(() => {
  if (calculatedLinesSum.value === null) return null
  return formatFinanceMoney(calculatedLinesSum.value, currencyCode.value, currencyCode.value === 'VND' ? 0 : 2)
})

const isLinesSumDifferent = computed(() => {
  if (!amount.value || calculatedLinesSum.value === null) return false
  try {
    return !new Decimal(amount.value).eq(new Decimal(calculatedLinesSum.value))
  } catch {
    return false
  }
})

// Submission disabled reasons
const submitDisabledReasons = computed(() => {
  const reasons: string[] = []
  if (isReadonly.value) return ['Hồ sơ đang ở trạng thái chỉ đọc']
  if (isSubmitting.value) return ['Đang gửi yêu cầu...']
  if (uploadBusy.value) return ['Đang tải lên tệp chứng từ']
  if (isScanning.value || ocrPending.value) return ['Đang xử lý trích xuất OCR']
  if (scanRetryReady.value) return ['Cần hoàn thành xử lý OCR hoặc gỡ tệp lỗi']
  if (props.context.operationalState === 'completed') return ['Dự án đã kết thúc, không thể lập thêm đề nghị']
  if (!props.context.canSubmit) return ['Bạn chưa được phân quyền gửi duyệt đề nghị chi cho dự án này']

  if (!partyId.value) reasons.push('Chưa chọn đối tác nhận chi')
  if (!categoryId.value) reasons.push('Chưa chọn hạng mục chi phí')
  if (!amount.value || !/^(?:0|[1-9]\d{0,15})(?:\.\d{1,4})?$/.test(amount.value) || Number(amount.value) <= 0) {
    reasons.push('Số tiền đề nghị chưa hợp lệ (phải là số dương)')
  }
  if (evidenceList.value.length === 0) reasons.push('Chưa đính kèm hồ sơ chứng từ gốc')
  if (buildInput() === null) {
    if (basisKind.value === 'materials') {
      if (!deliverySite.value.trim()) reasons.push('Thiếu địa điểm giao hàng vật tư')
      if (matLines.value.some(l => !l.description.trim() || !l.quantity || !l.unit.trim() || !l.unitPrice)) {
        reasons.push('Dòng vật tư thiếu thông tin (tên, số lượng, ĐVT hoặc đơn giá)')
      }
    } else if (basisKind.value === 'subcontract') {
      if (!subcontractId.value) reasons.push('Chưa chọn hợp đồng phụ')
      if (!acceptanceReference.value.trim()) reasons.push('Chưa nhập số biên bản nghiệm thu')
    } else if (basisKind.value === 'direct_labor') {
      if (!weekStart.value) reasons.push('Chưa chọn ngày đầu tuần chấm công')
      if (selectedParty.value?.kind !== 'crew' || selectedParty.value?.crewOwnership !== 'vqh_internal') {
        reasons.push('Nhân công trực tiếp yêu cầu chọn tổ đội nội bộ VQH')
      }
    }
  }
  if (!reviewed.value) reasons.push('Chưa tích xác nhận đã rà soát chứng từ và số liệu')
  return reasons
})

function createScanScopeGuard() {
  const captured = {
    companyId: props.companyId,
    projectId: props.projectId,
    requestId: currentRequestId.value,
    actorId: auth.user?.id,
    generation: lifecycleGeneration,
    permissions: permissionFingerprint(),
  }
  return () =>
    lifecycleGeneration === captured.generation &&
    scopeCurrent() &&
    props.companyId === captured.companyId &&
    props.projectId === captured.projectId &&
    currentRequestId.value === captured.requestId &&
    auth.user?.id === captured.actorId &&
    auth.lifecycle === 'authenticated' &&
    permissionFingerprint() === captured.permissions &&
    companyAccess.hasPermission('cost.prepare') &&
    companyAccess.hasPermission('cost.request.submit') &&
    companyAccess.hasPermission('cost.request.file.read')
}

function createScanSession() {
  return createEvidenceExtractionSession({ projectId: props.projectId, repository: repo, isScopeCurrent: createScanScopeGuard() })
}

function createScanPolling() {
  const session = scanSession
  const isScopeCurrent = createScanScopeGuard()
  return createEvidenceExtractionPolling({
    scan: (fileId, input) => session.scan(fileId, input),
    isScopeCurrent,
    onStateChange: (state) => {
      if (!isScopeCurrent()) return
      ocrPollingState.value = state
      isScanning.value = state.phase === 'requesting'
      if (state.fileId && state.phase !== 'uncertain') {
        scanNotice.value = state.phase === 'limited'
          ? 'Đang xử lý OCR. Đã tạm dừng tự động lấy kết quả; bấm “Lấy kết quả” để kiểm tra lại.'
          : 'Đang xử lý OCR; hệ thống sẽ lấy kết quả trong phạm vi PDF đã chọn.'
      }
    },
    onResult: (result) => {
      if (isScopeCurrent()) acceptScanResult(result)
    },
    onError: (error) => {
      if (isScopeCurrent()) {
        scanRetryReady.value = session.pendingFileId !== null
        scanNotice.value = error instanceof Error ? error.message : 'Chưa xác định kết quả trích xuất. Thử lại với đúng tệp và phạm vi đã chọn.'
      }
    },
  })
}

function createSession(initial: CostRequestView | null = props.initial ?? null) {
  const captured = { companyId: props.companyId, projectId: props.projectId, permissions: permissionFingerprint(), generation: lifecycleGeneration }
  return createReviewedRequestSubmission({
    projectId: captured.projectId,
    repository: repo,
    initial: initial ?? undefined,
    isScopeCurrent: () =>
      lifecycleGeneration === captured.generation &&
      scopeCurrent() &&
      props.companyId === captured.companyId &&
      props.projectId === captured.projectId &&
      permissionFingerprint() === captured.permissions &&
      companyAccess.hasPermission('cost.request.submit'),
  })
}

const actionTracker = createAsyncRequestTracker<{ companyId: string; projectId: string }>()
const isReadonly = computed(() => props.initial?.status === 'approved' || props.initial?.status === 'submitted')
const quotationChoices = ref<WorkflowRecoverableQuotation[]>([])
const quotationLoading = ref(false)
const quotationListed = ref(false)
const quotationError = ref(false)
const quotationTracker = createAsyncRequestTracker<{ scope: string; requestId: string | null; requestVersion: number | null }>()
let quotationChoiceToken: ReturnType<typeof quotationTracker.start> | null = null

const quotationScope = computed(() => JSON.stringify({
  actorId: auth.user?.id,
  authLifecycle: auth.lifecycle,
  activeCompanyId: companyAccess.activeCompanyId,
  companyId: props.companyId,
  projectId: props.projectId,
  permissions: permissionFingerprint(),
  generation: lifecycleGeneration,
  requestId: currentRequestId.value,
  requestVersion: expectedVersion.value,
  initialId: props.initial?.id,
  initialVersion: props.initial?.version,
  initialStatus: props.initial?.status,
  mode: props.context.mode,
  operationalState: props.context.operationalState,
  canSubmit: props.context.canSubmit,
}))

const quotationBusy = computed(() => isReadonly.value || isSubmitting.value || retryReady.value || uploadBusy.value || isScanning.value || scanRetryReady.value || ocrPending.value)
const canPickQuotation = computed(() => scopeCurrent() && !!auth.user?.id && auth.lifecycle === 'authenticated'
  && companyAccess.hasPermission('cost.prepare') && companyAccess.hasPermission('cost.request.submit') && companyAccess.hasPermission('cost.request.file.read')
  && props.context.mode === 'document_backed_v1' && props.context.operationalState === 'active' && props.context.canSubmit && !quotationBusy.value
  && (!props.initial || (props.initial.id === currentRequestId.value && props.initial.version === expectedVersion.value)))

function clearQuotationChoices() {
  quotationTracker.invalidate()
  quotationChoiceToken = null
  quotationChoices.value = []
  quotationLoading.value = false
  quotationListed.value = false
  quotationError.value = false
}

watch([quotationScope, quotationBusy], clearQuotationChoices, { flush: 'sync' })

function quotationTokenCurrent(token: ReturnType<typeof quotationTracker.start>) {
  return token.isCurrent() && token.identity.scope === quotationScope.value && canPickQuotation.value
}

async function listQuotations() {
  if (!canPickQuotation.value || quotationLoading.value) return
  clearQuotationChoices()
  const token = quotationTracker.start({ scope: quotationScope.value, requestId: currentRequestId.value, requestVersion: currentRequestId.value === null ? null : expectedVersion.value })
  quotationLoading.value = true
  try {
    const choices = await repo.listRecoverableQuotations(props.projectId, { requestId: token.identity.requestId, requestVersion: token.identity.requestVersion })
    if (!quotationTokenCurrent(token)) return
    quotationChoices.value = choices.map(quotation => ({ ...quotation }))
    quotationChoiceToken = token
    quotationListed = true
  } catch {
    if (quotationTokenCurrent(token)) quotationError.value = true
  } finally {
    if (quotationTokenCurrent(token)) quotationLoading.value = false
  }
}

function selectQuotation(quotation: WorkflowRecoverableQuotation) {
  if (!quotationChoiceToken || !quotationTokenCurrent(quotationChoiceToken) || quotationLoading.value || !quotationChoices.value.includes(quotation) || evidenceList.value.some(ev => ev.id === quotation.id)) return
  onEvidenceFinalized({ id: quotation.id, name: quotation.originalFilename })
  Reflect.deleteProperty(pdfCounts.value, quotation.id)
}

const filteredContracts = computed(() => (!partyId.value ? props.contracts : props.contracts.filter(c => c.partyId === partyId.value)))

watch(partyId, () => {
  if (selectedParty.value?.crewOwnership === 'vqh_internal' && basisKind.value !== 'direct_labor') {
    basisKind.value = 'direct_labor'
  }
})

const scanTracker = createAsyncRequestTracker<{ companyId: string; projectId: string; fileId: string; requestId: string | null }>()
const previewTracker = createAsyncRequestTracker<{ companyId: string; projectId: string; fileId: string }>()

function resetScope() {
  scanPolling.cancel()
  lifecycleGeneration++
  actionTracker.invalidate()
  scanTracker.invalidate()
  previewTracker.invalidate()
  errorMessage.value = ''
  scanNotice.value = ''
  suggestedResult.value = null
  suggestedFileId.value = null
  pdfScopes.value = {}
  pdfCounts.value = {}
  scanRetryReady.value = false
  ocrPollingState.value = { phase: 'idle', fileId: null, automaticRequests: 0, manualReady: false }
  reviewed.value = false
  isSubmitting.value = false
  isScanning.value = false
  uploadBusy.value = false
  retryReady.value = false
  partyId.value = ''
  categoryId.value = ''
  contractVersionId.value = ''
  amount.value = ''
  deliverySite.value = ''
  subcontractId.value = ''
  acceptanceReference.value = ''
  weekStart.value = ''
  vatBasis.value = ''
  roundingBasis.value = ''
  allowanceBasis.value = ''
  evidenceList.value = []
  matLines.value = [{ description: '', quantity: '1', unit: '', unitPrice: '0' }]
  genericLines.value = [{ description: '', quantity: '1', unit: '', unitPrice: '0' }]
  laborWorkers.value = [{ workerReference: '', days: '0', dailyRate: '0', allowance: '0' }]
  currencyCode.value = 'VND'
  basisKind.value = 'materials'
  retentionAmount.value = '0'
  currentRequestId.value = null
  expectedVersion.value = 0
  submission = createSession(null)
  scanSession = createScanSession()
  scanPolling = createScanPolling()
}

watch([() => props.companyId, () => props.projectId, () => companyAccess.activeCompanyId, permissionFingerprint, () => auth.user?.id, () => auth.lifecycle], resetScope, { flush: 'sync' })

onUnmounted(() => {
  scanPolling.cancel()
  lifecycleGeneration++
  actionTracker.invalidate()
  scanTracker.invalidate()
  previewTracker.invalidate()
  clearQuotationChoices()
})

watch(
  [partyId, categoryId, contractVersionId, amount, currencyCode, basisKind, deliverySite, matLines, subcontractId, acceptanceReference, retentionAmount, weekStart, laborWorkers, genericLines, vatBasis, roundingBasis, allowanceBasis, evidenceList],
  () => { reviewed.value = false },
  { deep: true, flush: 'sync' }
)

function onEvidenceFinalized(p: { id: string; name: string }) {
  if (!evidenceList.value.some(e => e.id === p.id)) {
    evidenceList.value.push(p)
    pdfScopes.value[p.id] = ''
  }
}

function removeEvidence(id: string) {
  if (isScanning.value || scanRetryReady.value || ocrPending.value) return
  evidenceList.value = evidenceList.value.filter(e => e.id !== id)
  if (suggestedFileId.value === id) {
    suggestedResult.value = null
    suggestedFileId.value = null
    reviewed.value = false
  }
}

async function previewEvidence(fileId: string, disposition: 'inline' | 'attachment' = 'inline') {
  if (!scopeCurrent() || !companyAccess.hasPermission('cost.request.file.read')) return
  const token = previewTracker.start({ companyId: props.companyId, projectId: props.projectId, fileId })
  try {
    const res = await repo.readEvidenceUrl(token.identity.projectId, fileId, { disposition })
    if (token.isCurrent() && scopeCurrent()) window.open(res.url, '_blank', 'noopener,noreferrer')
  } catch (e: unknown) {
    if (token.isCurrent() && scopeCurrent()) errorMessage.value = e instanceof Error ? e.message : 'Không thể mở chứng từ.'
  }
}

function scanInput(fileId: string) {
  const scope = pdfScopes.value[fileId]
  const count = String(pdfCounts.value[fileId] ?? '').trim()
  return costExtractionCommandSchema.safeParse({
    requestId: currentRequestId.value,
    ...(scope ? { pdfPageScope: scope } : {}),
    ...(count ? { pdfDeclaredPageCount: Number(count) } : {}),
  })
}

function canScanEvidence(ev: { id: string; name: string }) {
  if (!scopeCurrent() || isSubmitting.value || uploadBusy.value || isScanning.value || !companyAccess.hasPermission('cost.prepare') || !companyAccess.hasPermission('cost.request.submit') || !companyAccess.hasPermission('cost.request.file.read')) return false
  if (ocrPending.value) return ocrPollingState.value.fileId === ev.id && ocrPollingState.value.manualReady
  return (!scanRetryReady.value || scanSession.pendingFileId === ev.id) && (!/\.pdf$/i.test(ev.name) || !!pdfScopes.value[ev.id]) && scanInput(ev.id).success
}

watch([pdfScopes, pdfCounts], () => {
  if (!isScanning.value && !scanRetryReady.value) {
    scanPolling.cancel()
    suggestedResult.value = null
    suggestedFileId.value = null
    scanNotice.value = ''
    reviewed.value = false
  }
}, { deep: true, flush: 'sync' })

function acceptScanResult(res: CostExtractionView) {
  suggestedResult.value = res.result
  suggestedFileId.value = res.fileId
  scanRetryReady.value = false
  reviewed.value = false
  if (res.result.warnings.includes('OCR_RESPONSE_UNCERTAIN')) {
    scanNotice.value = 'Chưa xác định kết quả OCR trước đó. Kiểm tra lại kết quả trước khi tiếp tục.'
  } else if (res.result.warnings.includes('OCR_PROVIDER_NOT_CONFIGURED')) {
    scanNotice.value = 'Dịch vụ OCR chưa được cấu hình; vui lòng kiểm tra bản gốc, nhập và rà soát thủ công.'
  } else if (res.result.warnings.includes('OCR_FREE_QUOTA_EXHAUSTED')) {
    scanNotice.value = 'Đã đạt trần OCR nội bộ của môi trường DEV. Trần vận hành này tách biệt với hạn mức Azure F0. Bạn có thể dùng kết quả đã lưu hoặc kiểm tra bản gốc, nhập và rà soát thủ công.'
  } else if (res.result.status === 'unavailable' || res.result.status === 'failed') {
    scanNotice.value = 'Chưa có dữ liệu nhận dạng hợp lệ; vui lòng kiểm tra bản gốc, nhập và rà soát thủ công.'
  } else if (!hasApplicableExtractionFields(res.result, basisKind.value)) {
    scanNotice.value = 'Chưa có dữ liệu gợi ý có thể áp dụng. Hãy kiểm tra bản gốc và nhập dữ liệu cần thiết trước khi rà soát.'
  } else {
    scanNotice.value = 'Dữ liệu chỉ là gợi ý; vui lòng rà soát trước khi gửi.'
  }
}

async function scanEvidence(fileId: string) {
  if (!scopeCurrent() || isSubmitting.value || uploadBusy.value || isScanning.value || !companyAccess.hasPermission('cost.request.submit') || !companyAccess.hasPermission('cost.request.file.read') || !companyAccess.hasPermission('cost.prepare')) return
  if (ocrPending.value) {
    if (ocrPollingState.value.fileId === fileId) await scanPolling.continue()
    return
  }
  const selected = scanInput(fileId)
  if (!selected.success) return
  const token = scanTracker.start({ companyId: props.companyId, projectId: props.projectId, fileId, requestId: currentRequestId.value })
  isScanning.value = true
  scanNotice.value = ''
  reviewed.value = false
  try {
    const res = await scanSession.scan(fileId, selected.data)
    if (!token.isCurrent() || !scopeCurrent()) return
    acceptScanResult(res)
    scanPolling.start(fileId, selected.data, res)
  } catch (e: unknown) {
    if (token.isCurrent() && scopeCurrent()) {
      scanRetryReady.value = scanSession.pendingFileId !== null
      scanNotice.value = e instanceof Error ? e.message : 'Không thể trích xuất.'
    }
  } finally {
    if (token.isCurrent() && scopeCurrent()) isScanning.value = false
  }
}

const canApplySuggestion = computed(() => !!suggestedResult.value && scopeCurrent() && !isReadonly.value && !isSubmitting.value && !retryReady.value && !isScanning.value && !scanRetryReady.value && !ocrPending.value && evidenceList.value.some(ev => ev.id === suggestedFileId.value) && hasApplicableExtractionFields(suggestedResult.value, basisKind.value))

const materialsSourceReview = computed(() => {
  const basis = suggestedResult.value?.fields.basis
  if (basis?.kind !== 'materials' || !basis.sourceLines?.length) return null
  return {
    lines: basis.sourceLines,
    applicableCount: basis.lines.length,
    withheldCount: basis.sourceLines.filter(line => line.status === 'printed_amount_mismatch').length,
    applicableSum: sumMaterialReviewLines(basis.lines, 'VND'),
  }
})

function suggestionSource(field: string): string {
  const sources = suggestedResult.value?.providerLocations?.filter(source => source.field === field) ?? []
  if (!sources.length) return 'Nguồn OCR hoặc độ tin cậy chưa xác định'
  const pages = [...new Set(sources.map(source => source.pageNumber))].join(', ')
  const known = sources.every(source => source.confidence !== undefined)
  return `Trang ${pages}; ${known ? `độ tin cậy OCR ${Math.floor(Math.min(...sources.map(source => source.confidence!)) * 100)}%` : 'độ tin cậy OCR chưa xác định'}`
}

function applySuggestion() {
  if (!suggestedResult.value || !canApplySuggestion.value) return
  reviewed.value = false
  const f = suggestedResult.value.fields
  if (f.amount) amount.value = f.amount
  if (f.currencyCode) currencyCode.value = f.currencyCode
  if (f.accountingBasis?.vatBasis) vatBasis.value = f.accountingBasis.vatBasis
  if (f.accountingBasis?.roundingBasis) roundingBasis.value = f.accountingBasis.roundingBasis
  if (f.accountingBasis?.allowanceBasis) allowanceBasis.value = f.accountingBasis.allowanceBasis
  if (f.basis?.kind === 'materials' && basisKind.value === 'materials') {
    if (f.basis.deliverySite) deliverySite.value = f.basis.deliverySite
    if (f.basis.lines?.length) matLines.value = f.basis.lines.map(l => ({ description: l.description, quantity: l.quantity, unit: l.unit, unitPrice: l.unitPrice }))
  } else if (f.basis?.kind === 'direct_labor' && basisKind.value === 'direct_labor') {
    if (f.basis.weekStart) weekStart.value = f.basis.weekStart
    if (f.basis.workers.length) laborWorkers.value = f.basis.workers.map(w => ({ ...w }))
  } else if (f.basis?.kind === 'subcontract' && basisKind.value === 'subcontract') {
    if (f.basis.acceptanceReference) acceptanceReference.value = f.basis.acceptanceReference
    if (f.basis.retentionAmount) retentionAmount.value = f.basis.retentionAmount
  } else if (f.basis && (f.basis.kind === 'machinery' || f.basis.kind === 'other') && f.basis.kind === basisKind.value) {
    if (f.basis.lines.length) genericLines.value = f.basis.lines.map(l => ({ ...l }))
  }
}

function buildBasis(): CostBasisInput {
  if (basisKind.value === 'materials') return { kind: 'materials', deliverySite: deliverySite.value, lines: matLines.value }
  if (basisKind.value === 'subcontract') return { kind: 'subcontract', subcontractId: subcontractId.value, acceptanceReference: acceptanceReference.value, retentionAmount: retentionAmount.value }
  if (basisKind.value === 'direct_labor') return { kind: 'direct_labor', weekStart: weekStart.value, workers: laborWorkers.value }
  return { kind: basisKind.value, lines: genericLines.value }
}

function buildInput(): CostRequestInput | null {
  const p = selectedParty.value
  if (!p) return null
  const acc = { ...(vatBasis.value ? { vatBasis: vatBasis.value } : {}), ...(roundingBasis.value ? { roundingBasis: roundingBasis.value } : {}), ...(allowanceBasis.value ? { allowanceBasis: allowanceBasis.value } : {}) }
  const candidate = {
    partyId: p.id,
    partyKind: p.kind,
    ...(p.kind === 'crew' ? { crewOwnership: p.crewOwnership } : {}),
    categoryId: categoryId.value,
    ...(contractVersionId.value ? { contractVersionId: contractVersionId.value } : {}),
    amount: amount.value,
    currencyCode: currencyCode.value,
    basis: buildBasis(),
    ...(Object.keys(acc).length > 0 ? { accountingBasis: acc } : {}),
    evidenceFileIds: evidenceList.value.map(e => e.id),
  }
  const parsed = costRequestInputSchema.safeParse(candidate)
  return parsed.success ? parsed.data : null
}

const canSubmit = computed(() => scopeCurrent() && companyAccess.hasPermission('cost.request.submit') && !uploadBusy.value && !isScanning.value && !scanRetryReady.value && !ocrPending.value && !isReadonly.value && !isSubmitting.value && props.context.canSubmit && props.context.operationalState !== 'completed' && reviewed.value && evidenceList.value.length > 0 && buildInput() !== null)

async function handleSubmit() {
  const input = buildInput()
  if (!input || !canSubmit.value) return
  const token = actionTracker.start({ companyId: props.companyId, projectId: props.projectId })
  isSubmitting.value = true
  errorMessage.value = ''
  try {
    const receipt = await submission.submit(input)
    if (!token.isCurrent() || !scopeCurrent()) return
    currentRequestId.value = receipt.requestId
    expectedVersion.value = receipt.result.version
    retryReady.value = false
    emit('submitted', receipt.requestId)
  } catch (e: unknown) {
    if (!token.isCurrent() || !scopeCurrent()) return
    currentRequestId.value = submission.requestId ?? null
    expectedVersion.value = submission.version
    retryReady.value = true
    errorMessage.value = e instanceof Error && e.message === 'REQUEST_RESPONSE_UNCERTAIN'
      ? 'Chưa xác định kết quả gửi trước. Thử lại đúng dữ liệu hoặc tải lại yêu cầu trước khi chỉnh sửa.'
      : e instanceof Error ? e.message : 'Không thể gửi yêu cầu.'
  } finally {
    if (token.isCurrent() && scopeCurrent()) isSubmitting.value = false
  }
}
</script>

<style scoped>
.cost-request-panel {
  display: flex;
  flex-direction: column;
  gap: 20px;
  min-width: 0;
  padding: 20px;
}

.panel-top-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  padding-bottom: 12px;
  border-bottom: 1px solid #e2e8f0;
}

.panel-title-area {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.panel-title-area h4 {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  color: #0f172a;
}

.project-indicator {
  display: inline-flex;
  align-items: center;
  padding: 2px 10px;
  border-radius: 12px;
  background: #f1f5f9;
  font-size: 12px;
  font-weight: 500;
  color: #334155;
}

.request-form {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.form-section {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 18px 20px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #ffffff;
  margin: 0;
}

.section-legend {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 700;
  color: #1e293b;
  padding: 0 6px;
}

.step-num {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: #2563eb;
  color: #ffffff;
  font-size: 12px;
  font-weight: 700;
}

.field-guide-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 16px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  font-size: 12px;
  color: #475569;
}

.guide-item {
  display: flex;
  gap: 8px;
  align-items: baseline;
}

.guide-tag {
  display: inline-block;
  padding: 1px 6px;
  border-radius: 4px;
  background: #e2e8f0;
  font-weight: 600;
  color: #1e293b;
  white-space: nowrap;
}

.cost-request-panel label:not(.row) {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  font-size: 13px;
  font-weight: 500;
  color: #334155;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 240px), 1fr));
  gap: 16px;
}

.field-tip {
  font-size: 11px;
  color: #64748b;
  font-weight: 400;
}

.text-warning {
  color: #b45309 !important;
}

.basis-details-container {
  padding: 14px 16px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
}

.lines-table-header {
  margin-bottom: 8px;
}

.line-grid {
  display: grid;
  grid-template-columns: minmax(0, 2fr) repeat(3, minmax(0, 1fr)) auto;
  align-items: end;
  gap: 10px;
  margin: 10px 0;
}

.line-grid .cockpit-input {
  min-width: 0;
}

.lines-reconciliation-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 16px;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  border-radius: 6px;
}

.reconciliation-row {
  display: flex;
  gap: 24px;
  flex-wrap: wrap;
}

.reconciliation-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.reconciliation-label {
  color: #1e40af;
}

.reconciliation-val {
  font-size: 14px;
  color: #0f172a;
}

.reconciliation-note {
  margin: 0;
  font-size: 12px;
  color: #1e40af;
  display: flex;
  align-items: center;
  gap: 4px;
}

.inline-icon {
  flex-shrink: 0;
}

.step-guide-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 16px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
}

.guide-title {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: #1e293b;
  display: flex;
  align-items: center;
  gap: 6px;
}

.step-list {
  margin: 0;
  padding-left: 20px;
  font-size: 12px;
  color: #475569;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.quotation-picker {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.quotation-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.quotation-list li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 4px;
  font-size: 12px;
}

.evidence-list-container {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.evidence-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.field-error-inline {
  font-size: 12px;
  color: #dc2626;
}

.evidence-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  flex-wrap: wrap;
}

.evidence-identity {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 1 1 200px;
}

.file-icon {
  font-size: 16px;
  color: #64748b;
  flex-shrink: 0;
}

.evidence-name {
  font-size: 13px;
  font-weight: 500;
  color: #0f172a;
  overflow-wrap: anywhere;
}

.evidence-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.pdf-scope-label, .pdf-count-label {
  display: inline-flex !important;
  flex-direction: row !important;
  align-items: center !important;
  gap: 4px !important;
  font-size: 12px !important;
}

.cockpit-select--sm, .cockpit-input--sm {
  padding: 2px 6px;
  font-size: 12px;
  height: 28px;
}

.ocr-suggestion-box {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.suggestion-header {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 13px;
}

.review-confirm-label {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  cursor: pointer;
}

.disabled-reasons-box {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 14px;
  background: #fffbeb;
  border: 1px solid #fde68a;
  border-radius: 6px;
  font-size: 12px;
  color: #92400e;
}

.reasons-heading {
  font-weight: 600;
}

.reasons-list {
  margin: 0;
  padding-left: 18px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 8px;
}

.alert {
  padding: 10px 14px;
  border-radius: 6px;
  font-size: 13px;
}
.alert.warn {
  background: #fef3c7;
  color: #92400e;
  border: 1px solid #fde68a;
}
.alert.error {
  background: #fee2e2;
  color: #991b1b;
  border: 1px solid #fecaca;
}

@media (max-width: 768px) {
  .line-grid {
    grid-template-columns: 1fr 1fr;
  }
  .line-grid > label:first-child {
    grid-column: 1 / -1;
  }
}
</style>
