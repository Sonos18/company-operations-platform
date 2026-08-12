export type DeploymentMode = 'shared' | 'dedicated'

export interface CompanyContext {
  tenantId: string
  companyId: string
}

export interface TenantMembership {
  userId: string
  tenantId: string
  roles: string[]
}

export interface CompanyMembership extends CompanyContext {
  userId: string
  roles: string[]
}
