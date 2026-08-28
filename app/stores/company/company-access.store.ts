import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { PermissionCode } from '../../../shared/constants/permissions'
import type { CompanyAccess } from '../../../shared/schemas/session'
import type { SessionResponse } from '../../repositories/http/http-session-repository'
import type { ActiveCompanyStorage } from '../../services/auth/active-company.storage'

export interface CompanyAccessStoreOptions {
  activeCompanyStorage: ActiveCompanyStorage
}

export interface CompanyAccessStore {
  companies: CompanyAccess[]
  activeCompanyId: string | null
  activeCompany: CompanyAccess | null
  roles: string[]
  permissions: PermissionCode[]
  applySession(session: SessionResponse): string | null
  selectCompany(companyId: string): boolean
  hasPermission(permission: PermissionCode): boolean
  hasAnyPermission(permissions: readonly PermissionCode[]): boolean
  clearRuntime(): void
  clearPersistedPreference(): void
}

export function createCompanyAccessStore(options: CompanyAccessStoreOptions) {
  return defineStore('company-access', () => {
    const companies = ref<CompanyAccess[]>([])
    const activeCompanyId = ref<string | null>(null)
    const currentUserId = ref<string | null>(null)
    const activeCompany = computed(() => companies.value.find(company => company.companyId === activeCompanyId.value) ?? null)
    const roles = computed(() => activeCompany.value?.roles ?? [])
    const permissions = computed(() => activeCompany.value?.permissions ?? [])

    function selectCompany(companyId: string): boolean {
      const company = companies.value.find(item => item.companyId === companyId)
      if (!company || !currentUserId.value) return false

      activeCompanyId.value = company.companyId
      options.activeCompanyStorage.set(currentUserId.value, company.companyId)
      return true
    }

    function applySession(session: SessionResponse): string | null {
      currentUserId.value = session.user.id
      companies.value = session.companies
      const companyIds = session.companies.map(company => company.companyId)

      if (companyIds.length === 0) {
        options.activeCompanyStorage.clear(session.user.id)
        activeCompanyId.value = null
        return null
      }
      if (companyIds.length === 1) {
        const [companyId] = companyIds
        if (companyId) {
          selectCompany(companyId)
          return companyId
        }
      }

      activeCompanyId.value = options.activeCompanyStorage.get(session.user.id, companyIds)
      return activeCompanyId.value
    }

    function hasPermission(permission: PermissionCode): boolean {
      return permissions.value.includes(permission)
    }

    function hasAnyPermission(requiredPermissions: readonly PermissionCode[]): boolean {
      return requiredPermissions.some(permission => hasPermission(permission))
    }

    function clearRuntime(): void {
      companies.value = []
      activeCompanyId.value = null
      currentUserId.value = null
    }

    function clearPersistedPreference(): void {
      if (currentUserId.value) options.activeCompanyStorage.clear(currentUserId.value)
    }

    return {
      companies,
      activeCompanyId,
      activeCompany,
      roles,
      permissions,
      applySession,
      selectCompany,
      hasPermission,
      hasAnyPermission,
      clearRuntime,
      clearPersistedPreference,
    }
  })
}
