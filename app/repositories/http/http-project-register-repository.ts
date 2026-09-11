import { z } from 'zod'
import {
  createProjectRegisterInputSchema, projectRegisterSchema, updateProjectRegisterInputSchema,
  type CreateProjectRegisterInput, type ProjectRegister, type UpdateProjectRegisterInput,
} from '../../../shared/schemas/costs/master-data'
import { ClientError } from '../../errors/client-error'
import type { AuthenticatedHttpClient } from './authenticated-http-client'

export interface HttpProjectRegisterRepository { list(): Promise<ProjectRegister[]>; getById(id: string): Promise<ProjectRegister | null>; create(input: CreateProjectRegisterInput): Promise<ProjectRegister>; update(id: string, input: UpdateProjectRegisterInput): Promise<ProjectRegister> }
export function createHttpProjectRegisterRepository(options: { companyId: string | (() => string); client: AuthenticatedHttpClient }): HttpProjectRegisterRepository {
  const base = () => `/api/companies/${encodeURIComponent(typeof options.companyId === 'function' ? options.companyId() : options.companyId)}/projects`
  const id = (value: string) => encodeURIComponent(value)
  return {
    list: () => options.client.request({ url: base(), method: 'GET', schema: z.array(projectRegisterSchema) }),
    async getById(projectId) { try { return await options.client.request({ url: `${base()}/${id(projectId)}`, method: 'GET', schema: projectRegisterSchema }) } catch (error) { if (error instanceof ClientError && error.code === 'OPPORTUNITY_NOT_FOUND') return null; throw error } },
    create: input => options.client.request({ url: base(), method: 'POST', body: createProjectRegisterInputSchema.parse(input), schema: projectRegisterSchema }),
    update: (projectId, input) => options.client.request({ url: `${base()}/${id(projectId)}`, method: 'PATCH', body: updateProjectRegisterInputSchema.parse(input), schema: projectRegisterSchema }),
  }
}
