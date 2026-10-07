import { expect, test } from './fixtures/authenticated'
import type { Page, Route } from '@playwright/test'
import { costRequestViewSchema, workflowProjectContextSchema, workflowContractViewSchema } from '../../shared/schemas/costs/cost-workflow'
import { workflowFinanceSchema } from '../../shared/schemas/costs/cost-workflow-reporting'

const project='10000000-0000-4000-8000-000000000101'
const company='10000000-0000-4000-8000-000000000002'
const tenant='10000000-0000-4000-8000-000000000001'
const category='20000000-0000-4000-8000-000000000001'
const party='30000000-0000-4000-8000-000000000001'
const requestId='40000000-0000-4000-8000-000000000001'
const basisId='50000000-0000-4000-8000-000000000001'
const basisVersion='50000000-0000-4000-8000-000000000002'
const installment='60000000-0000-4000-8000-000000000001'
const fileId='70000000-0000-4000-8000-000000000001'
const newFileId='70000000-0000-4000-8000-000000000002'
const manager='11111111-1111-4111-8111-111111111111'
const submittedVersion='80000000-0000-4000-8000-000000000001'
const assignment='90000000-0000-4000-8000-000000000001'
const basis={kind:'materials',deliverySite:'Công trường giả lập',lines:[{description:'Ống nước giả lập',quantity:'3',unit:'m',unitPrice:'10'}]}
const request=costRequestViewSchema.parse({id:requestId,version:1,submittedVersionId:submittedVersion,status:'approved',partyId:party,partyName:'Nhà cung cấp giả lập',partyKind:'organization',crewOwnership:null,categoryId:category,contractVersionId:basisVersion,latestDecision:null,amount:'30',currencyCode:'VND',evidenceFileIds:[fileId],assignmentVersion:1,basis,installment:{id:installment,version:1,authorized:'30',consumed:'10',remaining:'20'},payments:[]})
const contract=workflowContractViewSchema.parse({id:basisId,versionId:basisVersion,partyId:party,reference:'Báo giá giả lập 100',currencyCode:'VND',version:1,cap:'100',evidenceFileIds:[fileId],sourceSubcontractId:null})

const secondProject='10000000-0000-4000-8000-000000000102'
const secondCompany='10000000-0000-4000-8000-000000000202'
const paymentId='71000000-0000-4000-8000-000000000001'
const refundId='72000000-0000-4000-8000-000000000001'
type Call={path:string;method:string;companyId:string;projectId:string;body:Record<string,unknown>;key:string|undefined}
type Options={status?:'submitted'|'returned'|'approved';completed?:boolean;lose?:string;hold?:string;refund?:boolean}
async function installRegression(page:Page,options:Options={}){
 const calls:Call[]=[],external:string[]=[]
 const state={
  current:costRequestViewSchema.parse({...request,status:options.status??'approved',installment:options.status&&options.status!=='approved'?null:request.installment,payments:[{id:paymentId,version:1,amount:'10',refunded:'0',correctedCash:'10',currencyCode:'VND',paymentDate:'2026-10-01',evidenceFileIds:[fileId]}]}),
  refund:{id:refundId,kind:'refund',version:1,submittedVersionId:submittedVersion,status:'approved',partyId:party,contractId:null,sourcePaymentId:paymentId,input:{kind:'refund',requestedAmount:'4',reason:'Hoàn tiền giả lập',evidenceFileIds:[fileId],expectedVersion:1},confirmedRefund:'0',correctionApplied:false,latestDecision:null},
  holds:0,release:()=>{},writes:0,
 }
 const receipts=new Map<string,{body:string;result:Record<string,unknown>}>()
 const evidence=new Map<string,Record<string,unknown>>()
 let uploadSequence=1,held=false,lost=false
 let release:()=>void=()=>{}
 const gate=new Promise<void>(resolve=>{release=resolve})
 state.release=release
 const context=workflowProjectContextSchema.parse({mode:'document_backed_v1',operationalState:options.completed?'completed':'active',manager:{userId:manager,assignmentId:assignment,version:1,reason:'Phân công giả lập'},canSubmit:!options.completed,canDecide:true,canAssign:true,eligibleManagers:[{userId:manager,label:'Quản lý giả lập'}]})
 // The context fallback blocks every external host that a page fixture did not mock.
 await page.context().route('**/*',route=>{
  const url=new URL(route.request().url())
  if(['127.0.0.1','localhost'].includes(url.hostname))return route.continue()
  external.push(url.origin+url.pathname);return route.abort('blockedbyclient')
 })
 await page.route('https://api.iconify.design/**',route=>route.fulfill({json:{prefix:'lucide',icons:{}}}))
 await page.route('https://auth.taskovia.test/storage/v1/**',route=>route.fulfill({json:{Key:'synthetic',Id:newFileId},headers:{'Access-Control-Allow-Origin':'*'}}))
 await page.route(/\/api\/companies\/[^/]+\/cost-workflow\/projects(?:\?.*)?$/,route=>route.fulfill({json:{mode:'document_backed_v1',projects:[project,secondProject].map((projectId,i)=>({projectId,code:'SYNTHETIC-'+i,name:i?'Dự án thứ hai':'Dự án giả lập',operationalState:context.operationalState})),nextCursor:null}}))
 await page.route(/\/api\/companies\/[^/]+\/projects\/[^/]+\/cost-workflow(?:\/.*)?$/,async(route:Route)=>{
  const req=route.request(),url=new URL(req.url()),parts=url.pathname.split('/')
  const path=url.pathname.split('/cost-workflow')[1]??'',scope={companyId:parts[3]!,projectId:parts[5]!}
  const staleScope=scope.projectId===secondProject||scope.companyId===secondCompany
  if(req.method()==='GET'){
   const current=staleScope?{...state.current,partyName:'Đối tác ngữ cảnh thứ hai'}:state.current
   const refunded=Number(state.refund.confirmedRefund),consumed=Number(state.current.installment?.consumed??'10')
   const summary={grossPaid:consumed.toFixed(4),confirmedRefunds:refunded.toFixed(4),netCash:(consumed-refunded).toFixed(4),approvedUnspent:Number(state.current.installment?.remaining??'0').toFixed(4),coverage:'partial',unreconciledCount:0}
   const cash=workflowFinanceSchema.parse({schemaVersion:2,project:{projectId:scope.projectId,projectCode:'SYNTHETIC',projectName:'Dự án giả lập',currencyCode:'VND',moneyScale:0,timeZone:'Asia/Ho_Chi_Minh',operationalState:context.operationalState},workflowCash:summary,categories:[{categoryId:category,code:'materials',name:'Vật tư',displayOrder:1,workflowCash:summary,retention:{state:'not_recorded',amount:null,recordedCount:0}}]})
   const values:Record<string,unknown>={'/context':context,'/cash':cash,'/parties':[{id:party,name:'Nhà cung cấp giả lập',kind:'organization',crewOwnership:null}],'/contracts':[contract],'/requests':[current],['/requests/'+requestId]:current,['/requests/'+requestId+'/history']:[], '/adjustments':options.refund?[state.refund]:[]}
   if(!(path in values))throw new Error('Unexpected GET '+path)
   const value=JSON.parse(JSON.stringify(values[path]))
   if(!held&&options.hold==='GET:'+path&&!staleScope){held=true;state.holds++;await gate}
   return route.fulfill({json:value}).catch(()=>{})
  }
  const body=req.postDataJSON() as Record<string,unknown>,key=req.headers()['idempotency-key']
  calls.push({path,method:req.method(),...scope,body,key})
  if(!held&&options.hold===path){held=true;state.holds++;await gate}
  const cached=key?receipts.get(key):undefined
  if(cached){expect(JSON.stringify(body)).toBe(cached.body);return route.fulfill({json:cached.result}).catch(()=>{})}
  let result:Record<string,unknown>
  if(path==='/evidence/upload-intents'){
   uploadSequence++
   const id='70000000-0000-4000-8000-'+String(uploadSequence).padStart(12,'0')
   evidence.set(id,{id,status:'finalized',originalFilename:body.originalFilename,mimeType:body.mimeType,sizeBytes:body.sizeBytes,sha256:body.sha256,version:1,finalizedAt:'2026-10-05T00:00:00.000Z',replayed:false})
   result={evidenceFileId:id,version:0,bucketId:'c1-accounting-evidence',objectPath:[tenant,scope.companyId,scope.projectId,id].join('/'),expiresAt:new Date(Date.now()+60000).toISOString(),replayed:false}
  }else if(path.endsWith('/finalize'))result=evidence.get(path.split('/')[2]!)!
  else if(path.endsWith('/read-url'))result={url:'https://original.taskovia.test/synthetic',expiresAt:new Date(Date.now()+60000).toISOString()}
  else if(path==='/requests/'+requestId+'/decisions'){
   state.current=costRequestViewSchema.parse({...state.current,status:body.decision==='return'?'returned':'approved',version:state.current.version+1,latestDecision:{id:refundId,submittedVersionId:submittedVersion,decision:body.decision,reason:body.reason??null,assignmentId:assignment,decidedBy:manager,decidedAt:'2026-10-05T00:00:00.000Z'}})
   result={requestId,version:state.current.version,replayed:false};state.writes++
  }else if(path==='/requests/'+requestId&&req.method()==='PATCH'){
   const {expectedVersion:_expected,...input}=body
   state.current=costRequestViewSchema.parse({...state.current,...input,version:state.current.version+1})
   result={requestId,version:state.current.version,replayed:false};state.writes++
  }else if(path==='/requests/'+requestId+'/submit'){
   state.current=costRequestViewSchema.parse({...state.current,status:'submitted',version:state.current.version+1})
   result={requestId,version:state.current.version,replayed:false};state.writes++
  }else if(path==='/installments/'+installment+'/payments'){
   const next=state.current.installment!,amount=Number(body.amount),consumed=Number(next.consumed)+amount
   state.current=costRequestViewSchema.parse({...state.current,installment:{...next,version:next.version+1,consumed:String(consumed),remaining:String(Number(next.authorized)-consumed)},payments:[...state.current.payments,{id:'71000000-0000-4000-8000-'+String(state.current.payments.length+1).padStart(12,'0'),version:1,amount:body.amount,refunded:'0',correctedCash:body.amount,currencyCode:'VND',paymentDate:body.paymentDate,evidenceFileIds:body.evidenceFileIds}]})
   result={paymentId,version:next.version+1,replayed:false};state.writes++
  }else if(path==='/adjustments/'+refundId+'/confirm-refund'){
   state.refund={...state.refund,confirmedRefund:String(Number(state.refund.confirmedRefund)+Number(body.amount)),version:state.refund.version+1}
   result={adjustmentId:refundId,version:state.refund.version,replayed:false};state.writes++
  }else throw new Error('Unexpected mutation '+path)
  if(key)receipts.set(key,{body:JSON.stringify(body),result})
  if(!lost&&options.lose===path){lost=true;return route.fulfill({status:500,json:{code:'SYNTHETIC_RESPONSE_LOST',message:'Giả lập mất phản hồi sau commit'}})}
  return route.fulfill({json:result}).catch(()=>{})
 })
 return {state,calls,external}
}

const detail='/costs/'+project+'/requests/'+requestId
type Kind='installment'|'contract_adjustment'|'refund'|'correction'
const kinds:Kind[]=['installment','contract_adjustment','refund','correction']
const labels={installment:'Chi tiết Đề nghị khoản chi',contract_adjustment:'Chi tiết Điều chỉnh hạn mức',refund:'Chi tiết Đề nghị hoàn tiền',correction:'Chi tiết Hiệu chỉnh tiền chi'}
const decision={id:refundId,submittedVersionId:submittedVersion,decision:'approve',reason:null,assignmentId:assignment,decidedBy:manager,decidedAt:'2026-10-05T00:00:00.000Z'}
async function installDetail(page:Page,kind:Kind,options:{mismatch?:boolean;historyMismatch?:boolean}={}){
 const base=await installRegression(page)
 const reads:string[]=[]
 const snapshotInput=kind==='installment'?{partyId:party,partyKind:'organization',categoryId:category,amount:'30',currencyCode:'VND',basis,evidenceFileIds:[fileId]}:kind==='contract_adjustment'?{expectedVersion:1,proposedCap:'40',reason:'Lý do phiên đã duyệt',evidenceFileIds:[fileId]}:kind==='refund'?{kind,expectedVersion:1,requestedAmount:'4',reason:'Lý do phiên đã duyệt',evidenceFileIds:[fileId]}:{kind,expectedVersion:1,correctedOutgoing:'8',reason:'Lý do phiên đã duyệt',evidenceFileIds:[fileId]}
 const h=[{id:options.historyMismatch?newFileId:submittedVersion,version:1,input:snapshotInput,evidenceFileIds:[fileId],assignmentId:assignment,submittedBy:manager,submittedAt:'2026-10-05T00:00:00.000Z',decision}]
 await page.route('**/cost-workflow/requests/'+requestId+'/history',route=>{reads.push('history');return route.fulfill({json:h})})
 await page.route('**/cost-workflow/requests/'+requestId,route=>{reads.push('request');return route.fulfill({json:{...request,amount:'99',basis:{...basis,deliverySite:'Nội dung đang sửa'},evidenceFileIds:[newFileId],submittedVersionId:options.mismatch?newFileId:submittedVersion,latestDecision:decision}})})
 await page.route('**/cost-workflow/adjustments/'+requestId,route=>{
  reads.push('adjustment')
  return route.fulfill({json:{...base.state.refund,id:options.mismatch?refundId:requestId,kind,input:kind==='contract_adjustment'?{...snapshotInput,proposedCap:'99',reason:'Nội dung đang sửa',evidenceFileIds:[newFileId]}:kind==='refund'?{...snapshotInput,requestedAmount:'99',reason:'Nội dung đang sửa',evidenceFileIds:[newFileId]}:{...snapshotInput,correctedOutgoing:'99',reason:'Nội dung đang sửa',evidenceFileIds:[newFileId]},latestDecision:decision}})
 })
 return {...base,reads}
}
for(const kind of kinds){
 test('notification opens exact '+kind+' submitted snapshot',async({page})=>{
  const mock=await installDetail(page,kind)
  await page.route('**/api/companies/'+company+'/cost-notifications',route=>route.fulfill({json:[{id:newFileId,projectId:project,requestId,submittedVersionId:submittedVersion,kind,decisionId:refundId,recipientId:manager,deliveryState:'available',readAt:null,createdAt:'2026-10-05T00:00:00.000Z'}]}))
  await page.goto(detail+'?kind='+kind+'&submittedVersionId='+submittedVersion)
  await expect(page.getByRole('heading',{name:labels[kind],exact:true}).first()).toBeVisible()
  if(kind==='installment'){
   await expect(page.getByText('30 VND',{exact:true})).toBeVisible()
   await expect(page.getByText('Nội dung đang sửa',{exact:false})).toHaveCount(0)
  }
  if(kind!=='installment'){
   await expect(page.getByText('Lý do: Lý do phiên đã duyệt',{exact:true})).toBeVisible()
   await expect(page.getByText('Nội dung đang sửa',{exact:false})).toHaveCount(0)
   await expect(page.getByRole('button',{name:'Ghi nhận thanh toán',exact:true})).toHaveCount(0)
   await expect(page.getByRole('button',{name:'Phê duyệt',exact:true})).toHaveCount(0)
  }
  await page.getByRole('button',{name:'Thông báo phê duyệt khoản chi',exact:true}).click()
  const link=page.getByRole('link',{name:'Xem hồ sơ đã duyệt',exact:true})
  await expect(link).toBeVisible()
  const href=await link.getAttribute('href'),url=new URL(href!,'http://localhost')
  expect(url.pathname).toBe(detail);expect(url.searchParams.get('kind')).toBe(kind);expect(url.searchParams.get('submittedVersionId')).toBe(submittedVersion)
  expect(mock.calls).toEqual([]);expect(mock.external).toEqual([])
 })
}
for(const query of ['kind=bogus','kind=refund&kind=correction','kind=','submittedVersionId=','submittedVersionId','submittedVersionId='+submittedVersion+'&submittedVersionId='+newFileId]){
 test('malformed notification query blocks reads '+query,async({page})=>{
  const mock=await installDetail(page,'refund')
  await page.goto(detail+'?'+query)
  await expect(page.getByText('Mã yêu cầu hoặc phiên không hợp lệ.',{exact:true})).toBeVisible()
  expect(mock.reads).toEqual([]);expect(mock.calls).toEqual([])
 })
}
for(const kind of kinds){
 test('mismatched '+kind+' notification remains unavailable',async({page})=>{
  const mock=await installDetail(page,kind,kind==='installment'?{mismatch:true}:{historyMismatch:true})
  await page.goto(detail+'?kind='+kind+'&submittedVersionId='+submittedVersion)
  await expect(page.getByText('Không tìm thấy đúng hồ sơ và phiên đã gửi trong liên kết.',{exact:true})).toBeVisible()
  await expect(page.getByRole('button',{name:'Ghi nhận thanh toán',exact:true})).toHaveCount(0)
  await expect(page.locator('[data-testid=cost-adjustment-detail]')).toHaveCount(0)
  expect(mock.calls).toEqual([])
 })
}
test('query navigation clears a loaded adjustment before another kind loads',async({page})=>{
 const mock=await installDetail(page,'refund')
 await page.route('**/api/companies/'+company+'/cost-notifications',route=>route.fulfill({json:[{id:newFileId,projectId:project,requestId,submittedVersionId:newFileId,kind:'correction',decisionId:refundId,recipientId:manager,deliveryState:'available',readAt:'2026-10-05T00:00:00.000Z',createdAt:'2026-10-05T00:00:00.000Z'}]}))
 await page.goto(detail+'?kind=refund&submittedVersionId='+submittedVersion)
 await expect(page.getByText('Lý do: Lý do phiên đã duyệt',{exact:true})).toBeVisible()
 await page.getByRole('button',{name:'Thông báo phê duyệt khoản chi',exact:true}).click()
 await page.getByRole('link',{name:'Xem hồ sơ đã duyệt',exact:true}).click()
 await expect(page).toHaveURL(new RegExp('kind=correction'))
 await expect(page.getByText('Không tìm thấy đúng hồ sơ và phiên đã gửi trong liên kết.',{exact:true})).toBeVisible()
 await expect(page.locator('[data-testid=cost-adjustment-detail]')).toHaveCount(0)
 expect(mock.calls).toEqual([])
})

test('delayed old history cannot restore a snapshot after query-only navigation',async({page})=>{
 const mock=await installDetail(page,'refund')
 let release=()=>{},held=false
 const gate=new Promise<void>(resolve=>{release=resolve})
 await page.route('**/cost-workflow/requests/'+requestId+'/history',async route=>{
  if(!held){held=true;await gate}
  await route.fallback().catch(()=>{})
 })
 await page.route('**/api/companies/'+company+'/cost-notifications',route=>route.fulfill({json:[{id:newFileId,projectId:project,requestId,submittedVersionId:newFileId,kind:'refund',decisionId:refundId,recipientId:manager,deliveryState:'available',readAt:'2026-10-05T00:00:00.000Z',createdAt:'2026-10-05T00:00:00.000Z'}]}))
 await page.goto(detail+'?kind=refund&submittedVersionId='+submittedVersion)
 await expect.poll(()=>held).toBe(true)
 await page.getByRole('button',{name:'Thông báo phê duyệt khoản chi',exact:true}).click()
 await page.getByRole('link',{name:'Xem hồ sơ đã duyệt',exact:true}).click()
 await expect(page.getByText('Không tìm thấy đúng hồ sơ và phiên đã gửi trong liên kết.',{exact:true})).toBeVisible()
 release()
 await page.waitForLoadState('networkidle')
 await expect(page.locator('[data-testid=cost-adjustment-detail]')).toHaveCount(0)
 expect(mock.calls).toEqual([])
})
