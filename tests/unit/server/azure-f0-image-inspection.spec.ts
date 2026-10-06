import {createHash} from 'node:crypto'
import {createRequire} from 'node:module'
import {deflateSync} from 'node:zlib'
import {expect,it} from 'vitest'
import * as inspection from '../../../server/features/costs/extraction/azure-f0-document-inspection'
import type {CostExtractionInput} from '../../../shared/schemas/costs/cost-extraction'
const require=createRequire(import.meta.url)
let decoders=false
try{decoders=require('pngjs/package.json').version==='7.0.0'&&require('jpeg-js/package.json').version==='0.4.4'}catch{/* Optional until app dependency approval. */}
const imageTest=it.runIf(decoders)
const ids={tenantId:'11111111-1111-4111-8111-111111111111',companyId:'22222222-2222-4222-8222-222222222222',projectId:'33333333-3333-4333-8333-333333333333',fileId:'44444444-4444-4444-8444-444444444444'}
const hash=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex')
function crc(b:Uint8Array){let c=0xffffffff;for(const x of b){c^=x;for(let k=0;k<8;k++)c=(c>>>1)^((c&1)?0xedb88320:0)}return(c^0xffffffff)>>>0}
function chunk(type:string,data:Buffer){const b=Buffer.alloc(data.length+12);b.writeUInt32BE(data.length);b.write(type,4);data.copy(b,8);b.writeUInt32BE(crc(b.subarray(4,data.length+8)),data.length+8);return b}
const signature=Buffer.from([137,80,78,71,13,10,26,10])
function png(width=64,height=64,rgb=false,raw?:Buffer,extra:Buffer[]=[]){
 const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=rgb?2:6
 const channels=rgb?3:4,rows=raw??Buffer.alloc(height*(1+width*channels),128)
 if(!raw)for(let y=0;y<height;y++)rows[y*(1+width*channels)]=0
 return Buffer.concat([signature,chunk('IHDR',header),...extra,chunk('IDAT',deflateSync(rows)),chunk('IEND',Buffer.alloc(0))])
}
function fixture(bytes:Uint8Array,mimeType='image/png',reader?:(expected:inspection.AzureF0DocumentMetadata)=>Promise<inspection.AzureF0DocumentMetadata|null>){
 const metadata={...ids,fileVersion:1,sha256:hash(bytes),mimeType,sizeBytes:bytes.byteLength}
 const input:CostExtractionInput={fileId:ids.fileId,mimeType,bytes,scope:{companyId:ids.companyId,projectId:ids.projectId}}
 const inspect=inspection.createAzureF0ImageDocumentInspector(metadata,reader??(async()=>({...metadata})))
 return {metadata,input,inspect}
}
imageTest.each([false,true])('attests every decoded RGB/RGBA PNG pixel as one page (%s)',async rgb=>{
 const f=fixture(png(64,64,rgb));expect(await f.inspect(f.input)).toEqual({sha256:hash(f.input.bytes),complete:true,pageCount:1})
})
imageTest('accepts a practical bounded synthetic image and rejects larger dimensions before expansion',async()=>{
 for(const side of [1000,2000]){const f=fixture(png(side,side));expect((await f.inspect(f.input)).complete).toBe(true)}
 const huge=png(1,1);huge.writeUInt32BE(65535,16);huge.writeUInt32BE(crc(huge.subarray(12,29)),29)
 const bad=fixture(huge);expect((await bad.inspect(bad.input)).complete).toBe(false)
})
imageTest.each([
 ['below provider minimum',()=>png(16,12)],
 ['truncated',()=>png().subarray(0,40)],
 ['CRC',()=>{const b=png();b[29]^=1;return b}],
 ['trailing bytes',()=>Buffer.concat([png(),Buffer.from('extra')])],
 ['concatenated frames',()=>Buffer.concat([png(),png()])],
 ['APNG',()=>png(64,64,false,undefined,[chunk('acTL',Buffer.from([0,0,0,2,0,0,0,0]))])],
 ['unknown ancillary CRC',()=>{const b=png(64,64,false,undefined,[chunk('teSt',Buffer.from('extra'))]);b[48]^=1;return b}],
 ['unknown ancillary content',()=>png(64,64,false,undefined,[chunk('teSt',Buffer.from('extra'))])],
 ['palette',()=>{const b=png();b[25]=3;b.writeUInt32BE(crc(b.subarray(12,29)),29);return b}],
 ['interlaced',()=>{const b=png();b[28]=1;b.writeUInt32BE(crc(b.subarray(12,29)),29);return b}],
 ['16 bit',()=>{const b=png();b[24]=16;b.writeUInt32BE(crc(b.subarray(12,29)),29);return b}],
 ['excess inflation',()=>png(64,64,false,Buffer.alloc(20000))],
 ['bad row filter',()=>png(64,64,false,Buffer.concat([Buffer.from([5]),Buffer.alloc(64*257-1)]))],
 ['compressed trailing',()=>{const b=png(),n=b.readUInt32BE(33);return Buffer.concat([b.subarray(0,33),chunk('IDAT',Buffer.concat([b.subarray(41,41+n),Buffer.from('extra')])),chunk('IEND',Buffer.alloc(0))])}],
 ['truncated zlib trailer with good CRC',()=>{const b=png(),n=b.readUInt32BE(33);return Buffer.concat([b.subarray(0,33),chunk('IDAT',b.subarray(41,41+n-3)),chunk('IEND',Buffer.alloc(0))])}],
] as const)('rejects PNG %s without claiming complete coverage',async(_name,make)=>{
 const f=fixture(make());expect(await f.inspect(f.input)).toEqual({sha256:hash(f.input.bytes),complete:false,pageCount:0})
})
function jpeg(){return Buffer.from(require('jpeg-js').encode({width:64,height:64,data:Buffer.alloc(64*64*4,128)},90).data)}
function sof(b:Buffer){for(let o=2;o<b.length;){const m=b[o+1]!,n=b.readUInt16BE(o+2);if(m===192)return o;o+=2+n}throw Error('synthetic fixture')}
imageTest('fully decodes a baseline three-component JPEG',async()=>{const f=fixture(jpeg(),'image/jpeg');expect(await f.inspect(f.input)).toEqual({sha256:hash(f.input.bytes),complete:true,pageCount:1})})
imageTest.each([
 ['truncated SOI',()=>jpeg().subarray(1)],
 ['absent EOI',()=>jpeg().subarray(0,-2)],
 ['truncated entropy with EOI',()=>Buffer.concat([jpeg().subarray(0,-16),Buffer.from([255,217])])],
 ['trailing',()=>Buffer.concat([jpeg(),Buffer.from('extra')])],
 ['concatenated',()=>Buffer.concat([jpeg(),jpeg()])],
 ['MPF',()=>Buffer.concat([jpeg().subarray(0,2),Buffer.from([255,226,0,6,77,80,70,0]),jpeg().subarray(2)])],
 ['Exif thumbnail',()=>Buffer.concat([jpeg().subarray(0,2),Buffer.from([255,225,0,8,69,120,105,102,0,0]),jpeg().subarray(2)])],
 ['progressive mutation',()=>{const b=jpeg();b[sof(b)+1]=194;return b}],
 ['huge dimensions',()=>{const b=jpeg();b.writeUInt16BE(65535,sof(b)+5);return b}],
 ['unused entropy before EOI',()=>Buffer.concat([jpeg().subarray(0,-2),Buffer.from('UNUSED'),Buffer.from([255,217])])],
 ['extra fill bytes',()=>Buffer.concat([jpeg().subarray(0,-2),Buffer.from([255,0,255,0]),Buffer.from([255,217])])],
 ['invalid segment',()=>{const b=jpeg();b.writeUInt16BE(65535,4);return b}],
] as const)('rejects JPEG %s before attesting coverage',async(_name,make)=>{
 const f=fixture(make(),'image/jpeg');expect((await f.inspect(f.input)).complete).toBe(false)
})
imageTest('copies bytes before fresh metadata checks and still inspects the original',async()=>{
 const bytes=png(),f=fixture(bytes),inspect=inspection.createAzureF0ImageDocumentInspector(f.metadata,async()=>{bytes.fill(0);return f.metadata})
 expect(await inspect(f.input)).toEqual({sha256:f.metadata.sha256,complete:true,pageCount:1})
})
imageTest('fresh metadata mismatch prevents positive image inspection',async()=>{
 const bytes=png(),f=fixture(bytes),inspect=inspection.createAzureF0ImageDocumentInspector(f.metadata,async()=>({...f.metadata,fileVersion:2}))
 expect((await inspect(f.input)).complete).toBe(false)
})
it('leaves all PDF coverage incomplete, even with the image decoder boundary',async()=>{
 const f=fixture(Buffer.from('%PDF-1.7\n/Type /Page\n%%EOF'),'application/pdf');expect((await f.inspect(f.input)).complete).toBe(false)
})

imageTest('pins the original MIME across an asynchronous metadata read',async()=>{
 const f=fixture(png()),inspect=inspection.createAzureF0ImageDocumentInspector(f.metadata,async()=>{f.input.mimeType='image/jpeg';return f.metadata})
 expect(await inspect(f.input)).toEqual({sha256:f.metadata.sha256,complete:true,pageCount:1})
})
