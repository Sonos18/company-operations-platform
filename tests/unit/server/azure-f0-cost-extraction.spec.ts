import {createHash} from 'node:crypto'
import {expect,it,vi} from 'vitest'
import {AzureF0CostExtractionAdapter,AzureDocumentIntelligenceTransport,type AzureF0JobStore,type AzureF0Job,type AzureF0Transport,type AzureF0DispatchLease} from '../../../server/features/costs/extraction/azure-f0-cost-extraction'
import type {CostExtractionInput} from '../../../shared/schemas/costs/cost-extraction'
const input:CostExtractionInput={fileId:'11111111-1111-4111-8111-111111111111',mimeType:'application/pdf',bytes:new TextEncoder().encode('synthetic only PDF bytes'),scope:{companyId:'22222222-2222-4222-8222-222222222222',projectId:'33333333-3333-4333-8333-333333333333'},documentKind:'invoice'}
const hash=createHash('sha256').update(input.bytes).digest('hex')
const config={enabled:true,sku:'F0',transmissionApproved:true,resourceId:'taskovia-doc-intelligence-dev.cognitiveservices.azure.com',endpoint:'https://taskovia-doc-intelligence-dev.cognitiveservices.azure.com',version:'synthetic-v1',monthlyPageBudget:500} as const
function dispatchLease(kind:'post'|'get',issuedAt=Date.now()):AzureF0DispatchLease{return {token:'66666666-6666-4666-8666-666666666666',resourceId:config.resourceId,kind,issuedAt,expiresAt:issuedAt+20_000}}
function fixture(){
 let job:AzureF0Job|undefined
 const store:AzureF0JobStore={durability:'persistent',reserve:vi.fn(async reservation=>{job??={key:reservation.key,state:'reserved'};return {job}}),claimSend:vi.fn(async()=>{if(job?.state!=='reserved')return false;job.state='sending';return true}),saveOperation:vi.fn(async(_key,url,pollAfter)=>{job!.state='submitted';job!.operationUrl=url;job!.pollAfter=pollAfter}),markUncertain:vi.fn(async()=>{job!.state='uncertain'}),acquireDispatch:vi.fn(async(_resource,kind)=>dispatchLease(kind,now)),releaseDispatch:vi.fn(async()=>{}),complete:vi.fn(async(_key,raw,result)=>{job!.state='complete';job!.result=result;job!.raw=raw})}
 const post=vi.fn<AzureF0Transport['post']>(async()=>({status:202,operationUrl:config.endpoint+'/documentintelligence/documentModels/prebuilt-invoice/analyzeResults/44444444-4444-4444-8444-444444444444?api-version=2024-11-30',retryAfterSeconds:2}))
 const poll=vi.fn(async()=>({status:200,body:{status:'succeeded',analyzeResult:{apiVersion:'2024-11-30',modelId:'prebuilt-invoice',pages:[{pageNumber:1}],documents:[{fields:{InvoiceTotal:{content:'9007199254740993',valueNumber:9007199254740992,confidence:0.83,boundingRegions:[{pageNumber:1,polygon:[1,2,3,4,5,6,7,8]}]},VendorName:{content:'Synthetic supplier'}}}]}}}))
 let now=Date.UTC(2026,9,5)
 const options={config,store,transport:{post,poll},inspect:vi.fn(async()=>({sha256:hash,complete:true,pageCount:1})),authorize:vi.fn(async()=>true),now:()=>now}
 return {options,store,post,poll,next:(milliseconds=3000)=>{now+=milliseconds},job:()=>job}
}
it('disabled or unattested F0 makes no quota or transport call',async()=>{const f=fixture();expect((await new AzureF0CostExtractionAdapter({...f.options,config:{...config,transmissionApproved:false}}).extract(input)).status).toBe('unavailable');expect(f.post).not.toHaveBeenCalled();expect(f.store.reserve).not.toHaveBeenCalled()})
it('refuses unknown coverage, excess pages and wrong-byte inspection before sending',async()=>{for(const inspection of [{sha256:hash,complete:false,pageCount:2},{sha256:hash,complete:true,pageCount:3},{sha256:'0'.repeat(64),complete:true,pageCount:1}]){const f=fixture();f.options.inspect.mockResolvedValue(inspection);expect((await new AzureF0CostExtractionAdapter(f.options).extract(input)).status).toBe('unavailable');expect(f.post).not.toHaveBeenCalled()}})
it('refuses over 4MB and paid SKU substitution',async()=>{const f=fixture();expect((await new AzureF0CostExtractionAdapter(f.options).extract({...input,bytes:new Uint8Array(4_000_001)})).status).toBe('unavailable');expect((await new AzureF0CostExtractionAdapter({...f.options,config:{...config,sku:'S0'}}).extract(input)).status).toBe('unavailable');expect(f.post).not.toHaveBeenCalled()})
it('resumes durable operation without second POST, retaining raw and exact numeric text',async()=>{const f=fixture();expect((await new AzureF0CostExtractionAdapter(f.options).extract(input)).warnings).toContain('OCR_PENDING');expect(f.poll).not.toHaveBeenCalled();f.next();const result=await new AzureF0CostExtractionAdapter(f.options).extract(input);expect(f.post).toHaveBeenCalledTimes(1);expect(result.fields.amount).toBe('9007199254740993');expect(result.reviewRequired).toBe(true);expect(result.providerLocations?.[0]?.confidence).toBe(0.83);expect(f.job()?.raw).toBeDefined()})
it('retains ambiguous POST delivery and never resends its job',async()=>{const f=fixture();f.post.mockRejectedValue(new Error('synthetic lost connection'));const adapter=new AzureF0CostExtractionAdapter(f.options);expect((await adapter.extract(input)).warnings).toContain('OCR_RESPONSE_UNCERTAIN');expect((await adapter.extract(input)).warnings).toContain('OCR_RESPONSE_UNCERTAIN');expect(f.post).toHaveBeenCalledTimes(1)})
it('resource-global monthly quota and persistent rate gate deny transport',async()=>{const f=fixture();vi.mocked(f.store.reserve).mockResolvedValue({blocked:'quota'});expect((await new AzureF0CostExtractionAdapter(f.options).extract(input)).warnings).toContain('OCR_FREE_QUOTA_EXHAUSTED');expect(f.post).not.toHaveBeenCalled();const g=fixture();vi.mocked(g.store.acquireDispatch).mockResolvedValue(null);expect((await new AzureF0CostExtractionAdapter(g.options).extract(input)).warnings).toContain('OCR_RATE_LIMITED');expect(g.post).not.toHaveBeenCalled()})
it('rejects foreign operation URLs and partial result pages',async()=>{const f=fixture();f.post.mockResolvedValue({status:202,operationUrl:'https://attacker.invalid/data',retryAfterSeconds:2});expect((await new AzureF0CostExtractionAdapter(f.options).extract(input)).warnings).toContain('OCR_RESPONSE_UNCERTAIN');expect(f.poll).not.toHaveBeenCalled();const g=fixture();await new AzureF0CostExtractionAdapter(g.options).extract(input);g.next();g.options.inspect.mockResolvedValue({sha256:hash,complete:true,pageCount:2});expect((await new AzureF0CostExtractionAdapter(g.options).extract(input)).warnings).toContain('OCR_COVERAGE_UNVERIFIED')})
it('ambiguous formatted number does not use provider float or fabricate confidence/currency/basis',async()=>{const f=fixture();await new AzureF0CostExtractionAdapter(f.options).extract(input);f.next();const response=await f.poll();response.body.analyzeResult.documents[0]!.fields.InvoiceTotal.content='1.234,56';delete (response.body.analyzeResult.documents[0]!.fields.InvoiceTotal as {confidence?:number}).confidence;f.poll.mockResolvedValue(response);const result=await new AzureF0CostExtractionAdapter(f.options).extract(input);expect(result.fields.amount).toBeUndefined();expect(result.fields.currencyCode).toBeUndefined();expect(result.fields.basis).toBeUndefined();expect(result.providerLocations?.[0]?.confidence).toBeUndefined();expect(result.warnings).toContain('NUMBER_FORMAT_REQUIRES_REVIEW')})
it('rechecks fresh scope immediately before send',async()=>{const f=fixture();f.options.authorize.mockResolvedValueOnce(true).mockResolvedValue(false);expect((await new AzureF0CostExtractionAdapter(f.options).extract(input)).warnings).toContain('OCR_SCOPE_CHANGED');expect(f.post).not.toHaveBeenCalled()})
it('prefers complete native text results, without F0 for a long document',async()=>{const f=fixture();f.options.inspect.mockResolvedValue({sha256:hash,complete:true,pageCount:8,nativeResult:{status:'needs_review',reviewRequired:true,fields:{amount:'100'},warnings:['TOTAL_REQUIRES_REVIEW'],sourceLocations:[],methodVersion:'synthetic-fixture-v1'}} as never);expect((await new AzureF0CostExtractionAdapter(f.options).extract(input)).fields.amount).toBe('100');expect(f.post).not.toHaveBeenCalled()})
it('REST sends bytes directly with explicit complete pages and redirect denial',async()=>{const fetcher=vi.fn(async(_url:unknown,request:RequestInit)=>{expect(request.redirect).toBe('error');return new Response('',{status:202,headers:{'operation-location':config.endpoint+'/documentintelligence/documentModels/prebuilt-invoice/analyzeResults/44444444-4444-4444-8444-444444444444?api-version=2024-11-30','retry-after':'2'}})});const transport=new AzureDocumentIntelligenceTransport(config.endpoint,()=> 'synthetic-key',fetcher as typeof fetch);await transport.post('prebuilt-invoice',input.bytes,1,dispatchLease('post'));const [,request]=fetcher.mock.calls[0]!;expect(JSON.parse(request.body as string)).toEqual({base64Source:Buffer.from(input.bytes).toString('base64')});expect(fetcher.mock.calls[0]?.[0]).toContain('pages=1')})

it('pins both transport and quota identity to the approved resource',async()=>{
 expect(()=>new AzureDocumentIntelligenceTransport('https://other.cognitiveservices.azure.com',()=> 'synthetic-key')).toThrow();
 const f=fixture();
 expect((await new AzureF0CostExtractionAdapter({...f.options,config:{...config,resourceId:'other'}}).extract(input)).status).toBe('unavailable');
 expect(f.post).not.toHaveBeenCalled();expect(f.store.reserve).not.toHaveBeenCalled();
});
it('authorizes before inspecting and releasing native hints',async()=>{
 const f=fixture();f.options.authorize.mockResolvedValue(false);
 f.options.inspect.mockResolvedValue({sha256:hash,complete:true,pageCount:1,nativeResult:{status:'needs_review',reviewRequired:true,fields:{amount:'100'},warnings:[],sourceLocations:[],methodVersion:'synthetic-fixture-v1'}} as never);
 expect((await new AzureF0CostExtractionAdapter(f.options).extract(input)).warnings).toContain('OCR_SCOPE_CHANGED');
 expect(f.options.inspect).not.toHaveBeenCalled();expect(f.store.reserve).not.toHaveBeenCalled();
});
it('separates identical bytes belonging to different immutable files',async()=>{
 const a=fixture(),b=fixture();
 await new AzureF0CostExtractionAdapter(a.options).extract(input);
 await new AzureF0CostExtractionAdapter(b.options).extract({...input,fileId:'55555555-5555-4555-8555-555555555555'});
 expect(vi.mocked(a.store.reserve).mock.calls[0]![0].key).not.toBe(vi.mocked(b.store.reserve).mock.calls[0]![0].key);
});
it('requires the persistent slot to enforce the stricter portal call limit',async()=>{
 const f=fixture();await new AzureF0CostExtractionAdapter(f.options).extract(input);
 expect(f.store.acquireDispatch).toHaveBeenCalledWith(config.resourceId,'post');
 f.next();await new AzureF0CostExtractionAdapter(f.options).extract(input);
 expect(f.store.acquireDispatch).toHaveBeenCalledWith(config.resourceId,'get');
});
it('honors long GET retry-after and pauses transient poll errors',async()=>{
 const f=fixture(),adapter=new AzureF0CostExtractionAdapter(f.options);
 await adapter.extract(input);f.next();
 f.poll.mockResolvedValue({status:429,body:null,retryAfterSeconds:7200} as never);
 expect((await adapter.extract(input)).warnings).toContain('OCR_RATE_LIMITED');
 f.next(3601_000);await adapter.extract(input);expect(f.poll).toHaveBeenCalledTimes(1);
 const g=fixture(),other=new AzureF0CostExtractionAdapter(g.options);
 await other.extract(input);g.next();g.poll.mockRejectedValue(new Error('synthetic timeout'));
 await other.extract(input);g.next();await other.extract(input);expect(g.poll).toHaveBeenCalledTimes(1);
});
it('rejects empty transport bytes before consulting credentials',async()=>{
 const credential=vi.fn(()=> 'synthetic-key'),fetcher=vi.fn();
 const transport=new AzureDocumentIntelligenceTransport(config.endpoint,credential,fetcher as typeof fetch);
 await expect(transport.post('prebuilt-invoice',new Uint8Array(),1,dispatchLease('post'))).rejects.toThrow();
 expect(credential).not.toHaveBeenCalled();expect(fetcher).not.toHaveBeenCalled();
});
it('supports HTTP-date retry-after without shortening the provider delay',async()=>{
 const timestamp=Date.UTC(2026,9,5),clock=vi.spyOn(Date,'now').mockReturnValue(timestamp);
 try{
 const fetcher=vi.fn(async()=>new Response(null,{status:429,headers:{'retry-after':new Date(timestamp+7200_000).toUTCString()}}));
 const transport=new AzureDocumentIntelligenceTransport(config.endpoint,()=> 'synthetic-key',fetcher as typeof fetch);
 expect((await transport.poll(config.endpoint+'/documentintelligence/documentModels/prebuilt-invoice/analyzeResults/44444444-4444-4444-8444-444444444444?api-version=2024-11-30',dispatchLease('get'))).retryAfterSeconds).toBe(7200);
 }finally{clock.mockRestore();}
});
it('routes quotes and contracts to layout without guessing invoice totals',async()=>{
 for(const documentKind of ['quote','contract']){
 const f=fixture();f.post.mockResolvedValue({status:202,operationUrl:config.endpoint+'/documentintelligence/documentModels/prebuilt-layout/analyzeResults/44444444-4444-4444-8444-444444444444?api-version=2024-11-30',retryAfterSeconds:2});
 const adapter=new AzureF0CostExtractionAdapter(f.options);
 await adapter.extract({...input,documentKind});f.next();
 f.poll.mockResolvedValue({status:200,body:{status:'succeeded',analyzeResult:{apiVersion:'2024-11-30',modelId:'prebuilt-layout',pages:[{pageNumber:1}],content:'synthetic quote text'}}} as never);
 const result=await adapter.extract({...input,documentKind});
 expect(f.post.mock.calls[0]![0]).toBe('prebuilt-layout');
 expect(result.status).toBe('needs_review');expect(result.fields).toEqual({});expect(f.job()?.raw).toBeDefined();
 }
});

it('rechecks scope after asynchronous provider evidence persistence',async()=>{
 const f=fixture(),adapter=new AzureF0CostExtractionAdapter(f.options);
 await adapter.extract(input);f.next();
 vi.mocked(f.store.complete).mockImplementation(async()=>{f.options.authorize.mockResolvedValue(false);});
 expect((await adapter.extract(input)).warnings).toContain('OCR_SCOPE_CHANGED');
});
it('denies operation redirects and foreign or decorated polling targets without credentials',async()=>{
 const credential=vi.fn(()=> 'synthetic-key'),fetcher=vi.fn();
 const transport=new AzureDocumentIntelligenceTransport(config.endpoint,credential,fetcher as typeof fetch);
 const path='/documentintelligence/documentModels/prebuilt-invoice/analyzeResults/44444444-4444-4444-8444-444444444444?api-version=2024-11-30';
 for(const url of ['https://attacker.invalid'+path,config.endpoint+path+'&extra=1',config.endpoint+path+'#fragment',config.endpoint+path.replace('2024-11-30','2023-07-31'),config.endpoint+path.replace('44444444-4444-4444-8444-444444444444','not-a-uuid')])
 await expect(transport.poll(url,dispatchLease('get'))).rejects.toThrow();
 expect(credential).not.toHaveBeenCalled();expect(fetcher).not.toHaveBeenCalled();
});
it('requires complete two-page coverage and never silently drops a page',async()=>{
 const f=fixture();f.options.inspect.mockResolvedValue({sha256:hash,complete:true,pageCount:2});
 const adapter=new AzureF0CostExtractionAdapter(f.options);await adapter.extract(input);f.next();
 expect((await adapter.extract(input)).warnings).toContain('OCR_COVERAGE_UNVERIFIED');
 expect(f.post.mock.calls[0]![2]).toBe(2);
});
it('keeps cached results behind fresh authorization',async()=>{
 const f=fixture(),adapter=new AzureF0CostExtractionAdapter(f.options);
 await adapter.extract(input);f.next();await adapter.extract(input);
 f.options.authorize.mockResolvedValue(false);
 expect((await adapter.extract(input)).warnings).toContain('OCR_SCOPE_CHANGED');
 expect(f.post).toHaveBeenCalledTimes(1);expect(f.poll).toHaveBeenCalledTimes(1);
});
it('bounds streamed provider JSON instead of retaining excessive evidence',async()=>{
 const fetcher=vi.fn(async()=>new Response(new Uint8Array(4_000_001),{status:200}));
 const transport=new AzureDocumentIntelligenceTransport(config.endpoint,()=> 'synthetic-key',fetcher as typeof fetch);
 await expect(transport.poll(config.endpoint+'/documentintelligence/documentModels/prebuilt-invoice/analyzeResults/44444444-4444-4444-8444-444444444444?api-version=2024-11-30',dispatchLease('get'))).rejects.toThrow('AZURE_RESULT_TOO_LARGE');
});

it('rechecks scope after the asynchronous send claim before transmitting',async()=>{
 const f=fixture();
 vi.mocked(f.store.claimSend).mockImplementation(async()=>{f.options.authorize.mockResolvedValue(false);return true;});
 expect((await new AzureF0CostExtractionAdapter(f.options).extract(input)).warnings).toContain('OCR_SCOPE_CHANGED');
 expect(f.post).not.toHaveBeenCalled();
});

it('denies a paused first sender when its lease expires before dispatch',async()=>{
 const f=fixture();vi.mocked(f.store.claimSend).mockImplementation(async()=>{f.next(21_000);return true})
 expect((await new AzureF0CostExtractionAdapter(f.options).extract(input)).warnings).toContain('OCR_RATE_LIMITED')
 expect(f.post).not.toHaveBeenCalled()
 expect(f.store.releaseDispatch).toHaveBeenCalledWith(expect.any(Object),'unused')
})
it('holds serialized resource ownership while another runner is paused, then releases unused',async()=>{
 const a=fixture(),b=fixture();let held=false
 const acquire=vi.fn(async(_resource:string,kind:'post'|'get')=>{if(held)return null;held=true;return dispatchLease(kind,a.options.now())})
 const release=vi.fn(async()=>{held=false})
 a.store.acquireDispatch=acquire;b.store.acquireDispatch=acquire;a.store.releaseDispatch=release;b.store.releaseDispatch=release
 let resume!:()=>void;const paused=new Promise<void>(resolve=>{resume=resolve})
 const original=a.store.claimSend
 a.store.claimSend=vi.fn(async key=>{await paused;return original(key)})
 const running=new AzureF0CostExtractionAdapter(a.options).extract(input)
 for(let tick=0;tick<15&&!held;tick++)await Promise.resolve()
 expect(held).toBe(true)
 expect((await new AzureF0CostExtractionAdapter(b.options).extract(input)).warnings).toContain('OCR_RATE_LIMITED')
 expect(b.post).not.toHaveBeenCalled()
 a.next(21_000);resume();await running
 expect(a.post).not.toHaveBeenCalled();expect(release).toHaveBeenCalled()
})
it('reports unknown POST outcome without retry or automatically releasing its resource grant',async()=>{
 const f=fixture();f.post.mockRejectedValue(new Error('synthetic timeout'));const adapter=new AzureF0CostExtractionAdapter(f.options)
 await adapter.extract(input);await adapter.extract(input)
 expect(f.store.releaseDispatch).toHaveBeenCalledWith(expect.any(Object),'uncertain')
 expect(f.post).toHaveBeenCalledTimes(1);expect(f.job()?.state).toBe('uncertain')
})
it('releases a known 429 response but preserves uncertain POST quota and honors poll retry',async()=>{
 const f=fixture();f.post.mockResolvedValue({status:429} as never)
 expect((await new AzureF0CostExtractionAdapter(f.options).extract(input)).warnings).toContain('OCR_RESPONSE_UNCERTAIN')
 expect(f.store.releaseDispatch).toHaveBeenCalledWith(expect.any(Object),'settled')
 expect(f.job()?.state).toBe('uncertain')
})
it('transport refuses stale, future, mismatched and absent grants before credentials or HTTP',async()=>{
 const credential=vi.fn(()=> 'synthetic-key'),fetcher=vi.fn(),transport=new AzureDocumentIntelligenceTransport(config.endpoint,credential,fetcher as typeof fetch)
 const valid=dispatchLease('post')
 for(const lease of [undefined,{...valid,expiresAt:valid.issuedAt-1},{...valid,issuedAt:valid.issuedAt+60_000,expiresAt:valid.issuedAt+80_000},{...valid,resourceId:'evil.invalid'},{...valid,kind:'get'},{...valid,token:'not-a-token'}]){
  await expect(transport.post('prebuilt-invoice',input.bytes,1,lease as never)).rejects.toThrow()
 }
 expect(credential).not.toHaveBeenCalled();expect(fetcher).not.toHaveBeenCalled()
})
it('transport vetoes expiry caused by synchronous credential preparation before fetch',async()=>{
 const now=Date.now(),clock=vi.spyOn(Date,'now').mockReturnValue(now)
 try{
  const grant=dispatchLease('post'),fetcher=vi.fn()
  const transport=new AzureDocumentIntelligenceTransport(config.endpoint,()=>{clock.mockReturnValue(now+21_000);return 'synthetic-key'},fetcher as typeof fetch)
  await expect(transport.post('prebuilt-invoice',input.bytes,1,grant)).rejects.toThrow('AZURE_DISPATCH_NOT_STARTED')
  expect(fetcher).not.toHaveBeenCalled()
 }finally{clock.mockRestore()}
})
it('bounds a hung transport even when a mocked fetch ignores its abort signal',async()=>{
 vi.useFakeTimers()
 try{
  const transport=new AzureDocumentIntelligenceTransport(config.endpoint,()=> 'synthetic-key',vi.fn(()=>new Promise<Response>(()=>{})) as typeof fetch)
  const pending=expect(transport.post('prebuilt-invoice',input.bytes,1,dispatchLease('post'))).rejects.toThrow('AZURE_DISPATCH_TIMEOUT')
  await vi.advanceTimersByTimeAsync(15_000);await pending
 }finally{vi.useRealTimers()}
})

it('rechecks scope after asynchronous lease release before exposing completed hints',async()=>{
 const f=fixture(),adapter=new AzureF0CostExtractionAdapter(f.options)
 await adapter.extract(input);f.next()
 vi.mocked(f.store.releaseDispatch).mockImplementation(async()=>{f.options.authorize.mockResolvedValue(false)})
 const result=await adapter.extract(input)
 expect(result.warnings).toContain('OCR_SCOPE_CHANGED');expect(result.fields).toEqual({});expect(f.store.complete).not.toHaveBeenCalled()
})
it('bounds and cancels a hung provider body while holding its lease',async()=>{
 vi.useFakeTimers()
 try{
  const cancel=vi.fn(),body=new ReadableStream<Uint8Array>({pull(){return new Promise<void>(()=>{})},cancel})
  const transport=new AzureDocumentIntelligenceTransport(config.endpoint,()=> 'synthetic-key',vi.fn(async()=>new Response(body,{status:200})) as typeof fetch)
  const pending=expect(transport.poll(config.endpoint+'/documentintelligence/documentModels/prebuilt-invoice/analyzeResults/44444444-4444-4444-8444-444444444444?api-version=2024-11-30',dispatchLease('get'))).rejects.toThrow('AZURE_DISPATCH_TIMEOUT')
  await vi.advanceTimersByTimeAsync(15_000);await pending;expect(cancel).toHaveBeenCalledTimes(1)
 }finally{vi.useRealTimers()}
})

it('retains old-month quota when post-CAS authorization crosses UTC midnight',async()=>{
 const f=fixture();f.next(Date.UTC(2026,9,31,23,59,58)-f.options.now())
 vi.mocked(f.store.claimSend).mockImplementation(async()=>{f.next(3000);return true})
 expect((await new AzureF0CostExtractionAdapter(f.options).extract(input)).warnings).toContain('OCR_RATE_LIMITED')
 expect(f.post).not.toHaveBeenCalled();expect(f.store.releaseDispatch).toHaveBeenCalledWith(expect.any(Object),'unused')
})
it('final transport guard refuses a same-TTL POST after UTC rollover',async()=>{
 const now=Date.UTC(2026,9,31,23,59,58),clock=vi.spyOn(Date,'now').mockReturnValue(now)
 try{
  const grant=dispatchLease('post'),fetcher=vi.fn()
  const transport=new AzureDocumentIntelligenceTransport(config.endpoint,()=>{clock.mockReturnValue(now+3000);return 'synthetic-key'},fetcher as typeof fetch)
  await expect(transport.post('prebuilt-invoice',input.bytes,1,grant)).rejects.toThrow('AZURE_DISPATCH_NOT_STARTED');expect(fetcher).not.toHaveBeenCalled()
 }finally{clock.mockRestore()}
})
