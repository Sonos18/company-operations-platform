import {createHash} from 'node:crypto'
import {deflateSync} from 'node:zlib'
import {expect,it} from 'vitest'
import type {CostExtractionInput} from '../../../shared/schemas/costs/cost-extraction'
import {createAzureF0DocumentInspector,type AzureF0DocumentMetadata} from '../../../server/features/costs/extraction/azure-f0-document-inspection'

const ids={tenantId:'11111111-1111-4111-8111-111111111111',companyId:'22222222-2222-4222-8222-222222222222',projectId:'33333333-3333-4333-8333-333333333333',fileId:'44444444-4444-4444-8444-444444444444'}
const hash=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex')
function pdf(pages=1){
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids ['+Array.from({length:pages},(_,i)=>(i+3)+' 0 R').join(' ')+'] /Count '+pages+' >>',...Array.from({length:pages},()=> '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 20 20] /Resources << >> >>')]
 let text='%PDF-1.4\n'
 const offsets=[0]
 for(const [index,object] of objects.entries()){offsets.push(Buffer.byteLength(text));text+=(index+1)+' 0 obj\n'+object+'\nendobj\n'}
 const start=Buffer.byteLength(text)
 text+='xref\n0 '+offsets.length+'\n0000000000 65535 f \n'+offsets.slice(1).map(offset=>String(offset).padStart(10,'0')+' 00000 n \n').join('')
 text+='trailer\n<< /Size '+offsets.length+' /Root 1 0 R >>\nstartxref\n'+start+'\n%%EOF\n'
 return Buffer.from(text)
}
function crc(bytes:Uint8Array){let value=0xffffffff;for(const byte of bytes){value^=byte;for(let bit=0;bit<8;bit++)value=value&1?0xedb88320^(value>>>1):value>>>1}return (value^0xffffffff)>>>0}
function chunk(type:string,data:Buffer){const name=Buffer.from(type),size=Buffer.alloc(4),checksum=Buffer.alloc(4);size.writeUInt32BE(data.length);checksum.writeUInt32BE(crc(Buffer.concat([name,data])));return Buffer.concat([size,name,data,checksum])}
function png(){const header=Buffer.alloc(13);header.writeUInt32BE(1,0);header.writeUInt32BE(1,4);header[8]=8;header[9]=6;return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(Buffer.from([0,255,0,0,255]))),chunk('IEND',Buffer.alloc(0))])}
function fixture(bytes:Uint8Array=pdf(),mimeType='application/pdf'){
 const metadata:AzureF0DocumentMetadata={...ids,fileVersion:1,sha256:hash(bytes),mimeType,sizeBytes:bytes.byteLength}
 const input:CostExtractionInput={fileId:ids.fileId,mimeType,bytes,scope:{companyId:ids.companyId,projectId:ids.projectId}}
 const inspect=createAzureF0DocumentInspector(metadata,async()=>({...metadata}))
 return {metadata,input,inspect}
}
const incomplete=(bytes:Uint8Array)=>({sha256:hash(bytes),complete:false,pageCount:0})
it('hashes the exact supplied view independently of trusted metadata',async()=>{
 const f=fixture(),backing=Buffer.concat([Buffer.from('prefix'),Buffer.from(f.input.bytes),Buffer.from('suffix')])
 const view=backing.subarray(6,6+f.input.bytes.byteLength)
 expect(await f.inspect({...f.input,bytes:view})).toEqual(incomplete(view))
 expect((await f.inspect({...f.input,bytes:Buffer.from('changed')})).sha256).toBe(hash(Buffer.from('changed')))
})
it.each([1,3,8])('keeps a synthetic %i-page PDF incomplete without a full decoder',async pages=>{
 const f=fixture(pdf(pages));expect(await f.inspect(f.input)).toEqual(incomplete(f.input.bytes))
})
it('does not treat complete PNG pixels, headers or dimensions as attested decoder coverage',async()=>{
 const f=fixture(png(),'image/png');expect(await f.inspect(f.input)).toEqual(incomplete(f.input.bytes))
})
it.each([
 ['PDF header only',Buffer.from('%PDF-1.7\n'),'application/pdf'],
 ['PDF misleading tokens',Buffer.from('%PDF-1.7\n% /Type /Page /Type /Page\n%%EOF'),'application/pdf'],
 ['PDF encryption dictionary fragment',Buffer.from('%PDF-1.7\ntrailer << /Encrypt 1 0 R >>\n%%EOF'),'application/pdf'],
 ['truncated PNG',png().subarray(0,33),'image/png'],
 ['damaged PNG data',Buffer.concat([png().subarray(0,45),Buffer.from([0,0,0])]),'image/png'],
 ['JPEG SOI and SOF only',Buffer.from([255,216,255,192,0,11,8,0,1,0,1,1,1,17,0]),'image/jpeg'],
 ['JPEG end markers only',Buffer.from([255,216,255,217]),'image/jpeg'],
 ['unknown MIME',Buffer.from('synthetic unknown'),'application/octet-stream'],
 ['MIME parameters',png(),'image/png; charset=binary'],
 ['MIME disagrees with bytes',png(),'application/pdf'],
 ['empty bytes',Buffer.alloc(0),'application/pdf'],
] as const)('fails closed for %s',async(_name,bytes,mime)=>{
 const f=fixture(bytes,mime);expect(await f.inspect(f.input)).toEqual(incomplete(bytes))
})
it.each(['fileId','companyId','projectId'] as const)('rejects changed input %s before consulting the private reader',async field=>{
 const f=fixture();let reads=0
 const inspect=createAzureF0DocumentInspector(f.metadata,async()=>{reads++;return f.metadata})
 const input={...f.input,scope:{...f.input.scope}}
 if(field==='fileId')input.fileId=ids.tenantId
 else input.scope[field]=ids.fileId
 expect(await inspect(input)).toEqual(incomplete(input.bytes));expect(reads).toBe(0)
})
it('rejects MIME/hash/size mismatch before consulting the private reader',async()=>{
 const f=fixture()
 for(const input of [{...f.input,mimeType:'image/png'},{...f.input,bytes:Buffer.from('wrong bytes')},{...f.input,bytes:Buffer.from(f.input.bytes).subarray(1)}]){
 let reads=0;const inspect=createAzureF0DocumentInspector(f.metadata,async()=>{reads++;return f.metadata})
 expect(await inspect(input)).toEqual(incomplete(input.bytes));expect(reads).toBe(0)
 }
})
it.each(['tenantId','companyId','projectId','fileId','fileVersion','sha256','mimeType','sizeBytes'] as const)('requires fresh immutable %s to match the pinned metadata',async field=>{
 const f=fixture(),fresh={...f.metadata,[field]:typeof f.metadata[field]==='number'?Number(f.metadata[field])+1:'changed'}
 const inspect=createAzureF0DocumentInspector(f.metadata,async()=>fresh)
 expect(await inspect(f.input)).toEqual(incomplete(f.input.bytes))
})
it('queries the pinned metadata, preserving construction-time identity when callers mutate it',async()=>{
 const f=fixture(),original={...f.metadata};let query:Readonly<AzureF0DocumentMetadata>|undefined
 const inspect=createAzureF0DocumentInspector(f.metadata,async expected=>{query=expected;return original})
 f.metadata.fileVersion=99;f.metadata.fileId=ids.tenantId
 expect(await inspect(f.input)).toEqual(incomplete(f.input.bytes))
 expect(query).toEqual(original);expect(Object.isFrozen(query)).toBe(true)
})
it('copies bytes before an asynchronous trusted metadata read',async()=>{
 const f=fixture(),before=hash(f.input.bytes)
 const inspect=createAzureF0DocumentInspector(f.metadata,async()=>{f.input.bytes.fill(0);return f.metadata})
 expect(await inspect(f.input)).toEqual({sha256:before,complete:false,pageCount:0})
})
it('fails closed for unavailable or throwing trusted metadata without exposing private errors',async()=>{
 const f=fixture()
 for(const reader of [async()=>null,async()=>{throw new Error('synthetic private failure')}]){
 expect(await createAzureF0DocumentInspector(f.metadata,reader)(f.input)).toEqual(incomplete(f.input.bytes))
 }
})
it.each([{fileVersion:0},{fileVersion:1.5},{sizeBytes:-1},{sizeBytes:NaN},{sha256:'invalid'},{tenantId:''}])('fails closed for malformed expected metadata %j',async patch=>{
 const f=fixture();let reads=0
 const inspect=createAzureF0DocumentInspector({...f.metadata,...patch},async()=>{reads++;return f.metadata})
 expect(await inspect(f.input)).toEqual(incomplete(f.input.bytes));expect(reads).toBe(0)
})
it('bounds input bytes to the adapter four-megabyte ceiling',async()=>{
 const f=fixture(new Uint8Array(4_000_001));let reads=0
 const inspect=createAzureF0DocumentInspector(f.metadata,async()=>{reads++;return f.metadata})
 expect(await inspect(f.input)).toEqual(incomplete(f.input.bytes));expect(reads).toBe(0)
})
it('ignores unattested complete/page/native reports attached to private metadata',async()=>{
 const f=fixture()
 const inspect=createAzureF0DocumentInspector(f.metadata,async()=>({...f.metadata,complete:true,pageCount:1,nativeResult:{status:'ready',fields:{amount:'999'}}}))
 expect(await inspect(f.input)).toEqual(incomplete(f.input.bytes))
})
