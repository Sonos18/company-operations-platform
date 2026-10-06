import {createRequire} from 'node:module'
import {inflateSync} from 'node:zlib'
const require=createRequire(import.meta.url)
const maximumBytes=4_000_000,maximumPixels=4_000_000,maximumDimension=4096
interface Pixels{width:number;height:number;data:Uint8Array}
interface PngDecoder{PNG:{sync:{read(bytes:Buffer,options:{checkCRC:boolean}):Pixels}}}
interface JpegDecoder{decode(bytes:Buffer,options:{useTArray:boolean;formatAsRGBA:boolean;tolerantDecoding:boolean;maxResolutionInMP:number;maxMemoryUsageInMB:number}):Pixels}
function reject():never{throw new Error('OCR_IMAGE_UNVERIFIED')}
function crc(bytes:Uint8Array){
 let value=0xffffffff
 for(const byte of bytes){value^=byte;for(let bit=0;bit<8;bit++)value=(value>>>1)^((value&1)?0xedb88320:0)}
 return(value^0xffffffff)>>>0
}
function dimensions(width:number,height:number){
 if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<50||height<50||width>maximumDimension||height>maximumDimension||width*height>maximumPixels)reject()
}
function fullOutput(decoded:Pixels,width:number,height:number){
 if(decoded.width!==width||decoded.height!==height||!(decoded.data instanceof Uint8Array)||decoded.data.length!==width*height*4)reject()
}
function png(bytes:Buffer){
 if(bytes.length<45||!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))reject()
 let offset=8,width=0,height=0,channels=0,chunks=0,seenData=false,endedData=false,ended=false
 const idat:Buffer[]=[],ancillary=new Set<string>()
 while(offset<bytes.length){
  if(++chunks>512||offset+12>bytes.length)reject()
  const length=bytes.readUInt32BE(offset),type=bytes.toString('ascii',offset+4,offset+8)
  if(length>maximumBytes||offset+length+12>bytes.length||!/^[A-Za-z]{2}[A-Z][A-Za-z]$/.test(type))reject()
  const data=bytes.subarray(offset+8,offset+8+length)
  if(crc(bytes.subarray(offset+4,offset+8+length))!==bytes.readUInt32BE(offset+8+length))reject()
  if(chunks===1){
   if(type!=='IHDR'||length!==13)reject()
   width=data.readUInt32BE(0);height=data.readUInt32BE(4);dimensions(width,height)
   if(data[8]!==8||![2,6].includes(data[9]!)||data[10]!==0||data[11]!==0||data[12]!==0)reject()
   channels=data[9]===2?3:4
  }else if(type==='IHDR')reject()
  if(type==='IDAT'){
   if(endedData)reject()
   seenData=true;idat.push(data)
  }else if(seenData)endedData=true
  offset+=length+12
  if(type==='IEND'){
   if(length!==0||!seenData||offset!==bytes.length)reject()
   ended=true;break
  }
  if(!['IHDR','IDAT'].includes(type)){
   // Exclude APNG, embedded thumbnails/text and unreviewed ancillary formats.
   const sizes:Record<string,number>={pHYs:9,sRGB:1,gAMA:4,cHRM:32}
   if(sizes[type]!==length||seenData||ancillary.has(type))reject()
   if(type==='sRGB'&&data[0]!>3||type==='gAMA'&&data.readUInt32BE(0)===0||type==='pHYs'&&data[8]!>1)reject()
   ancillary.add(type)
  }
 }
 if(!ended)reject()
 const compressed=Buffer.concat(idat),expected=height*(1+width*channels)
 // Node returns detailed info at runtime; its sync overload is typed as Buffer.
 const inflated=inflateSync(compressed,{maxOutputLength:expected+1,info:true}) as unknown as {buffer:Buffer;engine:{bytesWritten:number}}
 if(inflated.buffer.length!==expected||inflated.engine.bytesWritten!==compressed.length)reject()
 for(let row=0;row<height;row++)if(inflated.buffer[row*(1+width*channels)]!>4)reject()
 if((require('pngjs/package.json') as {version:string}).version!=='7.0.0')reject()
 const decoded=(require('pngjs') as PngDecoder).PNG.sync.read(bytes,{checkCRC:true})
 fullOutput(decoded,width,height)
}
function jpeg(bytes:Buffer){
 if(bytes.length<4||bytes[0]!==255||bytes[1]!==216)reject()
 let offset=2,width=0,height=0,scans=0,frames=0,segments=0,ended=false,jfif=false
 let components:number[]=[]
 while(offset<bytes.length){
  if(++segments>512||bytes[offset++]!==255)reject()
  const marker=bytes[offset++]!
  if(marker===217){
   if(offset!==bytes.length||scans!==1||frames!==1)reject()
   ended=true;break
  }
  if(![224,219,196,192,218].includes(marker)||offset+2>bytes.length)reject()
  const length=bytes.readUInt16BE(offset)
  if(length<2||offset+length>bytes.length)reject()
  const data=bytes.subarray(offset+2,offset+length)
  if(marker===224){
   if(jfif||scans||data.length!==14||data.toString('ascii',0,5)!=='JFIF\0'||data[12]!==0||data[13]!==0)reject()
   jfif=true
  }
  if(marker===192){
   if(++frames!==1||scans||data.length!==15||data[0]!==8||data[5]!==3)reject()
   height=data.readUInt16BE(1);width=data.readUInt16BE(3);dimensions(width,height)
   components=[data[6]!,data[9]!,data[12]!]
   if(new Set(components).size!==3)reject()
   for(const at of [7,10,13])if((data[at]!>>4)<1||(data[at]!>>4)>2||(data[at]!&15)<1||(data[at]!&15)>2)reject()
  }
  offset+=length
  if(marker===218){
   if(++scans!==1||frames!==1||data.length!==10||data[0]!==3||data[7]!==0||data[8]!==63||data[9]!==0||components.some((id,index)=>data[1+index*2]!==id))reject()
   // Only a single baseline scan, without restart markers or later metadata.
   let foundEnd=false
   while(offset<bytes.length){
    if(bytes[offset++]!==255)continue
    const next=bytes[offset++]!
    if(next===0)continue
    if(next!==217||offset!==bytes.length)reject()
    foundEnd=true;offset-=2;break
   }
   if(!foundEnd)reject()
  }
 }
 if(!ended)reject()
 if((require('jpeg-js/package.json') as {version:string}).version!=='0.4.4')reject()
 const decoder=require('jpeg-js') as JpegDecoder
 const options={useTArray:true,formatAsRGBA:true,tolerantDecoding:false,maxResolutionInMP:maximumPixels/1_000_000,maxMemoryUsageInMB:64}
 fullOutput(decoder.decode(bytes,options),width,height)
 // jpeg-js skips unused entropy before EOI. Require the final encoded byte
 // to be necessary, allowing only jpeg-js encoder's single FF/00 fill byte
 // when a scan already ends on a byte boundary. More fill/data is rejected.
 const decodesPrefix=(end:number)=>{
  try{fullOutput(decoder.decode(Buffer.concat([bytes.subarray(0,end),bytes.subarray(-2)]),options),width,height);return true}catch{return false}
 }
 const last=bytes.length-3,cut=bytes[last]===0&&bytes[last-1]===255?last-1:last
 if(decodesPrefix(cut)){
  if(bytes[cut]!==255||bytes[cut+1]!==0||cut+2!==bytes.length-2)reject()
  const previous=cut-1,previousCut=bytes[previous]===0&&bytes[previous-1]===255?previous-1:previous
  if(decodesPrefix(previousCut))reject()
 }
}
/** Concrete server-only decoder; no injected width/page/complete report.
 * Missing or differently versioned packages and every unsupported variant fail closed.
 * Bounds cover input, pixels, chunks, inflation and library output; execution must also
 * be isolated/bounded by the host before live activation (no hard RSS guarantee here).
 */
export function hasCompleteAzureF0Image(bytes:Uint8Array,mimeType:string):boolean{
 if(bytes.byteLength===0||bytes.byteLength>maximumBytes)return false
 try{
  const snapshot=Buffer.from(bytes)
  if(mimeType==='image/png')png(snapshot)
  else if(mimeType==='image/jpeg')jpeg(snapshot)
  else return false
  return true
 }catch{return false}
}
