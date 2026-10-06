import {createHash} from 'node:crypto'
import {expect,it} from 'vitest'
import {createAzureF0RequestAuthorizer,type AzureF0RequestAccess} from '../../../server/features/costs/extraction/azure-f0-authorization'
const id='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222',bytes=Buffer.from('synthetic original')
const expected:AzureF0RequestAccess={actorId:id,tenantId:id,companyId:id,projectId:id,fileId:id,fileVersion:1,requestId:id,requestVersion:3,sha256:createHash('sha256').update(bytes).digest('hex'),mimeType:'image/png',sizeBytes:bytes.length,permissions:['cost.prepare','cost.request.submit','cost.request.file.read','cost.request.read']}
const input={fileId:id,mimeType:'image/png',bytes,scope:{companyId:id,projectId:id}}
it('re-reads access on every invocation, preserving pinned actor/original/request revision',async()=>{
 let reads=0
 const authorize=createAzureF0RequestAuthorizer(expected,async pinned=>{reads++;expect(Object.isFrozen(pinned)).toBe(true);return {...expected}})
 expect(await authorize(input)).toBe(true);expect(await authorize(input)).toBe(true);expect(reads).toBe(2)
})
it.each(['actorId','tenantId','companyId','projectId','fileId','fileVersion','requestId','requestVersion','sha256','mimeType','sizeBytes'] as const)('denies a changed fresh %s',async key=>{
 const changed={...expected,[key]:typeof expected[key]==='number'?Number(expected[key])+1:other}
 expect(await createAzureF0RequestAuthorizer(expected,async()=>changed)(input)).toBe(false)
})
it.each(expected.permissions)('denies revocation of %s',async permission=>{
 expect(await createAzureF0RequestAuthorizer(expected,async()=>({...expected,permissions:expected.permissions.filter(p=>p!==permission)}))(input)).toBe(false)
})
it('denies stale bytes, altered scope, absent access and private reader errors',async()=>{
 const authorize=createAzureF0RequestAuthorizer(expected,async()=>expected)
 expect(await authorize({...input,bytes:Buffer.from('changed')})).toBe(false)
 expect(await authorize({...input,scope:{companyId:id,projectId:other}})).toBe(false)
 expect(await createAzureF0RequestAuthorizer(expected,async()=>null)(input)).toBe(false)
 expect(await createAzureF0RequestAuthorizer(expected,async()=>{throw Error('private synthetic failure')})(input)).toBe(false)
})
it('pins construction-time values, not a caller-mutated access object',async()=>{
 const mutable={...expected,permissions:[...expected.permissions]},original={...expected}
 const authorize=createAzureF0RequestAuthorizer(mutable,async()=>original)
 mutable.requestVersion=99;mutable.permissions.length=0
 expect(await authorize(input)).toBe(true)
})
it('accepts unattached originals only with both request identity and revision absent',async()=>{
 const unattached={...expected,requestId:null,requestVersion:null}
 expect(await createAzureF0RequestAuthorizer(unattached,async()=>unattached)(input)).toBe(true)
 for(const patch of [{requestId:null},{requestVersion:null},{requestVersion:-1},{actorId:''}]){
 expect(await createAzureF0RequestAuthorizer({...expected,...patch},async()=>expected)(input)).toBe(false)
 }
})
