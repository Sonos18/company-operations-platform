import { apiErrorBodySchema, type ApiErrorCode } from '../../../shared/schemas/api-error'
import {
  employeeDetailSchema,
  employeeListResponseSchema,
  employeeUpdateInputSchema,
} from '../../../shared/schemas/employees'
import type { EmployeeRepository } from '../contracts'

export interface HttpEmployeeRepositoryOptions {
  companyId: string
  getAccessToken: () => string | null | Promise<string | null>
  fetch: (input: string, init?: RequestInit) => Promise<Pick<Response, 'ok' | 'status' | 'json'>>
}

export class EmployeeRepositoryError extends Error {
  constructor(readonly code: ApiErrorCode) {
    super(code === 'AUTH_REQUIRED' || code === 'AUTH_INVALID'
      ? 'Bạn cần đăng nhập để tiếp tục.'
      : 'Không thể tải dữ liệu nhân viên.')
  }
}

function safeFailure(code: ApiErrorCode = 'INTERNAL_ERROR'): never {
  throw new EmployeeRepositoryError(code)
}

export function createHttpEmployeeRepository(options: HttpEmployeeRepositoryOptions): EmployeeRepository {
  const baseUrl = `/api/companies/${encodeURIComponent(options.companyId)}/employees`

  async function request(url: string, init: RequestInit = {}): Promise<unknown> {
    let token: string
    try {
      const suppliedToken = await options.getAccessToken()
      if (typeof suppliedToken !== 'string' || !suppliedToken.trim()) return safeFailure('AUTH_REQUIRED')
      token = suppliedToken.trim()
    } catch {
      return safeFailure('AUTH_REQUIRED')
    }

    let response: Pick<Response, 'ok' | 'status' | 'json'>
    try {
      response = await options.fetch(url, {
        ...init,
        headers: { Authorization: `Bearer ${token}`, ...init.headers },
      })
    } catch {
      return safeFailure()
    }

    let body: unknown
    try {
      body = await response.json()
    } catch {
      return safeFailure()
    }
    if (response.ok) return body

    const apiError = apiErrorBodySchema.safeParse(body)
    if (apiError.success) return safeFailure(apiError.data.error.code)
    return safeFailure(response.status === 401 ? 'AUTH_REQUIRED' : 'INTERNAL_ERROR')
  }

  return {
    async list() {
      const items = []
      for (let page = 1; ; page += 1) {
        const result = employeeListResponseSchema.safeParse(await request(`${baseUrl}?page=${page}&pageSize=100`))
        if (!result.success || result.data.page !== page || result.data.pageSize !== 100) return safeFailure()
        items.push(...result.data.items)
        if (items.length >= result.data.total) return items
        if (result.data.items.length === 0) return safeFailure()
      }
    },
    async getById(employeeId) {
      let body: unknown
      try {
        body = await request(`${baseUrl}/${encodeURIComponent(employeeId)}`)
      } catch (error) {
        if (error instanceof EmployeeRepositoryError && error.code === 'EMPLOYEE_NOT_FOUND') return null
        throw error
      }
      const result = employeeDetailSchema.safeParse(body)
      if (!result.success) return safeFailure()
      return result.data
    },
    async update(employeeId, input) {
      let parsedInput
      try {
        parsedInput = employeeUpdateInputSchema.parse(input)
      } catch {
        return safeFailure()
      }
      const result = employeeDetailSchema.safeParse(await request(`${baseUrl}/${encodeURIComponent(employeeId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsedInput),
      }))
      if (!result.success) return safeFailure()
      return result.data
    },
  }
}
