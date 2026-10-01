import { watch } from 'vue'
import { clearInMemorySnapshots } from '../utils/costs/cost-command-recovery'

export interface CostRecoveryLifecycleTarget {
  authStore: {
    user: { id: string } | null
    lifecycle: string
  }
  companyAccess: {
    activeCompanyId: string | null
    hasPermission(permission: string): boolean
  }
}

/**
 * Application-level reactive lifecycle observer for cost recovery.
 * Clears sensitive in-memory command snapshots and financial stashes on:
 * - Actor changes & logout
 * - Auth lifecycle transition to anonymous
 * - Company switch
 * - Capability revocation (cost.manage, cost.prepare, cost.publish_import)
 *
 * CRITICAL: Preserves non-financial unresolved markers in sessionStorage.
 * Runs even when entry / detail pages are unmounted.
 */
export function setupCostRecoveryLifecycle({ authStore, companyAccess }: CostRecoveryLifecycleTarget) {
  // 1. Actor changes & logout
  const unwatchActor = watch(
    () => authStore.user?.id,
    (newActor, oldActor) => {
      if (oldActor && newActor !== oldActor) {
        clearInMemorySnapshots({ actorId: oldActor })
      }
      if (!newActor) {
        clearInMemorySnapshots()
      }
    },
    { flush: 'sync' },
  )

  // 2. Auth lifecycle changes (logout / anonymous)
  const unwatchLifecycle = watch(
    () => authStore.lifecycle,
    (lifecycle) => {
      if (lifecycle === 'anonymous') {
        clearInMemorySnapshots()
      }
    },
    { flush: 'sync' },
  )

  // 3. Company switch (clears previous company's sensitive snapshots and stashes)
  const unwatchCompany = watch(
    () => companyAccess.activeCompanyId,
    (newCompany, oldCompany) => {
      if (oldCompany && newCompany !== oldCompany) {
        clearInMemorySnapshots({ companyId: oldCompany })
      }
    },
    { flush: 'sync' },
  )

  // 4. Capability revocation (cost.manage, cost.prepare, cost.publish_import)
  const unwatchPermissions = watch(
    [
      () => companyAccess.hasPermission('cost.manage'),
      () => companyAccess.hasPermission('cost.prepare'),
      () => companyAccess.hasPermission('cost.publish_import'),
    ],
    ([hasManage, hasPrepare, hasPublish], [oldManage, oldPrepare, oldPublish]) => {
      const lostManage = Boolean(oldManage) && !hasManage
      const lostPrepare = Boolean(oldPrepare) && !hasPrepare
      const lostPublish = Boolean(oldPublish) && !hasPublish
      if (lostManage || lostPrepare || lostPublish) {
        clearInMemorySnapshots({ companyId: companyAccess.activeCompanyId ?? undefined })
      }
    },
    { flush: 'sync' },
  )

  return () => {
    unwatchActor()
    unwatchLifecycle()
    unwatchCompany()
    unwatchPermissions()
  }
}

export default defineNuxtPlugin({
  name: 'cost-recovery-lifecycle',
  dependsOn: ['auth-lifecycle'],
  enforce: 'post',
  setup(nuxtApp) {
    const authStore = nuxtApp.$authStore as CostRecoveryLifecycleTarget['authStore'] | undefined
    const companyAccess = nuxtApp.$companyAccessStore as CostRecoveryLifecycleTarget['companyAccess'] | undefined

    if (!authStore || !companyAccess) return
    const teardown = setupCostRecoveryLifecycle({ authStore, companyAccess })
    nuxtApp.vueApp.onUnmount(teardown)
  },
})
