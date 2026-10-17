<template>
  <UModal
    v-if="canRead"
    v-model:open="isOpen"
    title="Thông báo"
    description="Danh sách thông báo mới nhất"
    :ui="{
      overlay: 'bg-slate-900/40 backdrop-blur-sm',
      content: 'max-w-[720px] rounded-2xl',
      description: 'sr-only',
      body: 'flex min-h-0 flex-1 flex-col overflow-hidden p-0 sm:p-0',
    }"
  >
    <button
      type="button"
      class="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-1.5 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
    >
      <UIcon name="i-lucide-bell" class="size-4" aria-hidden="true" />
      <span>Thông báo</span>
      <span
        v-if="unreadCount > 0"
        class="min-w-5 rounded-full bg-red-600 px-1.5 text-center text-xs font-semibold leading-5 text-white"
        data-testid="notification-unread-count"
      >{{ unreadCount > 99 ? '99+' : unreadCount }}</span>
      <span v-if="unreadCount > 0" class="sr-only"> chưa đọc</span>
    </button>

    <template #body>
      <div class="flex justify-end gap-2 border-b border-slate-200 px-4 py-3 sm:px-6">
        <UButton
          color="neutral"
          variant="outline"
          size="xs"
          :disabled="markingAll || loading || unreadCount === 0"
          @click="markAllRead"
        >
          Đánh dấu đã đọc hết
        </UButton>
        <UButton
          color="neutral"
          variant="outline"
          size="xs"
          :disabled="loading || markingAll"
          @click="loadNotifications"
        >
          Làm mới
        </UButton>
      </div>

      <div class="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4 py-4 sm:px-6">
        <p v-if="markAllFailed" class="mb-3 text-sm text-red-600" role="alert">
          Không thể đánh dấu đã đọc hết. Vui lòng thử lại.
        </p>
        <p v-if="loading" class="py-6 text-center text-sm text-slate-500">Đang nạp thông báo...</p>
        <p v-else-if="entries.length === 0" class="py-6 text-center text-sm text-slate-500">Không có thông báo nào.</p>
        <template v-else>
          <ul class="m-0 flex list-none flex-col gap-3 p-0">
            <li v-for="entry in entries" :key="entry.key" class="min-w-0">
              <NotificationCard
                v-if="entry.source === 'material'"
                data-testid="material-notification"
                :badge="materialNotificationBadge(entry.notification.eventKind)"
                :title="entry.text.title"
                :body="entry.text.body"
                :created-at="entry.createdAt"
                :now="now"
                :unread="!entry.notification.readAt"
                :disabled="isOpeningAny"
                @open="openMaterial(entry.notification)"
              />
              <NotificationCard
                v-else
                data-testid="cost-notification"
                :badge="costNotificationBadge"
                :title="kindTitle(entry.notification.kind)"
                body="Phê duyệt độc lập với xác nhận thu/chi thực tế."
                :created-at="entry.createdAt"
                :now="now"
                :unread="isCostUnread(entry.notification)"
                :undelivered="entry.notification.deliveryState === 'undelivered'"
                :disabled="isOpeningAny"
                @open="openCost(entry.notification)"
              />
            </li>
          </ul>
          <div v-if="materialCursor" class="mt-4 flex flex-col items-center gap-2">
            <p v-if="loadMoreFailed" class="text-sm text-red-600" role="alert">Không nạp được thêm thông báo.</p>
            <UButton color="neutral" variant="outline" size="sm" :disabled="loadingMore" @click="loadMoreMaterial">
              Xem thêm
            </UButton>
          </div>
        </template>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import type { WorkflowNotificationView } from '../../../shared/schemas/costs/cost-workflow'
import type { AppNotificationView } from '../../../shared/schemas/costs/material-finance'
import type { CostWorkflowRepository } from '../../repositories/cost-workflow.contracts'
import type { MaterialFinanceRepository } from '../../repositories/material-finance.contracts'
import { appNotificationText, type AppNotificationText } from '../../utils/notifications/app-notification-text'
import {
  costNotificationBadge,
  materialNotificationBadge,
  readAllCutoff,
} from '../../utils/notifications/notification-display'
import { createAsyncRequestTracker } from '../../utils/costs/async-request-tracker'
import NotificationCard from '../notifications/NotificationCard.vue'

type NotificationEntry =
  | { source: 'cost', key: string, createdAt: string, notification: WorkflowNotificationView }
  | { source: 'material', key: string, createdAt: string, notification: AppNotificationView, text: AppNotificationText }

const repositories = useRepositories()
const repo: CostWorkflowRepository = repositories.costWorkflow
const materialRepo: MaterialFinanceRepository = repositories.materialFinance
const store = useNuxtApp().$companyAccessStore

const isOpen = ref(false)
const loading = ref(false)
const loadingMore = ref(false)
const loadMoreFailed = ref(false)
const markingAll = ref(false)
const markAllFailed = ref(false)
// Relative times are measured against this instant, refreshed whenever the list is (re)loaded.
const now = ref(new Date())
const notifications = ref<WorkflowNotificationView[]>([])
const materialNotifications = ref<AppNotificationView[]>([])
const materialCursor = ref<string | null>(null)
const openingMaterial = ref<string | null>(null)
const openingCost = ref(false)
const materialAckKeys = new Map<string, string>()

const tracker = createAsyncRequestTracker<{ fp: string }>()
const moreTracker = createAsyncRequestTracker<{ fp: string }>()
const markAllTracker = createAsyncRequestTracker<{ fp: string }>()
const ackTracker = createAsyncRequestTracker<{ id: string; fp: string }>()
const materialTracker = createAsyncRequestTracker<{ id: string; fp: string }>()
const acknowledging = ref<string | null>(null)
// One shared lock: while any card is opening or being acknowledged, every card is disabled so navigations cannot race.
const isOpeningAny = computed(() => Boolean(openingMaterial.value) || Boolean(acknowledging.value) || openingCost.value)
const ackKeys = new Map<string, string>()

function getFingerprint(): string {
  const p = store?.permissions ? [...store.permissions].sort().join(',') : ''
  return `${store?.activeCompanyId || ''}::${p}`
}

function hasPermission(permission: 'cost.notification.read' | 'material.read'): boolean {
  if (!store?.activeCompanyId) return false
  return Boolean(store.hasPermission ? store.hasPermission(permission) : store.permissions?.includes(permission))
}

const canReadCost = computed(() => hasPermission('cost.notification.read'))
const canReadMaterial = computed(() => hasPermission('material.read'))
const canRead = computed(() => canReadCost.value || canReadMaterial.value)

function isCostUnread(n: WorkflowNotificationView): boolean {
  return n.deliveryState === 'available' && !n.readAt
}

// Both sources merged newest-first. ISO timestamps with offsets are compared as instants.
const entries = computed<NotificationEntry[]>(() => {
  const merged: NotificationEntry[] = [
    ...notifications.value.map((notification): NotificationEntry => ({ source: 'cost', key: 'cost:' + notification.id, createdAt: notification.createdAt, notification })),
    ...materialNotifications.value.map((notification): NotificationEntry => ({ source: 'material', key: 'material:' + notification.id, createdAt: notification.createdAt, notification, text: appNotificationText(notification) })),
  ]
  return merged.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
})

const unreadCount = computed(() => {
  const cost = notifications.value.filter(isCostUnread).length
  const material = materialNotifications.value.filter(n => !n.readAt).length
  return cost + material
})

function kindTitle(kind: WorkflowNotificationView['kind']): string {
  return {
    installment: 'Quyết định đề nghị khoản chi',
    contract_adjustment: 'Quyết định điều chỉnh hạn mức',
    refund: 'Quyết định hoàn tiền',
    correction: 'Quyết định hiệu chỉnh tiền chi',
  }[kind]
}

function clear() {
  tracker.invalidate(); moreTracker.invalidate(); markAllTracker.invalidate()
  ackTracker.invalidate(); materialTracker.invalidate()
  notifications.value = []; materialNotifications.value = []; materialCursor.value = null
  isOpen.value = false; loading.value = false; loadingMore.value = false; loadMoreFailed.value = false
  markingAll.value = false; markAllFailed.value = false
  ackKeys.clear(); acknowledging.value = null
  materialAckKeys.clear(); openingMaterial.value = null; openingCost.value = false
}

watch([() => store.activeCompanyId, () => getFingerprint()], () => { clear(); if (import.meta.client && canRead.value) void loadNotifications() }, { flush: 'sync' })

watch(isOpen, (open) => {
  if (open) void loadNotifications()
})

async function loadNotifications() {
  if (!canRead.value) return
  const fp = getFingerprint()
  const token = tracker.start({ fp })
  // A reload replaces the first page, so a pending "Xem thêm" request is now stale.
  moreTracker.invalidate()
  loadingMore.value = false
  loadMoreFailed.value = false
  markAllFailed.value = false
  now.value = new Date()
  loading.value = true
  try {
    // Each source is read independently so one failing source never hides the other.
    const [costResult, materialResult] = await Promise.allSettled([
      canReadCost.value ? repo.listNotifications() : Promise.resolve<WorkflowNotificationView[]>([]),
      canReadMaterial.value ? materialRepo.listNotifications() : Promise.resolve({ items: [] as AppNotificationView[], nextCursor: null }),
    ])
    if (!token.isCurrent() || getFingerprint() !== fp) return
    notifications.value = costResult.status === 'fulfilled' ? costResult.value : []
    materialNotifications.value = materialResult.status === 'fulfilled' ? materialResult.value.items : []
    materialCursor.value = materialResult.status === 'fulfilled' ? materialResult.value.nextCursor : null
  } finally {
    if (token.isCurrent() && getFingerprint() === fp) loading.value = false
  }
}

async function loadMoreMaterial() {
  const cursor = materialCursor.value
  if (!cursor || loadingMore.value || !canReadMaterial.value) return
  const fp = getFingerprint()
  const token = moreTracker.start({ fp })
  loadingMore.value = true
  loadMoreFailed.value = false
  try {
    const page = await materialRepo.listNotifications(cursor)
    if (!token.isCurrent() || getFingerprint() !== fp) return
    const known = new Set(materialNotifications.value.map(n => n.id))
    materialNotifications.value = [...materialNotifications.value, ...page.items.filter(n => !known.has(n.id))]
    materialCursor.value = page.nextCursor
  } catch {
    if (token.isCurrent() && getFingerprint() === fp) loadMoreFailed.value = true
  } finally {
    if (token.isCurrent() && getFingerprint() === fp) loadingMore.value = false
  }
}

// Each source gets its own cut-off. A source that failed to load or is empty has no items, so its cut-off is null
// and the server marks nothing for it.
async function markAllRead() {
  if (!canRead.value || markingAll.value || loading.value || unreadCount.value === 0) return
  const fp = getFingerprint()
  const token = markAllTracker.start({ fp })
  markingAll.value = true
  markAllFailed.value = false
  try {
    await materialRepo.readAllNotifications({
      materialUpTo: canReadMaterial.value ? readAllCutoff(materialNotifications.value) : null,
      costUpTo: canReadCost.value ? readAllCutoff(notifications.value) : null,
    })
    if (!token.isCurrent() || getFingerprint() !== fp) return
    await loadNotifications()
  } catch {
    if (token.isCurrent() && getFingerprint() === fp) markAllFailed.value = true
  } finally {
    if (token.isCurrent() && getFingerprint() === fp) markingAll.value = false
  }
}

async function markRead(n: WorkflowNotificationView) {
  if (!canReadCost.value || acknowledging.value || !notifications.value.some(value => value.id === n.id) || n.deliveryState !== 'available' || n.readAt) return
  acknowledging.value = n.id
  if (!ackKeys.has(n.id)) ackKeys.set(n.id, crypto.randomUUID())
  const fp = getFingerprint()
  const token = ackTracker.start({ id: n.id, fp })
  try {
    await repo.markNotificationRead(n.id, { idempotencyKey: ackKeys.get(n.id)! })
    if (!token.isCurrent() || getFingerprint() !== fp) return
    n.readAt = new Date().toISOString()
  } catch { /* Keep the acknowledgement key for an uncertain response. */ }
  finally { if (token.isCurrent() && getFingerprint() === fp) acknowledging.value = null }
}

async function openCost(n: WorkflowNotificationView) {
  if (openingCost.value) return
  openingCost.value = true
  const fp = getFingerprint()
  try {
    await markRead(n)
    if (getFingerprint() !== fp) return
    isOpen.value = false
    await navigateTo({
      path: `/costs/${n.projectId}/requests/${n.requestId}`,
      query: { kind: n.kind, submittedVersionId: n.submittedVersionId },
    })
  } finally {
    if (getFingerprint() === fp) openingCost.value = false
  }
}

async function openMaterial(n: AppNotificationView) {
  if (!canReadMaterial.value || openingMaterial.value) return
  openingMaterial.value = n.id
  const fp = getFingerprint()
  const token = materialTracker.start({ id: n.id, fp })
  try {
    if (!n.readAt) {
      if (!materialAckKeys.has(n.id)) materialAckKeys.set(n.id, crypto.randomUUID())
      try {
        await materialRepo.readNotification(n.id, { idempotencyKey: materialAckKeys.get(n.id)! })
        if (token.isCurrent() && getFingerprint() === fp) n.readAt = new Date().toISOString()
      } catch { /* Keep the acknowledgement key for an uncertain response; still open the target. */ }
    }
    if (!token.isCurrent() || getFingerprint() !== fp) return
    isOpen.value = false
    await navigateTo(n.linkPath)
  } finally {
    if (token.isCurrent() && getFingerprint() === fp) openingMaterial.value = null
  }
}

onMounted(() => {
  if (canRead.value) loadNotifications()
})

onUnmounted(() => {
  tracker.invalidate()
  moreTracker.invalidate()
  markAllTracker.invalidate()
  ackTracker.invalidate()
  materialTracker.invalidate()
})
</script>
