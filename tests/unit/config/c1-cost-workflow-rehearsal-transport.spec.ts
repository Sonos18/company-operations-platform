import {describe,expect,it,vi} from 'vitest'
import {EventEmitter} from 'node:events'
import {PassThrough} from 'node:stream'
import {existsSync,readFileSync} from 'node:fs'
import {join} from 'node:path'
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
   expect(binary).toBe('/approved/mock-supabase');expect(args.slice(0,6)).toEqual(['db','query','--project-ref','gtgljlnhwvhqdnwrfdfj','--output-format','json']);directory=options.cwd
   expect(readFileSync(join(directory,'supabase/.temp/project-ref'),'utf8')).toBe('gtgljlnhwvhqdnwrfdfj')
   for(const template of ['invite.html','recovery.html'])expect(readFileSync(join(directory,'supabase/templates',template))).toEqual(readFileSync(join(process.cwd(),'supabase/templates',template)))
   expect(options.env.SUPABASE_PROJECT_ID).toBeUndefined();expect(options.env.PGPASSWORD).toBeUndefined();expect(options.env.SUPABASE_ACCESS_TOKEN).toBe('synthetic-test-token')
   const sql=readFileSync(args[args.indexOf('--file')+1]!,'utf8');expect(sql).toContain("set local transaction_timeout='15s'")
   queueMicrotask(()=>{c.result.stdout.write(JSON.stringify({rows:[]}));c.result.emit('close',0)});return c.result
  })
  const query=createWorkflowQuery({cwd:process.cwd(),binary:'/approved/mock-supabase',env:{SUPABASE_PROJECT_ID:'foreign',PGPASSWORD:'synthetic',SUPABASE_ACCESS_TOKEN:'synthetic-test-token'},spawnProcess})
  await expect(query('select 1;')).resolves.toEqual({rows:[]});expect(existsSync(directory)).toBe(false)
 })
 it('kills its native child and cleans only its directory on output overflow',async()=>{const c=child();let directory='';const spawnProcess=vi.fn((_binary:string,_args:string[],options:{cwd:string})=>{directory=options.cwd;queueMicrotask(()=>c.result.stdout.write('x'.repeat(4*1024*1024+1)));return c.result});const query=createWorkflowQuery({cwd:process.cwd(),binary:'/approved/mock',env:{},spawnProcess});await expect(query('select 1;')).rejects.toThrow('OUTPUT_LIMIT');expect(c.result.kill).toHaveBeenCalledWith('SIGKILL');expect(existsSync(directory)).toBe(false)})
 it('bounds client time and terminates only the invocation child',async()=>{vi.useFakeTimers();try{const c=child(),spawnProcess=vi.fn(()=>c.result),query=createWorkflowQuery({cwd:process.cwd(),binary:'/approved/mock',env:{},spawnProcess});const checked=expect(query('select 1;',{timeoutMs:50})).rejects.toThrow('CLIENT_TIMEOUT');await vi.advanceTimersByTimeAsync(51);await checked;expect(c.result.kill).toHaveBeenCalledTimes(1)}finally{vi.useRealTimers()}})
})

describe('sanitized CLI diagnostic boundaries',()=>{
 it.each(['stdout','stderr'])('classifies authentication failure from %s without exposing payload',async(stream)=>{
  const c=child(),spawnProcess=vi.fn(()=>{queueMicrotask(()=>{c.result[stream as 'stdout'|'stderr'].write('Unauthorized 401 synthetic-private-error-value');c.result.emit('close',1)});return c.result})
  const query=createWorkflowQuery({cwd:process.cwd(),binary:'/approved/mock',env:{},spawnProcess})
  await expect(query('select 1;')).rejects.toThrow('WORKFLOW_REHEARSAL_EXECUTION_FAILED:AUTH_REJECTED')
 })
})
