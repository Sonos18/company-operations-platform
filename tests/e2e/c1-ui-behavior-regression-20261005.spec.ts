import { expect, test } from './fixtures/authenticated'
import type { Page, Route } from '@playwright/test'
import { createCompany } from './fixtures/auth-routes'
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
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1eQAAAAASUVORK5CYII=','base64')
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
const list='/costs/'+project+'/requests'
async function uploadProof(page:Page,panel=page.locator('.cost-workflow-original-upload').filter({visible:true})){
 await panel.locator('input[type=file]').setInputFiles({name:'synthetic.png',mimeType:'image/png',buffer:png})
 await panel.getByRole('button',{name:'Tải lên hồ sơ gốc',exact:true}).click()
 await expect(panel.getByText('Đang tải lên và hoàn tất hồ sơ...')).toHaveCount(0)
}
async function preparePayment(page:Page,amount='5'){
 await page.getByRole('button',{name:'Ghi nhận thanh toán',exact:true}).click()
 const panel=page.locator('.payment-modal')
 await panel.getByLabel(/^Số tiền thanh toán/).fill(amount)
 await panel.getByLabel(/^Mã \/ Số tham chiếu/).fill('SYNTHETIC-INSTALLMENT')
 await uploadProof(page)
 await expect(panel.locator('.proof-tag').getByText('synthetic.png',{exact:false})).toBeVisible()
 return panel
}
async function switchCompany(page:Page){
 await page.getByTestId('app-sidebar').getByRole('button',{name:'Mở menu tài khoản'}).click()
 await page.getByRole('combobox',{name:'Chuyển công ty'}).selectOption(secondCompany)
 await page.keyboard.press('Escape')
 await expect(page).toHaveURL(/\/projects$/)
 await page.getByTestId('app-sidebar').locator('a[href="/costs"]').click()
 await page.locator('a[href="/costs/'+project+'/requests"]').click()
 await page.getByRole('link',{name:'Chi tiết',exact:true}).click()
}
test('manager return requires reason; accountant edits, re-reviews and resubmits retained evidence',async({page})=>{
 const mock=await installRegression(page,{status:'submitted'})
 await page.goto(detail)
 await page.getByRole('button',{name:'Trả lại',exact:true}).click()
 await expect(page.getByText('Cần nhập lý do trả lại.',{exact:true})).toBeVisible()
 expect(mock.calls).toHaveLength(0)
 await page.getByPlaceholder('Lý do (bắt buộc khi trả lại)',{exact:true}).fill('Sửa số lượng giả lập')
 await page.getByRole('button',{name:'Trả lại',exact:true}).click()
 const form=page.locator('.cost-request-panel')
 await expect(form).toBeVisible()
 await expect(form.getByText('Hồ sơ chứng từ gốc (1):',{exact:true})).toBeVisible()
 await expect(form.getByRole('checkbox')).not.toBeChecked()
 await form.getByLabel(/^Số tiền/).fill('35')
 await form.getByPlaceholder('SL',{exact:true}).fill('3.5')
 await form.getByRole('checkbox').check()
 await form.getByLabel(/^Ghi chú VAT/).fill('Đã rà soát VAT giả lập')
 await expect(form.getByRole('checkbox')).not.toBeChecked()
 await expect(form.getByRole('button',{name:'Gửi duyệt khoản chi',exact:true})).toBeDisabled()
 await form.getByRole('checkbox').check()
 await form.getByRole('button',{name:'Gửi duyệt khoản chi',exact:true}).click()
 await expect(page.getByText('Chờ duyệt',{exact:true})).toBeVisible()
 const update=mock.calls.find(c=>c.method==='PATCH')
 expect(update?.body).toMatchObject({amount:'35',expectedVersion:2,evidenceFileIds:[fileId],accountingBasis:{vatBasis:'Đã rà soát VAT giả lập'}})
 expect(mock.calls.find(c=>c.path.endsWith('/submit'))?.body).toEqual({expectedVersion:3})
 expect(mock.state.writes).toBe(3)
 expect(mock.external).toEqual([])
})
test('returned edit response loss retries the same PATCH payload and key without duplicate submit',async({page})=>{
 const mock=await installRegression(page,{status:'returned',lose:'/requests/'+requestId})
 await page.goto(detail)
 const form=page.locator('.cost-request-panel')
 await form.getByLabel(/^Số tiền/).fill('31')
 await form.getByRole('checkbox').check()
 await form.getByRole('button',{name:'Gửi duyệt khoản chi',exact:true}).click()
 await expect(form.getByText('Chờ xác nhận kết quả gửi trước')).toBeVisible()
 await expect(form.getByLabel(/^Số tiền/)).toBeDisabled()
 await form.getByRole('button',{name:'Thử lại gửi duyệt khoản chi',exact:true}).click()
 await expect(page.getByText('Chờ duyệt',{exact:true})).toBeVisible()
 const updates=mock.calls.filter(c=>c.method==='PATCH')
 expect(updates).toHaveLength(2);expect(updates[0]?.key).toBeTruthy();expect(updates[1]).toEqual(updates[0])
 expect(mock.calls.filter(c=>c.path.endsWith('/submit'))).toHaveLength(1)
 expect(mock.state.writes).toBe(2)
})
test('resubmit response loss retains evidence and replays only the identical submit command',async({page})=>{
 const mock=await installRegression(page,{status:'returned',lose:'/requests/'+requestId+'/submit'})
 await page.goto(detail)
 const form=page.locator('.cost-request-panel')
 await form.getByRole('checkbox').check()
 await form.getByRole('button',{name:'Gửi duyệt khoản chi',exact:true}).click()
 await expect(form.getByText('Chờ xác nhận kết quả gửi trước')).toBeVisible()
 await expect(form.getByText('Hồ sơ chứng từ gốc (1):',{exact:true})).toBeVisible()
 await form.getByRole('button',{name:'Thử lại gửi duyệt khoản chi',exact:true}).click()
 await expect(page.getByText('Chờ duyệt',{exact:true})).toBeVisible()
 const submits=mock.calls.filter(c=>c.path.endsWith('/submit'))
 expect(submits).toHaveLength(2);expect(submits[1]).toEqual(submits[0])
 expect(mock.calls.filter(c=>c.method==='PATCH')).toHaveLength(1)
 expect(mock.state.writes).toBe(2)
})
test('repeated approval clicks dispatch once; an uncertain decision retries its original reason and key',async({page})=>{
 const path='/requests/'+requestId+'/decisions'
 const mock=await installRegression(page,{status:'submitted',lose:path,hold:path})
 await page.goto(detail)
 await page.getByPlaceholder('Lý do (bắt buộc khi trả lại)',{exact:true}).fill('Rà soát giả lập')
 await page.getByRole('button',{name:'Phê duyệt',exact:true}).dblclick()
 await expect.poll(()=>mock.state.holds).toBe(1)
 expect(mock.calls.filter(c=>c.path===path)).toHaveLength(1)
 await expect(page.getByRole('button',{name:'Phê duyệt',exact:true})).toBeDisabled()
 mock.state.release()
 await expect(page.getByText('Chưa xác định kết quả duyệt.',{exact:false})).toBeVisible()
 await expect(page.getByPlaceholder('Lý do (bắt buộc khi trả lại)',{exact:true})).toBeDisabled()
 await page.getByRole('button',{name:'Trả lại',exact:true}).click()
 expect(mock.calls.filter(c=>c.path===path)).toHaveLength(1)
 await page.getByRole('button',{name:'Phê duyệt',exact:true}).click()
 await expect(page.getByText('Đã duyệt',{exact:true})).toBeVisible()
 const attempts=mock.calls.filter(c=>c.path===path)
 expect(attempts).toHaveLength(2);expect(attempts[1]).toEqual(attempts[0]);expect(mock.state.writes).toBe(1)
})
test('project navigation ignores a pending request read from the old project',async({page})=>{
 const mock=await installRegression(page,{hold:'GET:/requests/'+requestId})
 await page.goto(detail)
 await expect.poll(()=>mock.state.holds).toBe(1)
 await page.getByTestId('app-sidebar').locator('a[href="/costs"]').click()
 await page.locator('a[href="/costs/'+secondProject+'/requests"]').click()
 await expect(page.getByText('Đối tác ngữ cảnh thứ hai',{exact:true})).toBeVisible()
 mock.state.release()
 await page.waitForLoadState('networkidle')
 await expect(page).toHaveURL(new RegExp(secondProject+'/requests$'))
 await expect(page.getByText('Nhà cung cấp giả lập',{exact:true})).toHaveCount(0)
 expect(mock.calls).toHaveLength(0)
})
test('company navigation while approval is pending cannot overwrite the new company request',async({page,authState})=>{
 authState.sessionCompanies.push(createCompany({companyId:secondCompany,companyName:'Công ty giả lập thứ hai'}))
 const path='/requests/'+requestId+'/decisions',mock=await installRegression(page,{status:'submitted',hold:path})
 await page.goto(detail)
 await page.getByRole('button',{name:'Phê duyệt',exact:true}).click()
 await expect.poll(()=>mock.state.holds).toBe(1)
 await switchCompany(page)
 await expect(page.getByText('Đối tác: Đối tác ngữ cảnh thứ hai',{exact:true})).toBeVisible()
 mock.state.release()
 await page.waitForLoadState('networkidle')
 await expect(page.getByText('Chờ duyệt',{exact:true})).toBeVisible()
 expect(mock.calls.filter(c=>c.path===path)).toHaveLength(1)
 expect(mock.calls.find(c=>c.path===path)?.companyId).toBe(company)
})
test('payment double-click sends one command and consecutive installments use new proofs and versions',async({page})=>{
 const path='/installments/'+installment+'/payments',mock=await installRegression(page,{hold:path})
 await page.goto(detail)
 let panel=await preparePayment(page)
 await panel.getByRole('button',{name:'Xác nhận thanh toán',exact:true}).dblclick()
 await expect.poll(()=>mock.state.holds).toBe(1)
 expect(mock.calls.filter(c=>c.path===path)).toHaveLength(1)
 await expect(panel.getByRole('button',{name:'Hủy bỏ',exact:true})).toBeDisabled()
 mock.state.release()
 await expect(page.locator('.payment-modal')).toHaveCount(0)
 await expect(page.getByText('Hạn mức: 30 | Đã chi: 15 | Còn lại: 15',{exact:true})).toBeVisible()
 panel=await preparePayment(page,'15')
 await panel.getByRole('button',{name:'Xác nhận thanh toán',exact:true}).click()
 await expect(page.getByText('Hạn mức: 30 | Đã chi: 30 | Còn lại: 0',{exact:true})).toBeVisible()
 await expect(page.getByRole('button',{name:'Ghi nhận thanh toán',exact:true})).toHaveCount(0)
 const payments=mock.calls.filter(c=>c.path===path)
 expect(payments.map(c=>c.body.expectedVersion)).toEqual([1,2])
 expect(payments[1]?.key).not.toBe(payments[0]?.key)
 expect(payments[1]?.body.evidenceFileIds).not.toEqual(payments[0]?.body.evidenceFileIds)
 expect(mock.state.writes).toBe(2)
})
test('over-remaining payment is blocked; cancel and reopen preserve saved request evidence',async({page})=>{
 const mock=await installRegression(page)
 await page.goto(detail)
 const panel=await preparePayment(page,'21')
 await expect(panel.getByRole('button',{name:'Xác nhận thanh toán',exact:true})).toBeDisabled()
 await panel.getByRole('button',{name:'Hủy bỏ',exact:true}).click()
 await page.getByRole('button',{name:'Ghi nhận thanh toán',exact:true}).click()
 await expect(page.locator('.payment-modal').getByLabel(/^Số tiền thanh toán/)).toHaveValue('')
 await expect(page.locator('.payment-modal').getByText('Chứng từ thanh toán (0):',{exact:true})).toBeVisible()
 await page.locator('.payment-modal').getByRole('button',{name:'Hủy bỏ',exact:true}).click()
 await page.getByRole('link',{name:'← Danh sách đề nghị',exact:true}).click()
 await page.getByRole('link',{name:'Chi tiết',exact:true}).click()
 await expect(page.getByText('Hồ sơ đã lưu (70000000)',{exact:true})).toBeVisible()
 expect(mock.calls.filter(c=>c.path.endsWith('/payments'))).toHaveLength(0)
 expect(mock.state.current.evidenceFileIds).toEqual([fileId])
})
test('company switch during payment loses no scope guard and ignores the stale receipt',async({page,authState})=>{
 authState.sessionCompanies.push(createCompany({companyId:secondCompany,companyName:'Công ty giả lập thứ hai'}))
 const path='/installments/'+installment+'/payments',mock=await installRegression(page,{hold:path})
 await page.goto(detail)
 const panel=await preparePayment(page)
 await panel.getByRole('button',{name:'Xác nhận thanh toán',exact:true}).click()
 await expect.poll(()=>mock.state.holds).toBe(1)
 await switchCompany(page)
 await expect(page.locator('.payment-modal')).toHaveCount(0)
 await expect(page.getByText('Đối tác: Đối tác ngữ cảnh thứ hai',{exact:true})).toBeVisible()
 mock.state.release()
 await page.waitForLoadState('networkidle')
 await expect(page.getByText('Hạn mức: 30 | Đã chi: 10 | Còn lại: 20',{exact:true})).toBeVisible()
 expect(mock.calls.filter(c=>c.path===path)).toHaveLength(1)
 expect(mock.calls.find(c=>c.path===path)?.companyId).toBe(company)
})
test('completed project keeps settlement and refund controls but blocks new and returned obligations',async({page})=>{
 const mock=await installRegression(page,{completed:true,status:'returned',refund:true})
 await page.goto('/costs/'+project+'/requests/new')
 await expect(page.getByText('Dự án đã kết thúc, không thể lập thêm đề nghị khoản chi mới.')).toBeVisible()
 await page.goto(detail)
 await expect(page.locator('.cost-request-panel')).toHaveCount(0)
 await page.goto(list)
 await expect(page.getByRole('link',{name:'+ Tạo đề nghị mới',exact:true})).toHaveCount(0)
 await expect(page.getByRole('button',{name:'Ghi nhận nhận hoàn tiền thực tế',exact:true})).toBeVisible()
 expect(mock.calls).toHaveLength(0)
})
test('partial refund confirmation updates cash only after receiving proof; retry keeps identical payload',async({page})=>{
 const path='/adjustments/'+refundId+'/confirm-refund',mock=await installRegression(page,{refund:true,lose:path})
 await page.goto(list)
 const panel=page.locator('.cash-adjustments-panel')
 await panel.getByRole('button',{name:'Ghi nhận nhận hoàn tiền thực tế',exact:true}).click()
 const form=panel.locator('.confirm-form')
 await form.getByPlaceholder('Số tiền thực nhận').fill('2')
 await expect(form.getByRole('button',{name:'Xác nhận hoàn tất',exact:true})).toBeDisabled()
 await uploadProof(page,form.locator('.cost-workflow-original-upload'))
 await form.getByRole('button',{name:'Xác nhận hoàn tất',exact:true}).click()
 await expect(panel.getByRole('alert')).toContainText('Chưa xác định kết quả thao tác.')
 await form.getByRole('button',{name:'Xác nhận hoàn tất',exact:true}).click()
 await expect(page.locator('.cash-summary')).toContainText('Hoàn tiền: 2.0000')
 await expect(page.locator('.cash-summary')).toContainText('Thực chi thuần: 8.0000')
 await expect(page.locator('.cash-summary')).toContainText('Chưa chi (duyệt): 20.0000')
 const attempts=mock.calls.filter(c=>c.path===path)
 expect(attempts).toHaveLength(2);expect(attempts[1]).toEqual(attempts[0]);expect(mock.state.writes).toBe(1)
 await panel.getByRole('button',{name:'Ghi nhận nhận hoàn tiền thực tế',exact:true}).click()
 await expect(panel.getByPlaceholder('Số tiền thực nhận')).toHaveValue('2')
 expect(mock.state.current.installment?.remaining).toBe('20')
})
test('uncertain refund confirmation freezes payload fields and prevents cancel from abandoning its key',async({page})=>{
 const path='/adjustments/'+refundId+'/confirm-refund',mock=await installRegression(page,{refund:true,lose:path})
 await page.goto(list)
 const panel=page.locator('.cash-adjustments-panel')
 await panel.getByRole('button',{name:'Ghi nhận nhận hoàn tiền thực tế',exact:true}).click()
 const form=panel.locator('.confirm-form')
 await uploadProof(page,form.locator('.cost-workflow-original-upload'))
 await form.getByRole('button',{name:'Xác nhận hoàn tất',exact:true}).click()
 await expect(panel.getByRole('alert')).toContainText('Chưa xác định kết quả thao tác.')
 await expect.soft(form.getByPlaceholder('Số tiền thực nhận')).toBeDisabled({timeout:3000})
 await expect.soft(form.getByRole('button',{name:'Hủy',exact:true})).toBeDisabled({timeout:3000})
 expect(mock.calls.filter(c=>c.path===path)).toHaveLength(1)
})
test('cancel returned edits and back/reopen retain the saved original evidence and clear accountant review',async({page})=>{
 const mock=await installRegression(page,{status:'returned'})
 await page.goto(detail)
 const form=page.locator('.cost-request-panel')
 await form.getByLabel(/^Số tiền/).fill('99')
 await form.getByRole('checkbox').check()
 await form.getByRole('button',{name:'Hủy',exact:true}).click()
 await expect(form.getByLabel(/^Số tiền/)).toHaveValue('30')
 await expect(form.getByRole('checkbox')).not.toBeChecked()
 await page.getByRole('link',{name:'← Danh sách đề nghị',exact:true}).click()
 await page.getByRole('link',{name:'Chi tiết',exact:true}).click()
 await expect(form.getByText('Hồ sơ chứng từ gốc (1):',{exact:true})).toBeVisible()
 expect(mock.calls).toHaveLength(0)
})

test('project navigation while an accountant PATCH is pending prevents its later submit stage',async({page})=>{
 const path='/requests/'+requestId,mock=await installRegression(page,{status:'returned',hold:path})
 await page.goto(detail)
 const form=page.locator('.cost-request-panel')
 await form.getByLabel(/^Số tiền/).fill('32')
 await form.getByRole('checkbox').check()
 await form.getByRole('button',{name:'Gửi duyệt khoản chi',exact:true}).click()
 await expect.poll(()=>mock.state.holds).toBe(1)
 await page.getByTestId('app-sidebar').locator('a[href="/costs"]').click()
 await page.locator('a[href="/costs/'+secondProject+'/requests"]').click()
 await expect(page.getByText('Đối tác ngữ cảnh thứ hai',{exact:true})).toBeVisible()
 mock.state.release()
 await page.waitForLoadState('networkidle')
 expect(mock.calls.filter(c=>c.path.endsWith('/submit'))).toHaveLength(0)
 await expect(page).toHaveURL(new RegExp(secondProject+'/requests$'))
})
test('refund confirmation blocks amounts above the approved unreceived refund balance',async({page})=>{
 const mock=await installRegression(page,{refund:true})
 await page.goto(list)
 const panel=page.locator('.cash-adjustments-panel')
 await panel.getByRole('button',{name:'Ghi nhận nhận hoàn tiền thực tế',exact:true}).click()
 const form=panel.locator('.confirm-form')
 await form.getByPlaceholder('Số tiền thực nhận').fill('5')
 await uploadProof(page,form.locator('.cost-workflow-original-upload'))
 await expect(form.getByRole('button',{name:'Xác nhận hoàn tất',exact:true})).toBeDisabled({timeout:3000})
 expect(mock.calls.filter(c=>c.path.endsWith('/confirm-refund'))).toHaveLength(0)
})
