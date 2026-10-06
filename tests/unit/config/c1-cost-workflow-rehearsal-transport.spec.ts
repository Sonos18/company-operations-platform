import {workflowSnapshotPairSql} from '../../../scripts/c1-cost-workflow-rehearsal-snapshot-pair.mjs'
import {workflowNativeSnapshotSql} from '../../../scripts/c1-cost-workflow-rehearsal-native.mjs'
import {describe,expect,it,vi} from 'vitest'
import {EventEmitter} from 'node:events'
import {PassThrough} from 'node:stream'
import {existsSync,readFileSync,mkdtempSync,mkdirSync,writeFileSync,rmSync,symlinkSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {readWorkflowLinkMetadata,assertWorkflowLinkUnchanged,workflowLinkedEndpoint} from '../../../scripts/c1-cost-workflow-rehearsal-link.mjs'
import {acquireWorkflowValidationLock,createWorkflowQuery} from '../../../scripts/c1-cost-workflow-rehearsal-transport.mjs'
function child(){
 const result=Object.assign(new EventEmitter(),{stdin:new PassThrough(),stdout:new PassThrough(),stderr:new PassThrough(),kill:vi.fn()})
 const end=vi.spyOn(result.stdin,'end').mockImplementation(()=>{queueMicrotask(()=>result.emit('close',0));return result.stdin})
 result.kill.mockImplementation(()=>{queueMicrotask(()=>result.emit('close',null));return true})
 return {result,end}
}
describe('owned rehearsal process lifecycle',()=>{
 it('collects split lock acknowledgement and releases exactly its holder',async()=>{const c=child(),spawnProcess=vi.fn(()=>{queueMicrotask(()=>{c.result.stdout.write('LOCK');c.result.stdout.write('ED\n')});return c.result});const lease=await acquireWorkflowValidationLock({spawnProcess,platform:'linux'});expect(spawnProcess.mock.calls[0]![1]).toContain('/data/remote-jobs/validation.lock');lease.assertHeld();await lease.release();expect(c.end).toHaveBeenCalledTimes(1);expect(()=>lease.assertHeld()).toThrow('LOCK_LOST')})
 it('reaps invalid lock admissions instead of leaving flock on stdin',async()=>{const c=child(),spawnProcess=vi.fn(()=>{queueMicrotask(()=>c.result.stdout.write('INVALID\n'));return c.result});await expect(acquireWorkflowValidationLock({spawnProcess,platform:'linux'})).rejects.toThrow('LOCK_INVALID');expect(c.end).toHaveBeenCalledTimes(1)})
 it('runs only the frozen native binary with its own DEV link and clears target overrides',async()=>{
  const c=child();let directory=''
  const spawnProcess=vi.fn((binary:string,args:string[],options:{cwd:string;env:Record<string,string>})=>{
   expect(binary).toBe('/approved/mock-supabase');expect(args.slice(0,5)).toEqual(['db','query','--linked','--output-format','json']);directory=join(args[args.indexOf('--file')+1]!, '..')
   expect(options.cwd).toBe('/data/remote-worktrees/task1-task2-integration')
   expect(options.env.SUPABASE_PROJECT_ID).toBeUndefined();expect(options.env.PGPASSWORD).toBeUndefined();expect(options.env.SUPABASE_ACCESS_TOKEN).toBe('synthetic-test-token')
   const sql=readFileSync(args[args.indexOf('--file')+1]!,'utf8');expect(sql).toContain("set local transaction_timeout='15s'")
   queueMicrotask(()=>{c.result.stdout.write(JSON.stringify({rows:[]}));c.result.emit('close',0)});return c.result
  })
  const query=createWorkflowQuery({cwd:process.cwd(),binary:'/approved/mock-supabase',env:{SUPABASE_PROJECT_ID:'foreign',PGPASSWORD:'synthetic',SUPABASE_ACCESS_TOKEN:'synthetic-test-token'},spawnProcess})
  await expect(query('select 1;')).resolves.toEqual({rows:[]});expect(existsSync(directory)).toBe(false)
 })
 it('kills its native child and cleans only its directory on output overflow',async()=>{const c=child();let directory='';const spawnProcess=vi.fn((_binary:string,_args:string[],_options:{cwd:string})=>{directory=join(_args[_args.indexOf('--file')+1]!, '..');queueMicrotask(()=>c.result.stdout.write('x'.repeat(4*1024*1024+1)));return c.result});const query=createWorkflowQuery({cwd:process.cwd(),binary:'/approved/mock',env:{},spawnProcess});await expect(query('select 1;')).rejects.toThrow('OUTPUT_LIMIT');expect(c.result.kill).toHaveBeenCalledWith('SIGKILL');expect(existsSync(directory)).toBe(false)})
 it('bounds client time and terminates only the invocation child',async()=>{vi.useFakeTimers();try{const c=child(),spawnProcess=vi.fn(()=>c.result),query=createWorkflowQuery({cwd:process.cwd(),binary:'/approved/mock',env:{},spawnProcess});const checked=expect(query('select 1;',{timeoutMs:50})).rejects.toThrow('CLIENT_TIMEOUT');await vi.advanceTimersByTimeAsync(51);await checked;expect(c.result.kill).toHaveBeenCalledTimes(1)}finally{vi.useRealTimers()}})
})

describe('sanitized CLI diagnostic boundaries',()=>{
 it.each(['stdout','stderr'])('classifies authentication failure from %s without exposing payload',async(stream)=>{
  const c=child(),spawnProcess=vi.fn(()=>{queueMicrotask(()=>{c.result[stream as 'stdout'|'stderr'].write('Unauthorized 401 synthetic-private-error-value');c.result.emit('close',1)});return c.result})
  const query=createWorkflowQuery({cwd:process.cwd(),binary:'/approved/mock',env:{},spawnProcess})
  await expect(query('select 1;')).rejects.toThrow('WORKFLOW_REHEARSAL_EXECUTION_FAILED:AUTH_REJECTED')
 })
})

describe('installed CLI JSON envelope compatibility',()=>{
 it.each([{rows:[]},{rows:[{value:'synthetic-control-result'}]}])('normalizes installed CLI row arrays %j',async({rows})=>{
  const c=child(),spawnProcess=vi.fn(()=>{queueMicrotask(()=>{c.result.stdout.write(JSON.stringify(rows));c.result.emit('close',0)});return c.result})
  const query=createWorkflowQuery({cwd:process.cwd(),binary:'/approved/mock',env:{},spawnProcess})
  await expect(query('select 1;')).resolves.toEqual({rows})
 })
 it.each([null,{},{rows:null},'synthetic-invalid'])('refuses malformed envelopes %j',async response=>{
  const c=child(),spawnProcess=vi.fn(()=>{queueMicrotask(()=>{c.result.stdout.write(JSON.stringify(response));c.result.emit('close',0)});return c.result})
  const query=createWorkflowQuery({cwd:process.cwd(),binary:'/approved/mock',env:{},spawnProcess})
  await expect(query('select 1;')).rejects.toThrow('RESULT_INVALID')
 })
})

describe('retained link transport admission',()=>{
 function linked(){
  const root=mkdtempSync(join(tmpdir(),'c1cw-link-test-'))
  mkdirSync(join(root,'supabase/.temp/pgdelta'),{recursive:true});mkdirSync(join(root,'supabase/templates'),{recursive:true})
  for(const name of ['config.toml','templates/invite.html','templates/recovery.html'])writeFileSync(join(root,'supabase',name),'synthetic nonsecret config')
  writeFileSync(join(root,'supabase/.temp/project-ref'),'gtgljlnhwvhqdnwrfdfj')
  writeFileSync(join(root,'supabase/.temp/pooler-url'),'postgresql://postgres.gtgljlnhwvhqdnwrfdfj@aws-0-test.pooler.supabase.com:5432/postgres')
  writeFileSync(join(root,'supabase/.temp/linked-project.json'),JSON.stringify({name:'synthetic-dev',organization_id:'synthetic-org',organization_slug:'synthetic-org',ref:'gtgljlnhwvhqdnwrfdfj'}))
  return root
 }
 it.each([
  'postgresql://postgres.gtgljlnhwvhqdnwrfdfj:secret@aws-0-test.pooler.supabase.com:5432/postgres',
  'postgresql://postgres.gtgljlnhwvhqdnwrfdfj@aws-0-test.pooler.supabase.com.evil:5432/postgres',
  'postgresql://postgres.foreign@aws-0-test.pooler.supabase.com:5432/postgres',
  'postgresql://postgres.gtgljlnhwvhqdnwrfdfj@aws-0-test.pooler.supabase.com:6543/postgres',
  'postgresql://postgres.gtgljlnhwvhqdnwrfdfj@aws-0-test.pooler.supabase.com:5432/postgres?host=foreign',
 ])('rejects a foreign or credential-bearing cached endpoint before spawn: %s',async(url)=>{
  const root=linked(),spawnProcess=vi.fn()
  try{
   writeFileSync(join(root,'supabase/.temp/pooler-url'),url)
   await expect(async()=>createWorkflowQuery({linkRoot:root,binary:'/mock',env:{},spawnProcess})('select 1;')).rejects.toThrow('WORKFLOW_REHEARSAL_LINK')
   expect(spawnProcess).not.toHaveBeenCalled()
  }finally{rmSync(root,{recursive:true,force:true})}
 })
 it('rejects post-child pgdelta metadata drift and reaps its SQL directory',async()=>{
  const root=linked(),c=child();let file=''
  try{
   const spawnProcess=vi.fn((_binary:string,args:string[])=>{file=args[args.indexOf('--file')+1]!;writeFileSync(join(root,'supabase/.temp/pgdelta/changed'),'synthetic');queueMicrotask(()=>{c.result.stdout.write('[]');c.result.emit('close',0)});return c.result})
   const query=createWorkflowQuery({linkRoot:root,binary:'/mock',env:{},spawnProcess})
   await expect(query('select 1;')).rejects.toThrow('WORKFLOW_REHEARSAL_LINK_CHANGED')
   expect(existsSync(file)).toBe(false)
  }finally{rmSync(root,{recursive:true,force:true})}
 })

 it.each([
  '{"name":"dev","organization_id":"org","organization_slug":"org","ref":"foreign","ref":"gtgljlnhwvhqdnwrfdfj"}',
  '{"name":"dev","organization_id":"org","organization_slug":"org","ref":"gtgljlnhwvhqdnwrfdfj","extra":{}}',
  '{"name":"dev","organization_id":{},"organization_slug":"org","ref":"gtgljlnhwvhqdnwrfdfj"}',
 ])('rejects duplicate, nested or unknown linked-project data: %s',json=>{
  const root=linked()
  try{writeFileSync(join(root,'supabase/.temp/linked-project.json'),json);expect(()=>readWorkflowLinkMetadata(root)).toThrow('WORKFLOW_REHEARSAL_LINK_PROJECT')}
  finally{rmSync(root,{recursive:true,force:true})}
 })
 it('freezes nonsecret content hashes and opaque cache metadata without retaining opaque content',()=>{
  const root=linked()
  try{
   const opaque='synthetic-opaque-cache-content'
   writeFileSync(join(root,'supabase/.temp/opaque-cache'),opaque)
   const frozen=readWorkflowLinkMetadata(root)
   expect(JSON.stringify(frozen)).not.toContain(opaque)
   expect(frozen.cache['supabase/.temp/pgdelta'].kind).toBe('directory')
   expect(frozen.contentHashes['supabase/.temp/pooler-url']).toMatch(/^[a-f0-9]{64}$/)
   writeFileSync(join(root,'supabase/.temp/opaque-cache'),opaque+'changed')
   expect(()=>assertWorkflowLinkUnchanged(root,frozen)).toThrow('WORKFLOW_REHEARSAL_LINK_CHANGED')
  }finally{rmSync(root,{recursive:true,force:true})}
 })
 it('rejects link drift before a native child is spawned',async()=>{
  const root=linked(),spawnProcess=vi.fn()
  try{
   const query=createWorkflowQuery({linkRoot:root,binary:'/mock',env:{},spawnProcess})
   writeFileSync(join(root,'supabase/config.toml'),'changed')
   await expect(query('select 1;')).rejects.toThrow('WORKFLOW_REHEARSAL_LINK_CHANGED')
   expect(spawnProcess).not.toHaveBeenCalled()
  }finally{rmSync(root,{recursive:true,force:true})}
 })
 it('checks the held lock before and after a native child',async()=>{
  const root=linked(),c=child(),assertHeld=vi.fn()
  try{
   const spawnProcess=vi.fn(()=>{queueMicrotask(()=>{c.result.stdout.write('[]');c.result.emit('close',0)});return c.result})
   await createWorkflowQuery({linkRoot:root,binary:'/mock',env:{},spawnProcess,assertHeld})('select 1;')
   expect(assertHeld).toHaveBeenCalledTimes(2)
  }finally{rmSync(root,{recursive:true,force:true})}
 })
 it('admits only the canonical official direct endpoint with user postgres',()=>{
  expect(workflowLinkedEndpoint('postgres://postgres@db.gtgljlnhwvhqdnwrfdfj.supabase.co:5432/postgres').kind).toBe('official-direct')
  expect(()=>workflowLinkedEndpoint('postgres://postgres.gtgljlnhwvhqdnwrfdfj@db.gtgljlnhwvhqdnwrfdfj.supabase.co:5432/postgres')).toThrow('WORKFLOW_REHEARSAL_LINK_ENDPOINT')
 })
 it('rejects symlinked cache entries without following their contents',async()=>{
  const root=linked()
  try{
   symlinkSync(join(root,'supabase/.temp/project-ref'),join(root,'supabase/.temp/opaque-cache'))
   await expect(async()=>createWorkflowQuery({linkRoot:root,binary:'/mock',env:{},spawnProcess:vi.fn()})('select 1;')).rejects.toThrow('WORKFLOW_REHEARSAL_LINK')
  }finally{rmSync(root,{recursive:true,force:true})}
 })
})

describe('full-snapshot-only 8 MiB output allowance',()=>{
 function payload(bytes:number){const prefix='[{"padding":"',suffix='"}]';return prefix+'x'.repeat(bytes-Buffer.byteLength(prefix+suffix))+suffix}
 function queryFor(output:string,stderr=''){const c=child();let file='';const spawnProcess=vi.fn((_binary:string,args:string[])=>{file=args[args.indexOf('--file')+1]!;queueMicrotask(()=>{c.result.stdout.write(output);if(stderr)c.result.stderr.write(stderr);c.result.emit('close',0)});return c.result});return {c,getFile:()=>file,query:createWorkflowQuery({binary:'/approved/mock',env:{},spawnProcess})}}
 it('accepts a complete full-snapshot envelope over 4 MiB and below 8 MiB',async()=>{const q=queryFor(payload(4*1024*1024+1));const result=await q.query(workflowNativeSnapshotSql);expect(result.rows[0].padding.length).toBe(4*1024*1024+1-Buffer.byteLength('[{"padding":""}]'));expect(q.c.result.kill).not.toHaveBeenCalled();expect(existsSync(q.getFile())).toBe(false)})
 it('accepts exactly 8 MiB inclusive for the exact reviewed full snapshot',async()=>{const q=queryFor(payload(8*1024*1024));const result=await q.query(workflowNativeSnapshotSql);expect(result.rows).toHaveLength(1);expect(q.c.result.kill).not.toHaveBeenCalled()})
 it('rejects 8 MiB plus one byte and reaps only its child and SQL file',async()=>{const q=queryFor(payload(8*1024*1024+1));await expect(q.query(workflowNativeSnapshotSql)).rejects.toThrow('OUTPUT_LIMIT');expect(q.c.result.kill).toHaveBeenCalledTimes(1);expect(existsSync(q.getFile())).toBe(false)})
 it('counts snapshot stderr and stdout together against 8 MiB',async()=>{const q=queryFor(payload(8*1024*1024),'x');await expect(q.query(workflowNativeSnapshotSql)).rejects.toThrow('OUTPUT_LIMIT')})
 it.each(['select 1;','/*c1cw-11111111-1111-4111-8111-111111111111*/begin;rollback;'])('keeps other control and batch output capped at 4 MiB: %s',async(sql)=>{const q=queryFor(payload(4*1024*1024+1));await expect(q.query(sql)).rejects.toThrow('OUTPUT_LIMIT')})
 it('does not grant 8 MiB to a modified snapshot or arbitrary read-only query',async()=>{const q=queryFor(payload(4*1024*1024+1));await expect(q.query(workflowNativeSnapshotSql+'\n')).rejects.toThrow('OUTPUT_LIMIT')})
 it('rejects truncated JSON below the snapshot ceiling instead of accepting partial rows',async()=>{const q=queryFor(payload(5*1024*1024).slice(0,-1));await expect(q.query(workflowNativeSnapshotSql)).rejects.toThrow('RESULT_INVALID')})
})

describe('byte-exact native output decoding',()=>{
 it('preserves a multibyte UTF8 field split between native stdout chunks',async()=>{const c=child(),text=JSON.stringify([{value:'b\u1ea3o h\u00e0nh'}]),bytes=Buffer.from(text),split=bytes.indexOf(Buffer.from('\u1ea3'))+1;const spawnProcess=vi.fn(()=>{queueMicrotask(()=>{c.result.stdout.write(bytes.subarray(0,split));c.result.stdout.write(bytes.subarray(split));c.result.emit('close',0)});return c.result});const query=createWorkflowQuery({binary:'/approved/mock',env:{},spawnProcess});expect(await query('select 1;')).toEqual({rows:[{value:'b\u1ea3o h\u00e0nh'}]})})
 it('rejects a truncated UTF8 character even when outer JSON punctuation is present',async()=>{const c=child(),bytes=Buffer.concat([Buffer.from('[{"value":"'),Buffer.from([0xc3]),Buffer.from('"}]')]);const spawnProcess=vi.fn(()=>{queueMicrotask(()=>{c.result.stdout.write(bytes);c.result.emit('close',0)});return c.result});const query=createWorkflowQuery({binary:'/approved/mock',env:{},spawnProcess});await expect(query('select 1;')).rejects.toThrow('RESULT_INVALID')})
})

describe('bounded retained CLI primary diagnostics',()=>{
 it.each(['ERROR: P0001:','SQLSTATE P0001','json'])('extracts PostgreSQL primary state from native error form %s',async(prefix)=>{const c=child(),spawnProcess=vi.fn(()=>{queueMicrotask(()=>{const message='WORKFLOW_REHEARSAL_ADMISSION_EXPIRED\nCONTEXT: PL/pgSQL function inline_code_block line 2 at RAISE\nSQL: synthetic-private-token=abc123';c.result.stderr.write(prefix==='json'?JSON.stringify({code:'P0001',message:'ERROR: '+message}):prefix+' '+message);c.result.emit('close',1)});return c.result}),q=createWorkflowQuery({binary:'/approved/mock',env:{},spawnProcess});const error=await q('select 1;').catch(e=>e);expect(error.message).toBe('WORKFLOW_REHEARSAL_EXECUTION_FAILED:PG_P0001');expect(error.diagnostic.sqlstate).toBe('P0001');expect(error.diagnostic.messageCode).toBe('WORKFLOW_REHEARSAL_ADMISSION_EXPIRED');expect(error.diagnostic.location).toEqual({kind:'plpgsql',function:'inline_code_block',line:2,operation:'RAISE'});expect(JSON.stringify(error)).not.toContain('synthetic-private');expect(Buffer.byteLength(JSON.stringify(error.diagnostic))).toBeLessThanOrEqual(2048);expect(error.diagnostic.stderr.sanitizedSummary).toContain('ADMISSION_EXPIRED')})
 it('retains bounded unknown-command metadata while withholding unknown prose and statements',async()=>{const c=child(),spawnProcess=vi.fn(()=>{queueMicrotask(()=>{c.result.stderr.write('synthetic-private-token=abc123 sql=SELECT synthetic-private-body');c.result.emit('close',1)});return c.result}),q=createWorkflowQuery({binary:'/approved/mock',env:{},spawnProcess});const error=await q('select 1;').catch(e=>e);expect(error.message).toBe('WORKFLOW_REHEARSAL_EXECUTION_FAILED:COMMAND');expect(error.diagnostic.category).toBe('COMMAND');expect(error.diagnostic.sqlstate).toBeNull();expect(error.diagnostic.stderr.bytes).toBeGreaterThan(0);expect(error.diagnostic.stderr.sha256).toMatch(/^[a-f0-9]{64}$/);expect(JSON.stringify(error)).not.toContain('synthetic-private')})
 it('does not export arbitrary secret-like guard names or function names',async()=>{const c=child(),spawnProcess=vi.fn(()=>{queueMicrotask(()=>{c.result.stderr.write('ERROR: 42601: WORKFLOW_REHEARSAL_SYNTHETIC_PRIVATE_TOKEN\nPL/pgSQL function synthetic_private_function() line 7 at SQL statement');c.result.emit('close',1)});return c.result}),q=createWorkflowQuery({binary:'/approved/mock',env:{},spawnProcess});const error=await q('select 1;').catch(e=>e);expect(error.diagnostic.messageCode).toBeNull();expect(error.diagnostic.location.line).toBe(7);expect(error.diagnostic.location.functionSha256).toMatch(/^[a-f0-9]{64}$/);expect(JSON.stringify(error)).not.toMatch(/SYNTHETIC_PRIVATE|synthetic_private/)})
})

describe('primary diagnostic attribution excludes dumped SQL',()=>{
 it('keeps actual syntax state and ignores guard literals in a dumped batch',async()=>{const c=child(),spawnProcess=vi.fn(()=>{queueMicrotask(()=>{c.result.stderr.write("ERROR: 42601: syntax error at or near private-name\nSTATEMENT: do $$ begin raise exception 'WORKFLOW_REHEARSAL_ADMISSION_EXPIRED';\nraise exception 'WORKFLOW_REHEARSAL_SEQUENCE_BUDGET';\nSQLSTATE P0001\nPL/pgSQL function inline_code_block line 2 at RAISE");c.result.emit('close',1)});return c.result}),q=createWorkflowQuery({binary:'/approved/mock',env:{},spawnProcess});const error=await q('select 1;').catch(e=>e);expect(error.diagnostic.sqlstate).toBe('42601');expect(error.diagnostic.messageCode).toBeNull();expect(error.diagnostic.location).toBeNull();expect(JSON.stringify(error)).not.toContain('private-name')})
 it('does not infer SQLSTATE or guard code from a statement without a recognized primary error',async()=>{const c=child(),spawnProcess=vi.fn(()=>{queueMicrotask(()=>{c.result.stderr.write("unexpected native failure\nSTATEMENT: select 'SQLSTATE P0001 WORKFLOW_REHEARSAL_ADMISSION_EXPIRED';");c.result.emit('close',1)});return c.result}),q=createWorkflowQuery({binary:'/approved/mock',env:{},spawnProcess});const error=await q('select 1;').catch(e=>e);expect(error.diagnostic.sqlstate).toBeNull();expect(error.diagnostic.messageCode).toBeNull();expect(error.message).toBe('WORKFLOW_REHEARSAL_EXECUTION_FAILED:COMMAND')})
 it('uses only the JSON primary message and ignores DETAIL and HINT guard literals',async()=>{const c=child(),spawnProcess=vi.fn(()=>{queueMicrotask(()=>{c.result.stderr.write(JSON.stringify({code:'42601',message:'ERROR: syntax error',details:"SQLSTATE P0001 WORKFLOW_REHEARSAL_ADMISSION_EXPIRED",hint:'WORKFLOW_REHEARSAL_SEQUENCE_BUDGET'}));c.result.emit('close',1)});return c.result}),q=createWorkflowQuery({binary:'/approved/mock',env:{},spawnProcess});const error=await q('select 1;').catch(e=>e);expect(error.diagnostic.sqlstate).toBe('42601');expect(error.diagnostic.messageCode).toBeNull()})
})

describe('SQLSTATE attribution excludes quoted message tokens',()=>{
 it.each(['json','native'])('uses explicit state rather than quoted SQLSTATE text in %s error',async(kind)=>{const c=child(),spawnProcess=vi.fn(()=>{queueMicrotask(()=>{c.result.stderr.write(kind==='json'?JSON.stringify({code:'42601',message:'ERROR: syntax error at or near "SQLSTATE P0001"'}):'ERROR: syntax error at or near "SQLSTATE P0001" (SQLSTATE 42601)');c.result.emit('close',1)});return c.result}),q=createWorkflowQuery({binary:'/approved/mock',env:{},spawnProcess});const error=await q('select 1;').catch(e=>e);expect(error.diagnostic.sqlstate).toBe('42601');expect(error.message).toBe('WORKFLOW_REHEARSAL_EXECUTION_FAILED:PG_42601');expect(error.diagnostic.messageCode).toBeNull()})
})


describe('byte-pinned paired-snapshot output allowance',()=>{
 function payload(bytes:number){const prefix='[{"padding":"',suffix='"}]';return prefix+'x'.repeat(bytes-Buffer.byteLength(prefix+suffix))+suffix}
 function queryFor(output:string,stderr=''){const c=child(),spawnProcess=vi.fn(()=>{queueMicrotask(()=>{c.result.stdout.write(output);if(stderr)c.result.stderr.write(stderr);c.result.emit('close',0)});return c.result});return {c,query:createWorkflowQuery({binary:'/approved/mock',env:{},spawnProcess})}}
 it('allows only exact paired SQL above4MiB up to8MiB',async()=>{const q=queryFor(payload(8*1024*1024));expect((await q.query(workflowSnapshotPairSql)).rows).toHaveLength(1);expect(q.c.result.kill).not.toHaveBeenCalled()})
 it('rejects paired stdout and stderr over8MiB',async()=>{const q=queryFor(payload(8*1024*1024),'x');await expect(q.query(workflowSnapshotPairSql)).rejects.toThrow('OUTPUT_LIMIT');expect(q.c.result.kill).toHaveBeenCalledTimes(1)})
 it('keeps changed paired SQL at the ordinary4MiB limit',async()=>{const q=queryFor(payload(4*1024*1024+1));await expect(q.query(workflowSnapshotPairSql+'\n')).rejects.toThrow('OUTPUT_LIMIT')})
})
