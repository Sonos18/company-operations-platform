import {createHash} from 'node:crypto'
import {readFileSync} from 'node:fs'
import {describe,it,expect,vi} from 'vitest'
import {azureF0ReservationKey} from '../../../server/features/costs/extraction/azure-f0-job-identity'
import {createAzureF0JobStore} from '../../../server/features/costs/extraction/azure-f0-job-store'
import {costExtractionResultSchema,type ExtractionResult} from '../../../shared/schemas/costs/cost-extraction'
const fixturePath='supabase/tests/database/c1/c1_cost_ocr_azure_f0_storage.test.sql'
const reportPath='docs/server/azure-f0-sql-test-packet.md'
const sql=readFileSync(fixturePath,'utf8')
const sha=(s:string)=>createHash('sha256').update(s).digest('hex')
interface Identity{
 name:string;config:string;companyId:string;projectId:string;fileId:string;sourceSha256:string;
 model:'prebuilt-invoice'|'prebuilt-layout';pages:number;pdfPageScope?:'1'|'1-2';expectedKey:string
}
interface Vector{name:string;accept:boolean;payload:{raw:unknown;result:ExtractionResult}}
interface Packet{
 status:string;base:string;fixtureSha256:string;assertions:number;cases:string[];
 sourceHashes:Record<string,string>;identities:Identity[];resultVectors:Vector[];
 directSql:{temporaryTables:string[];functions:string[];insertTargets:string[];updateTargets:string[];revokedFunctions:string[]};
 bounds:{evidenceFiles:number;jobRows:number;reservedPageUnits:number;ceiling:number};
}
function packet():Packet{
 let text=''
 try{text=readFileSync(reportPath,'utf8')}catch{/* Prepared report is required below. */}
 const match=text.match(/<!-- azure-sql-test-packet-manifest -->\s*\x60\x60\x60json\n([\s\S]*?)\n\x60\x60\x60/)
 expect(match,'exact ready source manifest must exist').not.toBeNull()
 return JSON.parse(match![1]!) as Packet
}
const resource='taskovia-doc-intelligence-dev.cognitiveservices.azure.com'
const targets=(expression:RegExp)=>[...new Set([...sql.matchAll(expression)].map(v=>v[1]!))].sort()
describe('unexecuted Azure SQL test packet',()=>{
 it('requires explicit PDF identity, coverage and cross-scope uncertainty scenarios',()=>{
  expect(sql).toContain('pdfPageScope')
  expect(sql).toContain('azurePdfCoverage')
  expect(sql).toContain('legacy submitted blocks new prefix')
  expect(sql).toContain('legacy completed PDF blocks scoped claim')
 })
 it('pins the committed source and labels SQL as unexecuted',()=>{
  const p=packet()
  expect(p.status).toBe('SQL_UNEXECUTED')
  expect(p.base).toBe('bac0f137e6f50df2f947fc0d3817be367f7f6737')
  expect(p.fixtureSha256).toBe(sha(sql))
  for(const [path,hash] of Object.entries(p.sourceHashes))expect(sha(readFileSync(path,'utf8')),path).toBe(hash)
 })
 it('binds every top-level assertion to a fixed plan without skipped cases',()=>{
  const p=packet(),assertions=sql.match(/^select (?:is|ok|throws_ok|lives_ok)\(/gm)??[]
  expect(assertions).toHaveLength(p.assertions)
  expect(p.cases).toHaveLength(p.assertions)
  expect(new Set(p.cases).size).toBe(p.assertions)
  expect(sql).toContain('select plan('+p.assertions+');')
  for(const description of p.cases)expect(sql).toContain("'"+description.replaceAll("'","''")+"')")
  expect(sql).not.toMatch(/\b(?:no_plan|todo|skip)\s*\(/i)
 })
 it('contains one rollback transaction with bounded local limits and guards before writes',()=>{
  expect(sql.match(/^begin;/gm)).toHaveLength(1)
  expect(sql.match(/^rollback;/gm)).toHaveLength(1)
  expect(sql.trim().endsWith('rollback;')).toBe(true)
  expect(sql).toContain("set local lock_timeout='5s';")
  expect(sql).toContain("set local statement_timeout='90s';")
  expect(sql).toContain("set local idle_in_transaction_session_timeout='120s';")
  expect(sql).toContain('select * from finish(true);')
  const firstInsert=sql.indexOf('\ninsert into ')
  for(const guard of ['AZURE_FIXTURE_RESOURCE_NOT_EMPTY','AZURE_FIXTURE_ID_COLLISION','AZURE_FIXTURE_TRIGGER_REVIEW_REQUIRED','AZURE_FIXTURE_SEQUENCE_REVIEW_REQUIRED','AZURE_FIXTURE_MONTH_BOUNDARY','AZURE_FIXTURE_EVENT_TRIGGER_REVIEW_REQUIRED','AZURE_FIXTURE_FRESH_SESSION_REQUIRED'])
   {expect(sql.indexOf(guard),guard).toBeGreaterThanOrEqual(0);expect(sql.indexOf(guard),guard).toBeLessThan(firstInsert)}
  expect(sql).not.toMatch(/^(?:commit|delete|truncate|drop|alter|grant|create extension|create sequence|set session_replication_role)\b/gim)
  expect(sql).not.toMatch(/\b(?:nextval|setval|pg_sleep)\s*\(/i)
 })
 it('matches the exact direct DDL and DML inventory',()=>{
  const p=packet().directSql
  expect(targets(/^create temporary table ([a-z_]+)/gm)).toEqual([...p.temporaryTables].sort())
  expect(targets(/^create function ([a-z0-9_.]+)/gm)).toEqual([...p.functions].sort())
  expect(p.functions.every(v=>v.startsWith('pg_temp.'))).toBe(true)
  expect(targets(/^insert into ([a-z0-9_.]+)/gm)).toEqual([...p.insertTargets].sort())
  expect(targets(/^update ([a-z0-9_.]+)/gm)).toEqual([...p.updateTargets].sort())
  expect(targets(/^revoke all on function ([a-z0-9_.]+)/gm)).toEqual([...p.revokedFunctions].sort())
  expect(sql).toContain('from public,anon,authenticated,service_role;')
  expect(sql).toContain('set local role authenticated;')
  expect(sql).toContain('reset role;')
 })
 it('binds golden SQL identity values to the actual TypeScript contract',()=>{
  for(const c of packet().identities){
   const key=azureF0ReservationKey({resourceId:resource,configurationVersion:c.config,scope:{companyId:c.companyId,projectId:c.projectId},
    fileId:c.fileId,sha256:c.sourceSha256,model:c.model,pages:c.pages,...(c.pdfPageScope?{pdfPageScope:c.pdfPageScope}:{})})
   expect(key,c.name).toBe(c.expectedKey)
   expect(sql).toContain("'"+c.expectedKey+"'")
  }
 })
 it('checks SQL completion examples against shared review and coverage validation',()=>{
  const vectors=packet().resultVectors
  expect(vectors.some(v=>v.name==='matched-first-page'&&v.accept)).toBe(true)
  expect(vectors.some(v=>v.name==='matched-two-pages'&&v.accept)).toBe(true)
  expect(vectors.some(v=>v.name==='honest-unavailable'&&v.accept)).toBe(true)
  for(const v of vectors){
   expect(costExtractionResultSchema.safeParse(v.payload.result).success,v.name).toBe(v.accept)
   expect(sql,v.name).toContain("'"+JSON.stringify(v.payload).replaceAll("'","''")+"'::jsonb")
  }
 })
 it('forwards golden fixture reservations only through a freshly authorized mock RPC',async()=>{
  const p=packet(),c=p.identities.find(v=>v.name==='pdf-two-pages')!
  const binding={actorId:'c1f60000-0000-4000-8000-000000000901',tenantId:'c1f60000-0000-4000-8000-000000000010',
   companyId:c.companyId,projectId:c.projectId,fileId:c.fileId,fileVersion:1,sha256:c.sourceSha256,requestId:null,requestVersion:null}
  const authorize=vi.fn(async()=>true),rpc=vi.fn(async()=>({data:{job:{key:c.expectedKey,state:'reserved'}},error:null}))
  const store=createAzureF0JobStore({binding,rpc,authorize})
  const reservation={key:c.expectedKey,resourceId:resource,configurationVersion:c.config,month:'2026-10',pages:c.pages,limit:p.bounds.ceiling,
   scope:{companyId:c.companyId,projectId:c.projectId},fileId:c.fileId,sha256:c.sourceSha256,model:c.model,pdfPageScope:c.pdfPageScope}
  await expect(store.reserve(reservation)).resolves.toMatchObject({job:{key:c.expectedKey}})
  expect(rpc).toHaveBeenCalledExactlyOnceWith('c1_cost_ocr_azure_f0_job',{p_command:'reserve',p_binding:binding,p_payload:reservation})
  authorize.mockResolvedValue(false)
  await expect(store.reserve(reservation)).rejects.toThrow('AZURE_STORE_SCOPE_CHANGED')
  expect(rpc).toHaveBeenCalledTimes(1)
 })
 it('records small synthetic row/page bounds and explicit sequence/temporary grant effects',()=>{
  const p=packet(),report=readFileSync(reportPath,'utf8')
  expect(p.bounds).toEqual({evidenceFiles:6,jobRows:7,reservedPageUnits:10,ceiling:25})
  for(const name of ['__tcache__','__tcache___id_seq','__tresults___numb_seq','PUBLIC','audit_events','SQL_UNEXECUTED'])expect(report).toContain(name)
 })
})
