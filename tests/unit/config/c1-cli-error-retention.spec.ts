import {describe,expect,it,vi} from 'vitest'
import {readFileSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {EventEmitter} from 'node:events'
import {PassThrough} from 'node:stream'
import {workflowCliFailure,workflowCliDiagnostic,workflowWrapCliFailure,createWorkflowQuery} from '../../../scripts/c1-cost-workflow-rehearsal-transport.mjs'
const fixtures=JSON.parse(readFileSync(new URL('../../fixtures/costs/rehearsal/cli-error-envelopes.json',import.meta.url),'utf8')).cases
const sha='a'.repeat(64)
describe('installed CLI errors survive shared wrapper and JSON archive',()=>{
 it.each(fixtures)('$name retains primary independently of guard allowlist',(f)=>{
  const original=workflowCliFailure({...f,status:1,sqlSha256:sha})
  const wrapped=workflowWrapCliFailure('WORKFLOW_REHEARSAL_EXECUTION_FAILED',original)
  const dir=mkdtempSync(join(tmpdir(),'c1-cli-diag-'))
  try{
   const file=join(dir,'diagnostic.json');writeFileSync(file,JSON.stringify(workflowCliDiagnostic(wrapped)))
   const archived=JSON.parse(readFileSync(file,'utf8'))
   expect(archived).toEqual(wrapped.diagnostic)
   expect(archived.sqlstate).toBe(f.state)
   expect(archived.primaryMessage).toBe(f.message)
   expect(archived.location?.line??null).toBe(f.line)
   expect(archived.primaryMessageSha256).toMatch(/^[a-f0-9]{64}$/)
   expect(Buffer.byteLength(JSON.stringify(archived))).toBeLessThanOrEqual(2048)
   expect(JSON.stringify(archived)).not.toMatch(/customer-private|secret_table/)
  }finally{rmSync(dir,{recursive:true,force:true})}
 })
 it.each([
  "unexpected native failure\nSTATEMENT: select 'ERROR: P0001: WORKFLOW_REHEARSAL_ADMISSION_EXPIRED';",
  'ERROR: syntax error near "SQLSTATE P0001 WORKFLOW_REHEARSAL_ADMISSION_EXPIRED"',
  JSON.stringify({message:"query failed near 'SQLSTATE P0001'",details:'ERROR: P0001: WORKFLOW_REHEARSAL_ADMISSION_EXPIRED',query:'SQLSTATE P0001'}),
  JSON.stringify({_tag:'Error',error:{code:'LegacyDbQueryUnexpectedStatusError',message:'unexpected status 400: '+JSON.stringify({message:'query failed',query:'ERROR: P0001: WORKFLOW_REHEARSAL_ADMISSION_EXPIRED',hint:'SQLSTATE P0001'})}}),
  "progress\nselect 'SQLSTATE P0001';\nERROR: P0001: WORKFLOW_REHEARSAL_ADMISSION_EXPIRED\nPL/pgSQL function inline_code_block line 99 at RAISE",
 ])('does not classify quoted/query/detail content as primary: %s',(stderr)=>{
  const d=workflowCliDiagnostic(workflowCliFailure({stdout:'',stderr,status:1,sqlSha256:sha}))
  expect(d.sqlstate).toBeNull();expect(d.messageCode).toBeNull();expect(d.location).toBeNull()
 })
 it('retains bounded redacted ordinary messages without exporting secrets',()=>{
  const stderr='ERROR: 42601: syntax error near "private-value" password=secretvalue token=topsecret https://private.test/path\nSTATEMENT: select sensitive'
  const d=workflowCliDiagnostic(workflowCliFailure({stdout:'',stderr,status:1,sqlSha256:sha}))
  expect(d.primaryMessage).toContain('syntax error near')
  expect(JSON.stringify(d)).not.toMatch(/private-value|secretvalue|topsecret|private.test|sensitive/)
 })
 it('bounds a long multibyte primary without losing its fingerprint',()=>{
  const d=workflowCliDiagnostic(workflowCliFailure({stdout:'',stderr:'ERROR: 22000: '+ 'lỗi '.repeat(1000),status:1,sqlSha256:sha}))
  expect(d.primaryMessageTruncated).toBe(true)
  expect(Buffer.byteLength(d.primaryMessage)).toBeLessThanOrEqual(512)
  expect(d.primaryMessage).not.toContain('\ufffd')
  expect(Buffer.byteLength(JSON.stringify(d))).toBeLessThanOrEqual(2048)
 })
})
describe('every native command failure retains diagnostic metadata',()=>{
 function run(mode:string){
  const c=Object.assign(new EventEmitter(),{stdout:new PassThrough(),stderr:new PassThrough(),kill:vi.fn()})
  c.kill.mockImplementation(()=>{queueMicrotask(()=>c.emit('close',null));return true})
  const spawnProcess=()=>{if(mode==='spawn-sync')throw Error('synthetic spawn failure');queueMicrotask(()=>{
   if(mode==='unavailable'){c.emit('error',new Error('synthetic unavailable'));return}
   if(mode==='overflow'){c.stdout.write('x'.repeat(4*1024*1024+1));return}
   if(mode==='utf8')c.stdout.write(Buffer.from([0xc3]))
   else if(mode==='malformed')c.stdout.write('not json')
   else if(mode==='shape')c.stdout.write('{}')
   else if(mode==='exit'){c.stdout.write(fixtures[0].stdout);c.stderr.write(fixtures[0].stderr)}
   else if(mode==='timeout')return
   c.emit('close',mode==='exit'?1:0)
  });return c}
  return createWorkflowQuery({binary:'/approved/mock-only',env:{},spawnProcess})('select 1;',{timeoutMs:10}).catch(e=>e)
 }
 it.each(['unavailable','spawn-sync','overflow','utf8','malformed','shape','timeout','exit'])('%s attaches a diagnostic that survives wrap/serialize',async mode=>{
  const error=await run(mode),d=workflowCliDiagnostic(workflowWrapCliFailure(error.message,error))
  expect(d).not.toBeNull()
  expect(JSON.parse(JSON.stringify(d)).primaryMessage).toBeTruthy()
  if(mode==='timeout')expect(d.primaryMessage).toBe('Native query exceeded the client timeout')
  if(mode==='overflow')expect(d.primaryMessage).toBe('Native query exceeded the output limit')
  if(['unavailable','spawn-sync'].includes(mode))expect(d.primaryMessage).toBe('Native CLI could not be started')
  if(['utf8','malformed','shape'].includes(mode))expect(d.primaryMessage).toBe('Native CLI returned invalid result data')
  expect(d.sqlSha256).toMatch(/^[a-f0-9]{64}$/)
  if(mode==='exit'){expect(d.sqlstate).toBe('P0001');expect(d.location.line).toBe(80)}
 })
})

describe('quoted values cannot classify command categories or escape redaction',()=>{
 it.each(['Unauthorized: access token expired','Usage: unknown command','connect TLS timeout'])('ignores quoted category prose %s',value=>{
  const d=workflowCliDiagnostic(workflowCliFailure({stdout:'',stderr:'ERROR: syntax error near "'+value+'"',status:1,sqlSha256:sha}))
  expect(d.category).toBe('COMMAND');expect(d.sqlstate).toBeNull()
 })
 it.each(['ERROR: syntax error near "x\\"private-token"', 'ERROR: syntax error near "unterminated-private-token', "ERROR: syntax error near 'x''private-token'"])('redacts escaped or unfinished quoted values: %s',stderr=>{
  const d=workflowCliDiagnostic(workflowCliFailure({stdout:'',stderr,status:1,sqlSha256:sha}))
  expect(JSON.stringify(d)).not.toContain('private-token')
 })
 it('retains native primary if the owned finalizer detects a lost lock',async()=>{
  const c=Object.assign(new EventEmitter(),{stdout:new PassThrough(),stderr:new PassThrough()})
  let calls=0
  const query=createWorkflowQuery({binary:'/approved/mock',env:{},assertHeld:()=>{if(++calls===2)throw Error('WORKFLOW_REHEARSAL_LOCK_LOST')},spawnProcess:()=>{queueMicrotask(()=>{c.stdout.write(fixtures[0].stdout);c.emit('close',1)});return c}})
  const error=await query('select 1;').catch(e=>e)
  expect(error.message).toBe('WORKFLOW_REHEARSAL_LOCK_LOST')
  expect(workflowCliDiagnostic(error)).toMatchObject({sqlstate:'P0001',primaryMessage:'WORKFLOW_REHEARSAL_IMPLICIT_FUNCTION_UNREVIEWED'})
 })
})
