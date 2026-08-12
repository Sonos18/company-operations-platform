import type { CompanyContext } from '../features/tenancy/tenancy.types'

export function useCompanyContext(): Readonly<CompanyContext> {
  return useRepositories().context
}
