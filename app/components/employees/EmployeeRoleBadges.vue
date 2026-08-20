<script setup lang="ts">
import type { EmployeeSummary } from '../../features/employees/employee.types'

const props = defineProps<{
  roles: EmployeeSummary['roles']
}>()
</script>

<template>
  <div v-if="props.roles?.length" class="employee-role-badges" aria-label="Vai trò đang hoạt động">
    <UBadge v-for="role in props.roles" :key="role.id" color="secondary" variant="subtle" size="sm">
      {{ role.name }}
    </UBadge>
  </div>
  <span v-else class="redacted-value">
    <UIcon name="i-lucide-eye-off" aria-hidden="true" />
    Thông tin vai trò đã được ẩn
  </span>
</template>

<style scoped>
.employee-role-badges { display: flex; flex-wrap: wrap; gap: 5px; }
.employee-role-badges :deep(.badge) { font-size: .66rem; white-space: nowrap; }
.redacted-value { display: inline-flex; align-items: center; gap: 5px; color: var(--ink-muted); font-size: .73rem; font-style: italic; line-height: 1.35; }
.redacted-value :deep(svg) { width: 15px; height: 15px; }
</style>
