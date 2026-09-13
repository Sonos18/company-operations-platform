import { z } from 'zod'
import { accountingSourceSchema, accountingSourceVersionSchema, createAccountingSourceInputSchema, createAccountingSourceVersionInputSchema, createSourceSelectionInputSchema, idempotencyInputSchema, sourceSelectionSchema, updateAccountingSourceInputSchema, type AccountingSource, type AccountingSourceVersion, type CreateAccountingSourceInput, type CreateAccountingSourceVersionInput, type CreateSourceSelectionInput, type SourceSelection, type UpdateAccountingSourceInput } from '../../../shared/schemas/costs/sources'
import { ClientError } from '../../errors/client-error'
import type { AuthenticatedHttpClient } from './authenticated-http-client'

export interface HttpAccountingSourceRepository { list(): Promise<AccountingSource[]>; getById(id: string): Promise<AccountingSource | null>; create(input: CreateAccountingSourceInput): Promise<AccountingSource>; update(id: string, input: UpdateAccountingSourceInput): Promise<AccountingSource>; createVersion(sourceId: string, input: CreateAccountingSourceVersionInput): Promise<AccountingSourceVersion>; shareVersion(versionId: string, idempotencyKey: string): Promise<AccountingSourceVersion>; createSelection(versionId: string, input: CreateSourceSelectionInput): Promise<SourceSelection> }
export function createHttpAccountingSourceRepository(options: { companyId: string | (() => string); client: AuthenticatedHttpClient }): HttpAccountingSourceRepository {
  const companyId = () => typeof options.companyId === 'function' ? options.companyId() : options.companyId
  const base = () => `/api/companies/${encodeURIComponent(companyId())}/accounting-sources`
  const source = (id: string) => `${base()}/${encodeURIComponent(id)}`
  return {
    list: () => options.client.request({ url: base(), method: 'GET', schema: z.array(accountingSourceSchema) }),
    async getById(id) { try { return await options.client.request({ url: source(id), method: 'GET', schema: accountingSourceSchema }) } catch (error) { if (error instanceof ClientError && error.code === 'RESOURCE_NOT_FOUND') return null; throw error } },
    create: input => options.client.request({ url: base(), method: 'POST', body: createAccountingSourceInputSchema.parse(input), schema: accountingSourceSchema }),
    update: (id, input) => options.client.request({ url: source(id), method: 'PATCH', body: updateAccountingSourceInputSchema.parse(input), schema: accountingSourceSchema }),
    createVersion: (sourceId, input) => options.client.request({ url: `${source(sourceId)}/versions`, method: 'POST', body: createAccountingSourceVersionInputSchema.parse(input), schema: accountingSourceVersionSchema }),
    shareVersion: (versionId, idempotencyKey) => options.client.request({ url: `/api/companies/${encodeURIComponent(companyId())}/accounting-source-versions/${encodeURIComponent(versionId)}/share`, method: 'POST', body: idempotencyInputSchema.parse({ idempotencyKey }), schema: accountingSourceVersionSchema }),
    createSelection: (versionId, input) => options.client.request({ url: `/api/companies/${encodeURIComponent(companyId())}/accounting-source-versions/${encodeURIComponent(versionId)}/selections`, method: 'POST', body: createSourceSelectionInputSchema.parse(input), schema: sourceSelectionSchema }),
  }
}
