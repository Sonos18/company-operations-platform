<script setup lang="ts">
import { computed } from 'vue'

definePageMeta({ requiredAnyPermissions: ['cost.manage', 'cost.prepare'] })

const route = useRoute()
const projectId = computed(() => String(route.params.projectId ?? ''))
</script>

<template>
  <section class="max-w-3xl mx-auto space-y-5 pb-12" data-testid="legacy-parent-draft-retired">
    <div class="cockpit-card p-6 rounded-lg space-y-4">
      <h1 class="text-xl font-semibold">Bản nháp tổng hợp đã ngừng sử dụng</h1>
      <p class="text-sm text-gray-600 dark:text-gray-300">
        Liên kết này trỏ đến luồng bản nháp tổng hợp cũ. Bản nháp chi tiết chi phí mới dùng mã riêng;
        hệ thống không chuyển mã bản nháp tổng hợp thành mã chi tiết.
      </p>
      <UButton
        :to="`/cost-drafts?projectId=${encodeURIComponent(projectId)}`"
        color="primary"
        icon="i-lucide-arrow-left"
        data-testid="retired-detail-drafts-link"
      >
        Mở danh sách bản nháp chi tiết
      </UButton>
    </div>
  </section>
</template>
