import type { CompanyAccess, CompanyRequestContext } from '../../../shared/schemas/session'
import { AppApiError } from '../../utils/api-error'
import type { UserSupabaseClient } from '../../utils/supabase-client'

export interface TenancyReader {
  listCompanyAccess(userId: string): Promise<CompanyAccess[]>
  findCompanyAccess(userId: string, companyId: string): Promise<CompanyAccess | null>
}

export function createTenancyService(reader: TenancyReader) {
  return {
    listCompanies(userId: string) {
      return reader.listCompanyAccess(userId)
    },
    async resolveCompanyContext(
      userId: string,
      companyId: string,
    ): Promise<CompanyRequestContext> {
      const membership = await reader.findCompanyAccess(userId, companyId)
      if (!membership) {
        throw new AppApiError(
          403,
          'COMPANY_FORBIDDEN',
          'Bạn không có quyền truy cập công ty này.',
        )
      }
      return {
        tenantId: membership.tenantId,
        companyId: membership.companyId,
        roles: membership.roles,
        permissions: membership.permissions,
      }
    },
  }
}

interface MembershipRow {
  tenant_id: string
  company_id: string
  roles: string[]
  companies: { code: string; name: string } | Array<{ code: string; name: string }>
}

function mapMembership(row: MembershipRow): CompanyAccess {
  const company = Array.isArray(row.companies) ? row.companies[0] : row.companies
  if (!company) {
    throw new AppApiError(500, 'INTERNAL_ERROR', 'Không thể đọc thông tin công ty.')
  }
  return {
    tenantId: row.tenant_id,
    companyId: row.company_id,
    companyCode: company.code,
    companyName: company.name,
    // The compatibility membership array is never an authorization input.
    // Task 6 replaces this display projection with normalized assignments.
    roles: row.roles,
    permissions: [],
  }
}

export function createSupabaseTenancyReader(db: UserSupabaseClient): TenancyReader {
  async function query(userId: string, companyId?: string): Promise<CompanyAccess[]> {
    let request = db
      .from('company_memberships')
      .select('tenant_id, company_id, roles, companies!inner(code, name)')
      .eq('user_id', userId)
      .order('company_id')
    if (companyId) request = request.eq('company_id', companyId)

    const { data, error } = await request
    if (error) {
      throw new AppApiError(500, 'INTERNAL_ERROR', 'Không thể đọc danh sách công ty.')
    }
    return (data as unknown as MembershipRow[]).map(mapMembership)
  }

  return {
    listCompanyAccess: userId => query(userId),
    async findCompanyAccess(userId, companyId) {
      return (await query(userId, companyId))[0] ?? null
    },
  }
}
