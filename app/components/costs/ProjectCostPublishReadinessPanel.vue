<script setup lang="ts">
import { computed } from 'vue'
import type { ProjectCostPublishReadiness } from '../../../shared/schemas/costs/project-costs'
import { translatePublishBlockingCode } from '../../utils/costs/accounting-error-mapper'

const props = withDefaults(defineProps<{
  readiness: ProjectCostPublishReadiness
  canPublish?: boolean
}>(), {
  canPublish: false,
})

const emit = defineEmits<{
  'open-publish': []
}>()

const isReady = computed(() => props.readiness.ready)
const blockingCodes = computed(() => props.readiness.blockingCodes || [])
</script>

<template>
  <div class="publish-readiness-panel cockpit-card p-4 rounded-lg space-y-4" data-testid="publish-readiness-panel">
    <div class="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-3">
      <div>
        <h3 class="text-sm font-semibold text-gray-900 dark:text-gray-100">
          Điều kiện phát hành chi phí
        </h3>
        <p class="text-xs text-gray-500">
          Kiểm tra tính đầy đủ của chi tiết tài chính, nguồn số liệu và chứng từ trước khi phát hành chính thức.
        </p>
      </div>

      <span
        class="cockpit-badge text-xs"
        :class="isReady ? 'cockpit-badge--success' : 'cockpit-badge--warning'"
        data-testid="publish-readiness-badge"
      >
        {{ isReady ? 'Đã đủ điều kiện' : `Chưa sẵn sàng (${blockingCodes.length})` }}
      </span>
    </div>

    <!-- Ready State Banner -->
    <div
      v-if="isReady"
      class="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 p-4 rounded-lg flex flex-col md:flex-row md:items-center justify-between gap-3"
      data-testid="publish-ready-banner"
    >
      <div class="flex items-start gap-3">
        <UIcon name="i-lucide-check-circle-2" class="text-emerald-600 text-xl shrink-0 mt-0.5" />
        <div>
          <h4 class="text-sm font-semibold text-emerald-900 dark:text-emerald-100">
            Bản nháp đã sẵn sàng phát hành
          </h4>
          <p class="text-xs text-emerald-700 dark:text-emerald-300">
            Tất cả dòng chi tiết tài chính và chứng từ đính kèm đã hợp lệ.
          </p>
        </div>
      </div>

      <div v-if="props.canPublish">
        <UButton
          color="primary"
          icon="i-lucide-send"
          data-testid="publish-ready-action-btn"
          @click="emit('open-publish')"
        >
          Tiến hành phát hành
        </UButton>
      </div>
      <div v-else class="text-xs text-gray-500 italic">
        (Cần quyền cost.publish_import để thực hiện phát hành)
      </div>
    </div>

    <!-- Not Ready Blockers List -->
    <div
      v-else
      class="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 p-4 rounded-lg space-y-3"
      data-testid="publish-not-ready-blockers"
    >
      <div class="flex items-start gap-3">
        <UIcon name="i-lucide-alert-triangle" class="text-amber-600 text-xl shrink-0 mt-0.5" />
        <div>
          <h4 class="text-sm font-semibold text-amber-900 dark:text-amber-100">
            Chưa thể phát hành do các điều kiện sau:
          </h4>
          <p class="text-xs text-amber-700 dark:text-amber-300">
            Vui lòng giải quyết tất cả lý do chặn bên dưới để bản nháp đạt trạng thái sẵn sàng.
          </p>
        </div>
      </div>

      <ul class="space-y-1.5 pl-8 text-xs text-amber-900 dark:text-amber-200 list-disc" data-testid="blockers-list">
        <li v-for="code in blockingCodes" :key="code" data-testid="blocker-item">
          <strong>{{ translatePublishBlockingCode(code) }}</strong>
          <span class="text-amber-600/75 dark:text-amber-400/75 font-mono ml-1 text-[11px]">({{ code }})</span>
        </li>
      </ul>
    </div>
  </div>
</template>
