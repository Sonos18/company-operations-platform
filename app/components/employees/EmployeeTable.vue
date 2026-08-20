<script setup lang="ts">
import EmployeeRoleBadges from './EmployeeRoleBadges.vue'
import type { EmployeeSummary } from '../../features/employees/employee.types'

const props = defineProps<{
  employees: EmployeeSummary[]
}>()

const columns = [
  { accessorKey: 'fullName', header: 'Nhân sự' },
  { accessorKey: 'account', header: 'Tài khoản' },
  { accessorKey: 'department', header: 'Phòng ban' },
  { accessorKey: 'position', header: 'Vị trí' },
  { accessorKey: 'employmentStatus', header: 'Trạng thái' },
  { accessorKey: 'profileComplete', header: 'Hồ sơ' },
  { accessorKey: 'roles', header: 'Vai trò đang hoạt động' },
]

const statusLabels: Record<EmployeeSummary['employmentStatus'], string> = {
  probation: 'Thử việc',
  active: 'Đang làm việc',
  on_leave: 'Tạm nghỉ',
  terminated: 'Đã nghỉ việc',
}

const statusColors: Record<EmployeeSummary['employmentStatus'], 'success' | 'warning' | 'neutral' | 'error'> = {
  probation: 'warning',
  active: 'success',
  on_leave: 'neutral',
  terminated: 'error',
}
</script>

<template>
  <div class="employee-directory">
    <div class="employee-table-wrap" data-testid="employee-table">
      <UTable
        :data="props.employees"
        :columns="columns"
        caption="Danh sách nhân sự"
        empty="Không tìm thấy nhân sự phù hợp."
        class="employee-table"
      >
      <template #fullName-cell="{ row }">
        <div class="employee-name">
          <strong>{{ row.original.fullName }}</strong>
          <span>{{ row.original.workEmail }}</span>
        </div>
      </template>
      <template #account-cell="{ row }">
        <span v-if="row.original.account">{{ row.original.account.email }}</span>
        <span v-else class="redacted-value"><UIcon name="i-lucide-eye-off" aria-hidden="true" />Tài khoản đã được ẩn</span>
      </template>
      <template #department-cell="{ row }">
        {{ row.original.department.name }}
      </template>
      <template #position-cell="{ row }">
        <span :class="{ 'missing-value': !row.original.position }">{{ row.original.position?.name ?? 'Chưa cập nhật' }}</span>
      </template>
      <template #employmentStatus-cell="{ row }">
        <UBadge :color="statusColors[row.original.employmentStatus]" variant="subtle" size="sm">
          {{ statusLabels[row.original.employmentStatus] }}
        </UBadge>
      </template>
      <template #profileComplete-cell="{ row }">
        <span v-if="row.original.profileComplete" class="complete-profile"><UIcon name="i-lucide-circle-check" aria-hidden="true" />Đầy đủ</span>
        <span v-else class="incomplete-profile"><UIcon name="i-lucide-circle-alert" aria-hidden="true" />Hồ sơ chưa đầy đủ</span>
      </template>
      <template #roles-cell="{ row }">
        <EmployeeRoleBadges :roles="row.original.roles" />
      </template>
      </UTable>
    </div>

    <div class="employee-cards" data-testid="employee-cards">
      <article v-for="employee in props.employees" :key="employee.id" class="employee-card" data-testid="employee-card">
        <header>
          <div class="employee-name"><h2>{{ employee.fullName }}</h2><span>{{ employee.workEmail }}</span></div>
          <UBadge :color="statusColors[employee.employmentStatus]" variant="subtle" size="sm">{{ statusLabels[employee.employmentStatus] }}</UBadge>
        </header>
        <dl>
          <div><dt>Tài khoản</dt><dd v-if="employee.account">{{ employee.account.email }}</dd><dd v-else class="redacted-value"><UIcon name="i-lucide-eye-off" aria-hidden="true" />Tài khoản đã được ẩn</dd></div>
          <div><dt>Phòng ban</dt><dd>{{ employee.department.name }}</dd></div>
          <div><dt>Vị trí</dt><dd :class="{ 'missing-value': !employee.position }">{{ employee.position?.name ?? 'Chưa cập nhật' }}</dd></div>
          <div><dt>Hồ sơ</dt><dd v-if="employee.profileComplete" class="complete-profile"><UIcon name="i-lucide-circle-check" aria-hidden="true" />Đầy đủ</dd><dd v-else class="incomplete-profile"><UIcon name="i-lucide-circle-alert" aria-hidden="true" />Hồ sơ chưa đầy đủ</dd></div>
        </dl>
        <div class="card-roles"><span>Vai trò đang hoạt động</span><EmployeeRoleBadges :roles="employee.roles" /></div>
      </article>
    </div>
  </div>
</template>

<style scoped>
.employee-directory { min-width: 0; }
.employee-table-wrap :deep([data-slot='base']) { min-width: 1040px; }
.employee-table-wrap :deep([data-slot='th']) { color: var(--ink-muted); font-size: .65rem; font-weight: 750; letter-spacing: .03em; text-transform: uppercase; white-space: nowrap; }
.employee-table-wrap :deep([data-slot='td']) { vertical-align: top; font-size: .76rem; }
.employee-table-wrap :deep([data-slot='td']:last-child) { min-width: 190px; }
.employee-name { display: grid; gap: 3px; }.employee-name strong,.employee-name h2 { margin: 0; color: var(--forest-deep); font-size: .85rem; }.employee-name span { color: var(--ink-muted); font-size: .7rem; overflow-wrap: anywhere; }
.redacted-value,.complete-profile,.incomplete-profile { display: inline-flex; align-items: center; gap: 5px; font-size: .72rem; line-height: 1.35; }.redacted-value { color: var(--ink-muted); font-style: italic; }.complete-profile { color: var(--forest); }.incomplete-profile { color: #a3442d; font-weight: 700; }.redacted-value :deep(svg),.complete-profile :deep(svg),.incomplete-profile :deep(svg) { width: 15px; height: 15px; flex: 0 0 15px; }
.missing-value { color: var(--ink-muted); font-style: italic; }
.employee-cards { display: none; }

@media (max-width: 767px) {
  .employee-table-wrap { display: none; }
  .employee-cards { display: grid; gap: 12px; }
  .employee-card { display: grid; gap: 13px; padding: 15px; border: 1px solid var(--line); border-radius: var(--radius-md); background: var(--paper-raised); }
  .employee-card header { display: flex; align-items: start; justify-content: space-between; gap: 10px; }.employee-card h2 { font-family: 'Space Grotesk Variable', sans-serif; font-size: 1.05rem; }
  .employee-card dl { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 11px; margin: 0; }.employee-card dl > div { display: grid; gap: 3px; min-width: 0; }.employee-card dt,.card-roles > span { color: var(--ink-muted); font-size: .62rem; font-weight: 750; letter-spacing: .04em; text-transform: uppercase; }.employee-card dd { margin: 0; color: var(--ink); font-size: .76rem; overflow-wrap: anywhere; }.card-roles { display: grid; gap: 7px; padding-top: 11px; border-top: 1px solid var(--line); }
}

@media (max-width: 390px) { .employee-card dl { grid-template-columns: 1fr; } }
</style>
