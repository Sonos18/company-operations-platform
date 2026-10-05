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
