import { describe, expect, it, vi } from 'vitest'
import { ClientError } from '../../../app/errors/client-error'
import { createAuthenticatedHttpClient } from '../../../app/repositories/http/authenticated-http-client'
import { createHttpMaterialProcurementRepository } from '../../../app/repositories/http/http-material-procurement-repository'
import { ids, validProposal } from '../material-procurement/fixtures'

const companyId = '20000000-0000-4000-8000-000000000001'
const otherCompanyId = '20000000-0000-4000-8000-000000000002'
const key = '20000000-0000-4000-8000-000000000003'
const command = { idempotencyKey: key }
const result = {
  resourceId: ids.proposal,
  version: 2,
  replayed: true,
  reviewState: 'submitted',
}

const proposalInput = {
  ...validProposal,
  lines: validProposal.lines.map(line => ({ ...line })),
}

const returnedProposal = {
  id: ids.proposal,
  version: 4,
  reviewState: 'returned',
  returnReason: 'Recheck specification',
  approvedRevisionId: null,
  projectId: ids.project,
  createdBy: ids.user,
  neededOn: proposalInput.neededOn,
  deliveryAddress: proposalInput.deliveryAddress,
  notes: proposalInput.notes,
  lines: [{
    ...proposalInput.lines[0]!,
    materialName: 'Cement',
    specification: 'PCB40',
    unit: 'bag',
    allocatedQuantity: '0.0000',
    signedQuantity: '0.0000',
    remainingQuantity: '20.0000',
  }],
  orderProgress: { orderCount: 0, signedOrderCount: 0 },
}

const missingReturnReason = { ...returnedProposal } as Record<string, unknown>
delete missingReturnReason.returnReason

function response(data: unknown) {
  return {
    request: vi.fn(async ({ schema }: { schema: { parse(value: unknown): unknown } }) => schema.parse(data)),
  }
}

describe('material procurement HTTP repository', () => {
  it('captures the active company for each project-scoped request', async () => {
    const activeCompany = vi.fn().mockReturnValue(companyId)
    const client = response([])
    const repository = createHttpMaterialProcurementRepository({
      companyId: activeCompany,
      client: client as never,
    })

    await repository.listProposals(ids.project)
    expect(client.request).toHaveBeenLastCalledWith(expect.objectContaining({
      method: 'GET',
      url: '/api/companies/' + companyId + '/projects/' + ids.project + '/material-procurement/proposals',
    }))

    activeCompany.mockReturnValue(otherCompanyId)
    await repository.listProposals(ids.project)
    expect(client.request).toHaveBeenLastCalledWith(expect.objectContaining({
      url: '/api/companies/' + otherCompanyId + '/projects/' + ids.project + '/material-procurement/proposals',
    }))
  })

  it('propagates return reasons through valid HTTP list and read responses', async () => {
    const listRepository = createHttpMaterialProcurementRepository({
      companyId,
      client: response([returnedProposal]) as never,
    })
    await expect(listRepository.listProposals(ids.project)).resolves.toEqual([
      expect.objectContaining({
        reviewState: 'returned',
        returnReason: 'Recheck specification',
      }),
    ])

    const readRepository = createHttpMaterialProcurementRepository({
      companyId,
      client: response(returnedProposal) as never,
    })
    await expect(readRepository.readProposal(ids.project, ids.proposal))
      .resolves.toMatchObject({
        reviewState: 'returned',
        returnReason: 'Recheck specification',
      })
  })

  it.each([
    ['missing returnReason', missingReturnReason],
    ['returned with null reason', { ...returnedProposal, returnReason: null }],
    ['draft with stale reason', { ...returnedProposal, reviewState: 'draft' }],
    ['submitted with stale reason', { ...returnedProposal, reviewState: 'submitted' }],
    ['approved with stale reason', { ...returnedProposal, reviewState: 'approved' }],
  ] as const)('maps malformed HTTP success payload: %s', async (_case, payload) => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))
    const client = createAuthenticatedHttpClient({
      getAccessToken: () => 'synthetic-session-token',
      fetch,
    })
    const repository = createHttpMaterialProcurementRepository({ companyId, client })
    const request = repository.readProposal(ids.project, ids.proposal)

    await expect(request).rejects.toBeInstanceOf(ClientError)
    await expect(request).rejects.toMatchObject({
      code: 'MALFORMED_RESPONSE',
    })
    expect(fetch).toHaveBeenCalledOnce()
  })

  it('does not issue a request without valid company and resource scope', async () => {
    const client = response([])
    const missing = createHttpMaterialProcurementRepository({
      companyId: () => null,
      client: client as never,
    })
    await expect(missing.listMaterials()).rejects.toThrow('ACTIVE_COMPANY_REQUIRED')

    const repository = createHttpMaterialProcurementRepository({
      companyId,
      client: client as never,
    })
    await expect(repository.readProposal('../other-project', ids.proposal)).rejects.toThrow()
    expect(client.request).not.toHaveBeenCalled()
  })

  it('uses strict proposal routes, bodies, and UUID idempotency keys', async () => {
    const client = response(result)
    const repository = createHttpMaterialProcurementRepository({
      companyId,
      client: client as never,
    })

    await repository.updateProposal(
      ids.project,
      ids.proposal,
      { ...proposalInput, expectedVersion: 1 },
      command,
    )
    await repository.submitProposal(ids.project, ids.proposal, { expectedVersion: 2 }, command)
    await repository.decideProposal(
      ids.project,
      ids.proposal,
      { expectedVersion: 2, decision: 'return', reason: 'Revise quantity' },
      command,
    )

    expect(client.request.mock.calls.map(call => call[0])).toEqual([
      expect.objectContaining({
        method: 'PATCH',
        url: '/api/companies/' + companyId + '/projects/' + ids.project + '/material-procurement/proposals/' + ids.proposal,
        body: { ...proposalInput, expectedVersion: 1 },
        idempotencyKey: key,
      }),
      expect.objectContaining({
        method: 'POST',
        url: '/api/companies/' + companyId + '/projects/' + ids.project + '/material-procurement/proposals/' + ids.proposal + '/submit',
        body: { expectedVersion: 2 },
        idempotencyKey: key,
      }),
      expect.objectContaining({
        method: 'POST',
        url: '/api/companies/' + companyId + '/projects/' + ids.project + '/material-procurement/proposals/' + ids.proposal + '/decisions',
        body: { expectedVersion: 2, decision: 'return', reason: 'Revise quantity' },
        idempotencyKey: key,
      }),
    ])
  })

  it('rejects browser-supplied authority and financial proposal fields before transport', async () => {
    const client = response(result)
    const repository = createHttpMaterialProcurementRepository({
      companyId,
      client: client as never,
    })

    await expect(repository.createProposal(ids.project, {
      ...proposalInput,
      actorId: ids.user,
      supplierId: ids.supplier,
      lines: [{ ...proposalInput.lines[0]!, unitPrice: '12.5000' }],
    } as never, command)).rejects.toThrow()
    expect(client.request).not.toHaveBeenCalled()
  })

  it('resolves only an already chosen organization through the supplier-record route', async () => {
    const client = response({ ...result, resourceId: ids.supplier })
    const repository = createHttpMaterialProcurementRepository({
      companyId,
      client: client as never,
    })
    const supplier = {
      code: 'NCC-001',
      displayName: 'Supplier A',
      partyKind: 'organization' as const,
      supplierAlreadyChosen: true as const,
    }

    await repository.resolveSupplier(supplier, command)
    expect(client.request).toHaveBeenCalledWith(expect.objectContaining({
      method: 'POST',
      url: '/api/companies/' + companyId + '/material-procurement/suppliers/resolve',
      body: supplier,
      idempotencyKey: key,
    }))
  })

  it('keeps future order, contract, and evidence methods explicitly unavailable', async () => {
    const client = response(result)
    const repository = createHttpMaterialProcurementRepository({
      companyId,
      client: client as never,
    })

    await expect(repository.createOrder(ids.project, ids.proposal, {} as never, command))
      .rejects.toThrow('MATERIAL_PROCUREMENT_NOT_IMPLEMENTED: createOrder')
    await expect(repository.recordContract(ids.project, ids.order, {} as never, command))
      .rejects.toThrow('MATERIAL_PROCUREMENT_NOT_IMPLEMENTED: recordContract')
    await expect(repository.createEvidenceIntent(ids.project, {} as never, command))
      .rejects.toThrow('MATERIAL_PROCUREMENT_NOT_IMPLEMENTED: createEvidenceIntent')
    expect(client.request).not.toHaveBeenCalled()
  })

  it('preserves stale-version conflicts from the authenticated HTTP boundary', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: {
        code: 'VERSION_CONFLICT',
        message: 'Synthetic stale version',
        requestId: key,
        details: {},
      },
    }), { status: 409, headers: { 'Content-Type': 'application/json' } }))
    const client = createAuthenticatedHttpClient({
      getAccessToken: () => 'synthetic-session-token',
      fetch,
    })
    const repository = createHttpMaterialProcurementRepository({ companyId, client })

    await expect(repository.submitProposal(
      ids.project,
      ids.proposal,
      { expectedVersion: 1 },
      command,
    )).rejects.toMatchObject({ code: 'VERSION_CONFLICT' })
    expect(fetch.mock.calls[0]?.[1]?.headers).toMatchObject({ 'Idempotency-Key': key })
  })
})
