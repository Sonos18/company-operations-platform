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
const nextManager='11111111-1111-4111-8111-111111111112'
const submittedVersion='80000000-0000-4000-8000-000000000001'
const assignment='90000000-0000-4000-8000-000000000001'
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1eQAAAAASUVORK5CYII=','base64')
const basis={kind:'materials',deliverySite:'Công trường giả lập',lines:[{description:'Ống nước giả lập',quantity:'3',unit:'m',unitPrice:'10'}]}
const request=costRequestViewSchema.parse({id:requestId,version:1,submittedVersionId:submittedVersion,status:'approved',partyId:party,partyName:'Nhà cung cấp giả lập',partyKind:'organization',crewOwnership:null,categoryId:category,contractVersionId:basisVersion,latestDecision:null,amount:'30',currencyCode:'VND',evidenceFileIds:[fileId],assignmentVersion:1,basis,installment:{id:installment,version:1,authorized:'30',consumed:'10',remaining:'20'},payments:[]})
const contract=workflowContractViewSchema.parse({id:basisId,versionId:basisVersion,partyId:party,reference:'Báo giá giả lập 100',currencyCode:'VND',version:1,cap:'100',evidenceFileIds:[fileId],sourceSubcontractId:null})
type Call={path:string;body:unknown;key:string|undefined}
const sourceId='a0000000-0000-4000-8000-000000000001'
const otherParty='30000000-0000-4000-8000-000000000002'
const otherProject='10000000-0000-4000-8000-000000000102'
const sourceOption={id:sourceId,partyId:party,code:'SUB-SYNTHETIC',contractName:'Hợp đồng phụ giả lập',currencyCode:'VND'}
async function installWorkflow(page:Page,options:{completed?:boolean;canDecide?:boolean;loseManagerResponse?:boolean;losePaymentResponse?:boolean;requestSubmitted?:boolean;pdf?:boolean;loseExtractResponse?:boolean;sourceOptions?:typeof sourceOption[];noContracts?:boolean;loseBasisResponse?:boolean}={}){
 const calls:Call[]=[]
 const shownRequest=options.requestSubmitted?costRequestViewSchema.parse({...request,status:'submitted',installment:null}):request
 const context=workflowProjectContextSchema.parse({mode:'document_backed_v1',operationalState:options.completed?'completed':'active',manager:{userId:manager,assignmentId:assignment,version:1,reason:'Phân công giả lập'},canSubmit:!options.completed,canDecide:options.canDecide??true,canAssign:true,eligibleManagers:[{userId:manager,label:'Quản lý hiện tại'},{userId:nextManager,label:'Quản lý nhận bàn giao'}]})
 const cashSummary={grossPaid:'10.0000',confirmedRefunds:'2.0000',netCash:'8.0000',approvedUnspent:'20.0000',coverage:'partial',unreconciledCount:1}
 const cash=workflowFinanceSchema.parse({schemaVersion:2,project:{projectId:project,projectCode:'SYNTHETIC',projectName:'Dự án giả lập',currencyCode:'VND',moneyScale:0,timeZone:'Asia/Ho_Chi_Minh',operationalState:context.operationalState},workflowCash:cashSummary,categories:[{categoryId:category,code:'materials',name:'Vật tư',displayOrder:1,workflowCash:cashSummary,retention:{state:'not_recorded',amount:null,recordedCount:0}}]})
 let evidence={id:newFileId,status:'finalized',originalFilename:'synthetic.png',mimeType:'image/png',sizeBytes:png.length,sha256:'a'.repeat(64),version:1,finalizedAt:new Date().toISOString(),replayed:false}
 let managerCalls=0,paymentCalls=0,extractCalls=0,basisCalls=0
 await page.route(/\/api\/companies\/[^/]+\/cost-workflow\/projects(?:\?.*)?$/,route=>route.fulfill({json:{mode:'document_backed_v1',projects:[{projectId:project,code:'SYNTHETIC',name:'Dự án giả lập',operationalState:context.operationalState},{projectId:otherProject,code:'SYNTHETIC-B',name:'Dự án thứ hai giả lập',operationalState:'active'}],nextCursor:null}}))
 await page.route('https://auth.taskovia.test/storage/v1/**',route=>route.fulfill({json:{Key:'synthetic',Id:newFileId},headers:{'Access-Control-Allow-Origin':'*'}}))
 await page.route(/\/api\/companies\/[^/]+\/projects\/[^/]+\/cost-workflow(?:\/.*)?$/,async(route:Route)=>{
  const req=route.request(),path=new URL(req.url()).pathname.split('/cost-workflow')[1]??''
  if(req.method()==='GET'){
   const value=path==='/context'?context:path==='/cash'?cash:path==='/parties'?[{id:party,name:'Nhà cung cấp giả lập',kind:'organization',crewOwnership:null},{id:otherParty,name:'Đối tác thứ hai giả lập',kind:'organization',crewOwnership:null}]:path==='/contracts'?(options.noContracts?[]:[contract]):path==='/source-subcontracts'?(options.sourceOptions??[]):path==='/requests'?[shownRequest]:path==='/requests/'+requestId?shownRequest:path==='/requests/'+requestId+'/history'?[]:path==='/adjustments'?[]:null
   if(value===null)throw new Error('Unexpected mock workflow GET '+path)
   return route.fulfill({json:value})
  }
  const body=req.postDataJSON() as Record<string,unknown>
  calls.push({path,body,key:req.headers()['idempotency-key']})
  if(path==='/manager'){
   managerCalls++
   if(options.loseManagerResponse&&managerCalls===1)return route.fulfill({status:500,json:{code:'SYNTHETIC_RESPONSE_LOST',message:'Giả lập mất phản hồi'}})
   return route.fulfill({json:{assignmentId:assignment,version:2,replayed:managerCalls>1}})
  }
  if(path==='/evidence/upload-intents'){
   evidence={...evidence,originalFilename:String(body.originalFilename),mimeType:String(body.mimeType),sizeBytes:Number(body.sizeBytes),sha256:String(body.sha256)}
   return route.fulfill({json:{evidenceFileId:newFileId,version:0,bucketId:'c1-accounting-evidence',objectPath:[tenant,company,project,newFileId].join('/'),expiresAt:new Date(Date.now()+60000).toISOString(),replayed:false}})
  }
  if(path==='/evidence/'+newFileId+'/finalize')return route.fulfill({json:evidence})
  if(path==='/evidence/'+newFileId+'/extract'){
   extractCalls++
   if(options.loseExtractResponse&&extractCalls===1)return route.fulfill({status:500,json:{code:'SYNTHETIC_RESPONSE_LOST',message:'Giả lập mất phản hồi'}})
   return route.fulfill({json:{extractionId:newFileId,fileId:newFileId,requestId:null,replayed:extractCalls>1,result:{status:'needs_review',reviewRequired:true,fields:{amount:'30',currencyCode:'VND',partyHint:'Nhà cung cấp giả lập',basis},warnings:['PARTY_MATCH_REQUIRES_REVIEW'],sourceLocations:[],methodVersion:options.pdf?'azure-f0-v1':'synthetic-fixture-v1',...(options.pdf?{azurePdfCoverage:{kind:'azure-pdf-scope-v1',sourceSha256:evidence.sha256,sourceByteLength:evidence.sizeBytes,requestedPages:[1,2],returnedPages:[1,2],requestedPagesMatched:true,sourcePageCount:{kind:'user-declared',count:4},wholeDocumentComplete:false,reviewRequired:true}}:{})}}})
  }
  if(path.endsWith('/read-url'))return route.fulfill({json:{url:'https://original.taskovia.test/synthetic',expiresAt:new Date(Date.now()+60000).toISOString()}})
  if(path==='/contracts'){
   basisCalls++
   if(options.loseBasisResponse&&basisCalls===1)return route.fulfill({status:500,json:{code:'SYNTHETIC_RESPONSE_LOST',message:'Giả lập mất phản hồi'}})
   return route.fulfill({json:{contractId:basisId,contractVersionId:basisVersion,version:1,replayed:basisCalls>1}})
  }
  if(path==='/requests')return route.fulfill({json:{requestId,version:1,replayed:false}})
  if(path==='/requests/'+requestId+'/submit')return route.fulfill({json:{requestId,version:2,replayed:false}})
  if(path==='/installments/'+installment+'/payments'){
   paymentCalls++
   if(options.losePaymentResponse&&paymentCalls===1)return route.fulfill({status:500,json:{code:'SYNTHETIC_RESPONSE_LOST',message:'Giả lập mất phản hồi'}})
   return route.fulfill({json:{paymentId:newFileId,version:2,replayed:paymentCalls>1}})
  }
  throw new Error('Unexpected mock workflow mutation '+path)
 })
 return {calls,context}
}
async function upload(page:Page){
 const panel=page.locator('.cost-workflow-original-upload').filter({visible:true})
 await panel.locator('input[type=file]').setInputFiles({name:'synthetic.png',mimeType:'image/png',buffer:png})
 await panel.getByRole('button',{name:'Tải lên hồ sơ gốc',exact:true}).click()
 await expect(panel.getByText('Đang tải lên và hoàn tất hồ sơ...')).toHaveCount(0)
}
test('active workflow hides source/draft links and separates cash from approved work',async({page})=>{
 await installWorkflow(page)
 await page.goto('/costs/'+project+'/requests')
 await expect(page.getByText('10.0000',{exact:true})).toBeVisible()
 await expect(page.getByText('2.0000',{exact:true})).toBeVisible()
 await expect(page.getByText('8.0000',{exact:true})).toBeVisible()
 await expect(page.locator('a[href="/cost-drafts"],a[href="/costs/sources"]')).toHaveCount(0)
 await page.goto('/costs/'+project)
 await expect(page).toHaveURL(new RegExp('/costs/'+project+'/requests$'))
})
test('original, party and explicit accountant review are required; scan never posts',async({page})=>{
 const state=await installWorkflow(page)
 await page.goto('/costs/'+project+'/requests/new')
 const form=page.locator('.cost-request-panel')
 await form.getByLabel(/^Đối tác/).selectOption(party)
 await form.getByLabel(/^Hạng mục/).selectOption(category)
 await form.getByLabel(/^Hợp đồng căn cứ/).selectOption(basisVersion)
 await form.getByLabel(/^Số tiền/).fill('30')
 await form.getByLabel(/^Địa điểm giao/).fill('Công trường giả lập')
 await form.getByPlaceholder('Tên vật tư').fill('Ống nước giả lập')
 await form.getByPlaceholder('SL',{exact:true}).fill('3')
 await form.getByPlaceholder('Đơn giá',{exact:true}).fill('10')
 await form.getByRole('checkbox').check()
 await expect(form.getByRole('button',{name:'Gửi duyệt khoản chi',exact:true})).toBeDisabled()
 await upload(page)
 await form.getByRole('button',{name:'Trích xuất gợi ý'}).click()
 await form.getByRole('button',{name:'Áp dụng dữ liệu gợi ý'}).click()
 await expect(form.getByRole('checkbox')).not.toBeChecked()
 expect(state.calls.filter(c=>c.path==='/requests')).toHaveLength(0)
 await form.getByRole('checkbox').check()
 await form.getByRole('button',{name:'Gửi duyệt khoản chi',exact:true}).click()
 await expect(page).toHaveURL(new RegExp('/requests/'+requestId+'$'))
 const creates=state.calls.filter(c=>c.path==='/requests')
 expect(creates).toHaveLength(1)
 expect(creates[0]?.body).toMatchObject({partyId:party,contractVersionId:basisVersion,evidenceFileIds:[newFileId],amount:'30'})
 expect(state.calls.filter(c=>c.path.endsWith('/submit'))).toHaveLength(1)
})
test('lost manager response freezes the form and retries the identical key and payload',async({page})=>{
 const state=await installWorkflow(page,{loseManagerResponse:true})
 await page.goto('/costs/'+project+'/requests')
 const panel=page.locator('.manager-assignment')
 await panel.locator('select').selectOption(nextManager)
 await panel.getByPlaceholder('Nhập lý do phân công').fill('Bàn giao giả lập')
 await panel.getByRole('button',{name:'Xác nhận phân công'}).click()
 await expect(panel.getByText('Chưa xác định kết quả phân công.',{exact:false})).toBeVisible()
 await expect(panel.locator('select')).toBeDisabled()
 await panel.getByRole('button',{name:'Xác nhận phân công'}).click()
 await expect.poll(()=>state.calls.filter(c=>c.path==='/manager').length).toBe(2)
 const calls=state.calls.filter(c=>c.path==='/manager')
 expect(calls[0]?.key).toBeTruthy()
 expect(calls[1]).toEqual(calls[0])
})
test('payment requires a new finalized proof; lost response retains the original command',async({page})=>{
 const state=await installWorkflow(page,{losePaymentResponse:true})
 await page.goto('/costs/'+project+'/requests/'+requestId)
 await page.getByRole('button',{name:'Ghi nhận thanh toán',exact:true}).click()
 const panel=page.locator('.payment-modal')
 await panel.getByLabel(/^Số tiền thanh toán/).fill('10')
 await panel.getByLabel(/^Mã \/ Số tham chiếu/).fill('SYNTHETIC-PAYMENT')
 await expect(panel.getByRole('button',{name:'Xác nhận thanh toán',exact:true})).toBeDisabled()
 await upload(page)
 await panel.getByRole('button',{name:'Xác nhận thanh toán',exact:true}).click()
 await expect(panel.getByText('Chưa xác định kết quả thanh toán.',{exact:false})).toBeVisible()
 await expect(panel.getByLabel(/^Số tiền thanh toán/)).toBeDisabled()
 await panel.getByRole('button',{name:'Xác nhận thanh toán',exact:true}).click()
 await expect.poll(()=>state.calls.filter(c=>c.path.endsWith('/payments')).length).toBe(2)
 const calls=state.calls.filter(c=>c.path.endsWith('/payments'))
 expect(calls[0]?.key).toBeTruthy()
 expect(calls[1]).toEqual(calls[0])
 expect(calls[0]?.body).toMatchObject({amount:'10',evidenceFileIds:[newFileId]})
 const intent=state.calls.find(c=>c.path==='/evidence/upload-intents')
 expect(intent?.body).toMatchObject({target:{kind:'payment',id:installment},evidenceKind:'payment_proof'})
})
test('completed project blocks new obligations while retaining existing settlement view',async({page})=>{
 await installWorkflow(page,{completed:true})
 await page.goto('/costs/'+project+'/requests/new')
 await expect(page.getByText('Dự án đã kết thúc, không thể lập thêm đề nghị khoản chi mới.')).toBeVisible()
 await expect(page.locator('.cost-request-panel')).toHaveCount(0)
 await page.goto('/costs/'+project+'/requests/'+requestId)
 await expect(page.getByText('Dự án đã hoàn thành, chỉ hiển thị đối soát thanh toán hiện hữu.')).toBeVisible()
 await expect(page.getByRole('button',{name:'Ghi nhận thanh toán',exact:true})).toBeVisible()
})
test('handover removes approval controls from a manager without current authority',async({page,authState})=>{
 authState.sessionCompanies=[createCompany({permissions:['cost.request.read','cost.request.decide','cost.request.file.read']})]
 const state=await installWorkflow(page,{canDecide:false,requestSubmitted:true})
 await page.goto('/costs/'+project+'/requests/'+requestId)
 await expect(page.getByTestId('cost-request-detail')).toBeVisible()
 await expect(page.getByText('Chờ duyệt',{exact:true})).toBeVisible()
 await expect(page.getByRole('button',{name:'Phê duyệt',exact:true})).toHaveCount(0)
 expect(state.calls).toHaveLength(0)
})

test('PDF declared total and partial coverage remain frozen during identical lost-response retry',async({page})=>{
 const state=await installWorkflow(page,{pdf:true,loseExtractResponse:true})
 await page.goto('/costs/'+project+'/requests/new')
 const form=page.locator('.cost-request-panel'),uploadPanel=page.locator('.cost-workflow-original-upload').filter({visible:true})
 await uploadPanel.locator('input[type=file]').setInputFiles({name:'synthetic.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.7\nsynthetic')})
 await uploadPanel.getByRole('button',{name:'Tải lên hồ sơ gốc',exact:true}).click()
 await expect(form.getByText('synthetic.pdf',{exact:true})).toBeVisible()
 const scan=form.getByRole('button',{name:'Trích xuất gợi ý',exact:true})
 await expect(scan).toBeDisabled()
 const scope=form.getByLabel('Phạm vi quét khi tệp là PDF')
 await scope.selectOption('1-2')
 const count=form.getByLabel('Tổng số trang theo người tải (tùy chọn)')
 await count.fill('4')
 await expect(scan).toBeEnabled()
 await scan.click()
 await expect(form.getByRole('button',{name:'Thử lại trích xuất',exact:true})).toBeVisible()
 await expect(scope).toBeDisabled();await expect(count).toBeDisabled()
 await expect(form.getByRole('button',{name:'Gỡ',exact:true})).toBeDisabled()
 await form.getByRole('button',{name:'Thử lại trích xuất',exact:true}).click()
 await expect(form.getByRole('status')).toContainText('Người tải khai báo 4 trang; chưa xác minh.')
 await expect(form.getByRole('status')).toContainText('Kết quả chưa xác nhận đầy đủ tài liệu.')
 const scans=state.calls.filter(call=>call.path.endsWith('/extract'))
 expect(scans).toHaveLength(2);expect(scans[1]).toEqual(scans[0])
 expect(scans[0]?.body).toEqual({requestId:null,pdfPageScope:'1-2',pdfDeclaredPageCount:4})
 expect(state.calls.filter(call=>call.path==='/requests')).toHaveLength(0)
})

async function openBasis(page:Page){
 await page.goto('/costs/'+project+'/requests/new')
 await page.getByText('Hợp đồng hoặc báo giá dùng chung hạn mức',{exact:true}).click()
 return page.locator('.contract-basis-panel')
}
async function fillBasis(page:Page){
 const panel=page.locator('.contract-basis-panel')
 await panel.locator('.create-box select').first().selectOption(party)
 await panel.getByPlaceholder('Ví dụ: HĐKT-2026/01').fill('SYNTHETIC-BASIS')
 await panel.getByPlaceholder('Ví dụ: 500000000').fill('100')
 const uploader=panel.locator('.cost-workflow-original-upload')
 await uploader.locator('input[type=file]').setInputFiles({name:'synthetic.png',mimeType:'image/png',buffer:png})
 await uploader.getByRole('button',{name:'Tải lên hồ sơ gốc',exact:true}).click()
 await expect(panel.getByText('synthetic.png',{exact:true})).toBeVisible()
 return panel
}
test('basis mapping: unmapped canonical subcontract is selectable before any workflow mapping',async({page})=>{
 const state=await installWorkflow(page,{sourceOptions:[sourceOption],noContracts:true})
 const panel=await openBasis(page)
 await expect(panel.getByText('Chưa có hợp đồng hoặc căn cứ nào được thiết lập.')).toBeVisible()
 await fillBasis(page)
 await panel.getByLabel('Hợp đồng phụ hiện có').selectOption(sourceId)
 await panel.locator('.create-box input[type=checkbox]').check()
 await panel.getByRole('button',{name:'Thiết lập căn cứ hợp đồng',exact:true}).click()
 await expect.poll(()=>state.calls.filter(c=>c.path==='/contracts').length).toBe(1)
 expect(state.calls.find(c=>c.path==='/contracts')?.body).toMatchObject({partyId:party,sourceSubcontractId:sourceId,currencyCode:'VND',evidenceFileIds:[newFileId]})
})
test('basis mapping: no eligible subcontract leaves ordinary evidence-backed basis available',async({page})=>{
 const state=await installWorkflow(page,{noContracts:true})
 const panel=await openBasis(page)
 await fillBasis(page)
 await expect(panel.getByLabel('Hợp đồng phụ hiện có').locator('option')).toHaveCount(1)
 await panel.locator('.create-box input[type=checkbox]').check()
 await panel.getByRole('button',{name:'Thiết lập căn cứ hợp đồng',exact:true}).click()
 await expect.poll(()=>state.calls.filter(c=>c.path==='/contracts').length).toBe(1)
 expect(state.calls.find(c=>c.path==='/contracts')?.body).not.toHaveProperty('sourceSubcontractId')
})
test('basis mapping: party and currency changes clear incompatible mapping and document review',async({page})=>{
 await installWorkflow(page,{sourceOptions:[sourceOption]})
 const panel=await openBasis(page)
 await fillBasis(page)
 const selector=panel.getByLabel('Hợp đồng phụ hiện có'),review=panel.locator('.create-box input[type=checkbox]')
 await selector.selectOption(sourceId);await review.check()
 await panel.locator('.create-box select').first().selectOption(otherParty)
 await expect(selector).toHaveValue('');await expect(review).not.toBeChecked()
 await expect(selector.locator('option')).toHaveCount(1)
 await panel.locator('.create-box select').first().selectOption(party)
 await selector.selectOption(sourceId);await review.check()
 await panel.getByPlaceholder('VND',{exact:true}).fill('USD')
 await expect(selector).toHaveValue('');await expect(review).not.toBeChecked()
 await expect(selector.locator('option')).toHaveCount(1)
})
test('basis mapping: uncertain create freezes mapping and retries the identical command',async({page})=>{
 const state=await installWorkflow(page,{sourceOptions:[sourceOption],loseBasisResponse:true})
 const panel=await openBasis(page)
 await fillBasis(page)
 const selector=panel.getByLabel('Hợp đồng phụ hiện có')
 await selector.selectOption(sourceId);await panel.locator('.create-box input[type=checkbox]').check()
 const send=panel.getByRole('button',{name:'Thiết lập căn cứ hợp đồng',exact:true})
 await send.click()
 await expect(panel.getByText('Chưa xác định kết quả thiết lập.',{exact:false})).toBeVisible()
 await expect(selector).toBeDisabled();await expect(panel.locator('.create-box select').first()).toBeDisabled()
 await expect(panel.getByPlaceholder('VND',{exact:true})).toBeDisabled()
 await expect(panel.locator('.create-box input[type=checkbox]')).toBeDisabled()
 await expect(panel.getByRole('button',{name:'Gỡ',exact:true})).toBeDisabled()
 await expect(panel.locator('.create-box input[type=file]')).toHaveCount(0)
 await send.click()
 await expect.poll(()=>state.calls.filter(c=>c.path==='/contracts').length).toBe(2)
 const calls=state.calls.filter(c=>c.path==='/contracts')
 expect(calls[0]?.key).toBeTruthy();expect(calls[1]).toEqual(calls[0])
})
async function switchBasisProject(page:Page){
 await page.getByRole('link',{name:'← Quay lại danh sách đề nghị',exact:true}).click()
 await page.locator('a[href="/costs"]').first().click()
 await page.locator('a[href="/costs/'+otherProject+'/requests"]').click()
 await page.locator('a[href="/costs/'+otherProject+'/requests/new"]').click()
 await page.getByText('Hợp đồng hoặc báo giá dùng chung hạn mức',{exact:true}).click()
}
test('basis mapping: late previous-project options cannot enter the new project form',async({page})=>{
 await installWorkflow(page,{sourceOptions:[sourceOption]})
 let release!:()=>void
 const held=new Promise<void>(resolve=>{release=resolve})
 let started=false
 let delivered!:()=>void
 const delivery=new Promise<void>(resolve=>{delivered=resolve})
 await page.route('**/projects/'+project+'/cost-workflow/source-subcontracts',async route=>{
  started=true;await held;await route.fulfill({json:[sourceOption]});delivered()
 })
 await page.route('**/projects/'+otherProject+'/cost-workflow/source-subcontracts',route=>route.fulfill({json:[]}))
 const panel=await openBasis(page)
 await expect.poll(()=>started).toBe(true)
 await switchBasisProject(page)
 release()
 await delivery
 await page.evaluate(async()=>{await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())))})
 await expect(panel.getByLabel('Hợp đồng phụ hiện có')).toBeVisible()
 await panel.locator('.create-box select').first().selectOption(party)
 await expect(panel.getByLabel('Hợp đồng phụ hiện có').locator('option')).toHaveCount(1)
 await expect(panel.getByLabel('Hợp đồng phụ hiện có')).toHaveValue('')
})
test('basis mapping: navigation discards pending selection and old completion feedback',async({page})=>{
 const state=await installWorkflow(page,{sourceOptions:[sourceOption]})
 let release!:()=>void
 const held=new Promise<void>(resolve=>{release=resolve})
 let started=false
 let delivered!:()=>void
 const delivery=new Promise<void>(resolve=>{delivered=resolve})
 await page.route('**/projects/'+project+'/cost-workflow/contracts',async route=>{
  if(route.request().method()!=='POST')return route.fallback()
  started=true;await held
  await route.fulfill({json:{contractId:basisId,contractVersionId:basisVersion,version:1,replayed:false}});delivered()
 })
 await page.route('**/projects/'+otherProject+'/cost-workflow/source-subcontracts',route=>route.fulfill({json:[]}))
 const panel=await openBasis(page);await fillBasis(page)
 await panel.getByLabel('Hợp đồng phụ hiện có').selectOption(sourceId)
 await panel.locator('.create-box input[type=checkbox]').check()
 await panel.getByRole('button',{name:'Thiết lập căn cứ hợp đồng',exact:true}).click()
 await expect.poll(()=>started).toBe(true)
 await switchBasisProject(page)
 release()
 await delivery
 await page.evaluate(async()=>{await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())))})
 await expect(panel.getByLabel('Hợp đồng phụ hiện có')).toHaveValue('')
 await expect(panel.getByPlaceholder('Ví dụ: HĐKT-2026/01')).toHaveValue('')
 expect(state.calls.filter(c=>c.path==='/contracts')).toHaveLength(0)
})
