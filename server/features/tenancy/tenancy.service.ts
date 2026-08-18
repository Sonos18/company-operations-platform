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
  async function isActiveMembership(membership: CompanyMembership): Promise<boolean> {
    const { data, error } = await db.rpc('is_company_member', {
      target_tenant_id: membership.tenantId,
      target_company_id: membership.companyId,
    })
    if (error) {
      throw new AppApiError(500, 'INTERNAL_ERROR', 'Không thể xác thực quyền truy cập công ty.')
    }
    return data === true
  }

  async function query(userId: string, companyId?: string): Promise<CompanyMembership[]> {
    let request = db
      .from('company_memberships')
      .select('tenant_id, company_id, companies!inner(code, name)')
      .eq('user_id', userId)
      .order('company_id')
    if (companyId) request = request.eq('company_id', companyId)

    const { data, error } = await request
    if (error) {
      throw new AppApiError(500, 'INTERNAL_ERROR', 'Không thể đọc danh sách công ty.')
    }
    const memberships = (data as unknown as MembershipRow[]).map(mapMembership)
    return (await Promise.all(memberships.map(async membership => (
      await isActiveMembership(membership) ? membership : null
    )))).filter((membership): membership is CompanyMembership => membership !== null)
  }

  return {
    listCompanyAccess: userId => query(userId),
    async findCompanyAccess(userId, companyId) {
      return (await query(userId, companyId))[0] ?? null
    },
  }
}
