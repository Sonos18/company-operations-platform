import type { CompanyContext, DeploymentMode } from '../tenancy/tenancy.types'

export interface Tenant {
  id: string
  name: string
  deploymentMode: DeploymentMode
}

export interface Company extends CompanyContext {
  code: string
  name: string
}

export interface CompanyConfig extends CompanyContext {
  displayName: string
  shortName: string
  brand: {
    logoUrl: string | null
    primaryColor: string
    accentColor: string
  }
  departments: Array<{ code: string, name: string }>
  terminology: Record<string, string>
  workflowTemplateIds: string[]
}
