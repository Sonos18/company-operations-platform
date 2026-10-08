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

const orderInput = {
  approvedRevisionId: ids.proposalRevision,
  supplierId: ids.supplier,
  currencyCode: 'VND' as const,
  unsignedQuotationEvidenceFileId: ids.unsignedQuotation,
  allocations: [{
    proposalLineId: ids.proposalLine,
    quantity: '10.0000',
    unitPrice: '12.5000',
    quotationMaterialName: 'Supplier steel',
    mappingConfirmed: true as const,
  }],
}
const orderView = {
  id: ids.order,
  version: 1,
  orderState: 'active' as const,
  proposalId: ids.proposal,
  approvedRevisionId: ids.proposalRevision,
  supplierId: ids.supplier,
  supplierName: 'Supplier A',
  currencyCode: 'VND' as const,
  allocations: [{
    orderLineId: ids.orderLine,
    ...orderInput.allocations[0],
    materialId: ids.material,
    materialName: 'Steel',
    specification: 'D10',
    unit: 'bag',
  }],
  unsignedQuotationEvidenceFileId: ids.unsignedQuotation,
  contract: null,
  cash: { grossPaid: '0.0000', availableToPay: '0.0000' },
}
const materialEvidence = {
  originalFilename: 'quotation.pdf',
  mimeType: 'application/pdf' as const,
  sizeBytes: 128,
  sha256: 'a'.repeat(64),
  evidenceRole: 'unsigned_quotation' as const,
  target: { kind: 'material_proposal' as const, proposalId: ids.proposal, revisionId: ids.proposalRevision },
}

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

  it('uses exact scoped order and cancellation routes', async () => {
    const commandClient = response({ ...result, resourceId: ids.order })
    const repository = createHttpMaterialProcurementRepository({
      companyId,
      client: commandClient as never,
    })

    await repository.createOrder(ids.project, ids.proposal, orderInput, command)
    await repository.cancelOrder(ids.project, ids.order, {
      expectedOrderVersion: 1,
      reason: 'Supplier unavailable',
    }, command)

    expect(commandClient.request.mock.calls.map(call => call[0])).toEqual([
      expect.objectContaining({
        method: 'POST',
        url: '/api/companies/' + companyId + '/projects/' + ids.project + '/material-procurement/proposals/' + ids.proposal + '/orders',
        body: orderInput,
        idempotencyKey: key,
      }),
      expect.objectContaining({
        method: 'POST',
        url: '/api/companies/' + companyId + '/projects/' + ids.project + '/material-procurement/orders/' + ids.order + '/cancellations',
        body: { expectedOrderVersion: 1, reason: 'Supplier unavailable' },
        idempotencyKey: key,
      }),
    ])

    const list = response([orderView])
    await createHttpMaterialProcurementRepository({ companyId, client: list as never }).listOrders(ids.project)
    expect(list.request).toHaveBeenCalledWith(expect.objectContaining({
      method: 'GET',
      url: '/api/companies/' + companyId + '/projects/' + ids.project + '/material-procurement/orders',
    }))

    const read = response(orderView)
    await createHttpMaterialProcurementRepository({ companyId, client: read as never }).readOrder(ids.project, ids.order)
    expect(read.request).toHaveBeenCalledWith(expect.objectContaining({
      method: 'GET',
      url: '/api/companies/' + companyId + '/projects/' + ids.project + '/material-procurement/orders/' + ids.order,
    }))
  })

  it('uses material PDF evidence routes and leaves the future contract method unavailable', async () => {
    const intent = {
      evidenceFileId: ids.unsignedQuotation,
      version: 0,
      bucketId: 'c1-accounting-evidence',
      objectPath: companyId + '/' + companyId + '/' + ids.project + '/' + ids.unsignedQuotation,
      expiresAt: '2026-10-08T08:15:00.000Z',
      replayed: false,
    }
    const intentClient = response(intent)
    await createHttpMaterialProcurementRepository({ companyId, client: intentClient as never })
      .createEvidenceIntent(ids.project, materialEvidence, command)
    expect(intentClient.request).toHaveBeenCalledWith(expect.objectContaining({
      method: 'POST',
      url: '/api/companies/' + companyId + '/projects/' + ids.project + '/material-procurement/evidence/upload-intents',
      body: materialEvidence,
    }))

    const finalizedClient = response({
      id: ids.unsignedQuotation, status: 'finalized', originalFilename: 'quotation.pdf',
      mimeType: 'application/pdf', sizeBytes: 128, sha256: 'a'.repeat(64), version: 1,
      finalizedAt: '2026-10-08T08:00:00.000Z', replayed: false,
    })
    await createHttpMaterialProcurementRepository({ companyId, client: finalizedClient as never })
      .finalizeEvidence(ids.project, ids.unsignedQuotation, { expectedVersion: 0 }, command)
    expect(finalizedClient.request).toHaveBeenCalledWith(expect.objectContaining({
      method: 'POST',
      url: '/api/companies/' + companyId + '/projects/' + ids.project + '/material-procurement/evidence/' + ids.unsignedQuotation + '/finalize',
    }))

    const readClient = response({ url: 'https://example.invalid/material', expiresAt: '2026-10-08T08:01:00.000Z' })
    await createHttpMaterialProcurementRepository({ companyId, client: readClient as never })
      .readEvidenceUrl(ids.project, ids.unsignedQuotation, { disposition: 'attachment' })
    expect(readClient.request).toHaveBeenCalledWith(expect.objectContaining({
      method: 'POST',
      url: '/api/companies/' + companyId + '/projects/' + ids.project + '/material-procurement/evidence/' + ids.unsignedQuotation + '/read-url',
      body: { disposition: 'attachment' },
    }))

    const client = response(result)
    const repository = createHttpMaterialProcurementRepository({ companyId, client: client as never })
    await expect(repository.recordContract(ids.project, ids.order, {} as never, command))
      .rejects.toThrow('MATERIAL_PROCUREMENT_NOT_IMPLEMENTED: recordContract')
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
