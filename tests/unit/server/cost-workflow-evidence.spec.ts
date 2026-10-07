import { describe, expect, it, vi } from 'vitest'
import { CostWorkflowEvidenceService } from '../../../server/features/costs/workflow/cost-workflow-evidence.service'
const id='c1f50000-0000-4000-8000-000000000001'
const other='c1f50000-0000-4000-8000-000000000002'
const context={actorId:id,tenantId:id,companyId:id,requestId:id,permissions:['cost.request.submit','cost.prepare','cost.request.read','cost.request.file.read'] as const}
const intent={originalFilename:'quotation.pdf',mimeType:'application/pdf',sizeBytes:12,sha256:'a'.repeat(64),target:{kind:'request'}}
function repo(){return {listRecoverableQuotations:vi.fn(async()=>[]),createIntent:vi.fn(async()=>({evidenceFileId:id})),finalize:vi.fn(),linkRequestEvidence:vi.fn(),createReadUrl:vi.fn(async()=>({url:'https://example.invalid/file'})),listWorkflowParties:vi.fn(async()=>[])}}
describe('scoped workflow evidence boundary',()=>{
 it('permits staged quotation upload only with accountant and existing integrity capability',async()=>{const r=repo();const s=new CostWorkflowEvidenceService(r);await s.createIntent(context,id,intent,id);expect(r.createIntent).toHaveBeenCalledWith(context,id,intent,id)})
 it('does not reuse old viewer permission for preapproval files',async()=>{const r=repo();await expect(new CostWorkflowEvidenceService(r).createReadUrl({...context,permissions:['cost.read','cost.file.read']},id,id,{disposition:'inline'})).rejects.toMatchObject({statusCode:403});expect(r.createReadUrl).not.toHaveBeenCalled()})
 it('delegates current assignment/file scope enforcement to a fresh user-bound repository read',async()=>{const r=repo();r.createReadUrl.mockRejectedValueOnce(Object.assign(new Error('revoked'),{statusCode:403}));await expect(new CostWorkflowEvidenceService(r).createReadUrl(context,other,id,{})).rejects.toMatchObject({statusCode:403});expect(r.createReadUrl).toHaveBeenCalledWith(context,other,id,{disposition:'inline'})})
 it.each([[],[id,id]])('rejects empty or repeated original evidence identities',async files=>{const r=repo();await expect(new CostWorkflowEvidenceService(r).linkRequestEvidence(context,id,other,{expectedVersion:0,evidenceFileIds:files},id)).rejects.toMatchObject({statusCode:400});expect(r.linkRequestEvidence).not.toHaveBeenCalled()})
 it('rejects caller-controlled actor and tenant fields',async()=>{const r=repo();await expect(new CostWorkflowEvidenceService(r).createIntent(context,id,{...intent,actorId:other},id)).rejects.toMatchObject({statusCode:400});expect(r.createIntent).not.toHaveBeenCalled()})
 it('requires an existing installment/adjustment identity for settlement evidence',async()=>{const r=repo();await expect(new CostWorkflowEvidenceService(r).createIntent(context,id,{...intent,target:{kind:'payment'}},id)).rejects.toMatchObject({statusCode:400})})
 it('never accepts project/tenant from a link payload',async()=>{const r=repo();await expect(new CostWorkflowEvidenceService(r).linkRequestEvidence(context,id,other,{expectedVersion:0,evidenceFileIds:[id],projectId:other},id)).rejects.toMatchObject({statusCode:400})})
 it('party lookup needs only its narrow read capability',async()=>{const r=repo();await new CostWorkflowEvidenceService(r).listWorkflowParties({...context,permissions:['cost.party.read']},id);expect(r.listWorkflowParties).toHaveBeenCalledWith({...context,permissions:['cost.party.read']},id)})
})
