import type { CompanyAccess, CompanyRequestContext } from '../../../shared/schemas/session'
import type { AuthorizationReader } from '../authorization/authorization.service'
import { AppApiError } from '../../utils/api-error'
import type { UserSupabaseClient } from '../../utils/supabase-client'

export interface CompanyMembership {
  tenantId: string
  companyId: string
  companyCode: string
  companyName: string
}

export interface TenancyReader {
  listCompanyAccess(userId: string): Promise<CompanyMembership[]>
  findCompanyAccess(userId: string, companyId: string): Promise<CompanyMembership | null>
}

export function createTenancyService(reader: TenancyReader, authorization: AuthorizationReader) {
  return {
    async listCompanies(userId: string): Promise<CompanyAccess[]> {
      const memberships = await reader.listCompanyAccess(userId)
      return Promise.all(memberships.map(async membership => ({
        ...membership,
        ...await authorization.listAccess(userId, membership.companyId),
      })))
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
        ...await authorization.listAccess(userId, companyId),
      }
    },
  }
}

interface MembershipRow {
  tenant_id: string
  company_id: string
  companies: { code: string; name: string } | Array<{ code: string; name: string }>
}

function mapMembership(row: MembershipRow): CompanyMembership {
  const company = Array.isArray(row.companies) ? row.companies[0] : row.companies
  if (!company) {
    throw new AppApiError(500, 'INTERNAL_ERROR', 'Không thể đọc thông tin công ty.')
  }
  return {
    tenantId: row.tenant_id,
    companyId: row.company_id,
    companyCode: company.code,
    companyName: company.name,
  }
}

export function createSupabaseTenancyReader(db: UserSupabaseClient): TenancyReader {
  async function query(userId: string, companyId?: string): Promise<CompanyMembership[]> {
    let request = db
      .from('company_memberships')
      .select('tenant_id, company_id, companies!inner(code, name)')
      .eq('user_id', userId)
      // This migration adds is_active; generated database types intentionally
      // remain untouched until the managed type-generation workflow is available.
      .eq('is_active' as never, true)
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
