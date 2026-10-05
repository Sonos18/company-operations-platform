import {createHash} from 'node:crypto'
import ExcelJS from 'exceljs'
import type {Readable} from 'node:stream'
import JSZip,{type JSZipObject} from 'jszip'
import {inspectZipCentralDirectory} from '../../../utils/zip-archive-metadata'
import {costExtractionResultSchema,type CostExtractionAdapter,type CostExtractionInput,type ExtractionResult} from '../../../../shared/schemas/costs/cost-extraction'
import {workflowMoneySchema,workflowAccountingBasisSchema} from '../../../../shared/schemas/costs/cost-workflow'
const xlsx='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const limits={bytes:5*1024*1024,entry:2*1024*1024,expanded:32*1024*1024,entries:512,rows:5000,columns:100,cells:50000,sheets:20}
type Warning=ExtractionResult['warnings'][number]
function result(status:ExtractionResult['status'],warnings:Warning[],methodVersion:ExtractionResult['methodVersion']='excel-offline-v1'):ExtractionResult{return {status,reviewRequired:true,fields:{},warnings,sourceLocations:[],methodVersion}}
function stop(code:Warning):never{throw new Error(code)}
async function boundedEntry(entry:JSZipObject,expected:number){
 return new Promise<Buffer>((resolve,reject)=>{
  const stream=entry.nodeStream() as Readable,chunks:Buffer[]=[];let size=0,settled=false
  const fail=()=>{if(!settled){settled=true;stream.destroy();reject(new Error('EXCEL_FILE_INVALID'))}}
  stream.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size>expected||size>limits.entry)return fail();chunks.push(chunk)})
  stream.on('error',fail)
  stream.on('end',()=>{if(!settled){settled=true;if(size===expected)resolve(Buffer.concat(chunks));else reject(new Error('EXCEL_FILE_INVALID'))}})
 })
}
function attribute(value:string,name:string){return value.match(new RegExp('(?:^|\\s)'+name+'=["\\x27]([^"\\x27]*)["\\x27]','u'))?.[1]}
function norm(value:string){return value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/Đ/g,'D').trim().toLowerCase().replace(/\s+/g,' ')}
function columnNumber(value:string){return [...value].reduce((n,c)=>n*26+c.charCodeAt(0)-64,0)}
async function workbookArchive(bytes:Uint8Array){
 if(bytes.byteLength>limits.bytes)stop('EXTRACTION_FILE_TOO_LARGE')
 const metadata=inspectZipCentralDirectory(bytes,{maximumEntries:limits.entries,maximumEntryBytes:limits.entry,maximumExpansionBytes:limits.expanded,allowDataDescriptors:true})
 if(new Set(metadata.entries.map(e=>e.name.toLowerCase())).size!==metadata.entries.length)stop('EXCEL_FILE_INVALID')
 if(metadata.entries.some(e=>e.name.startsWith('/')||e.name.includes('\\')||e.name.split('/').includes('..')))stop('EXCEL_FILE_INVALID')
 if(metadata.entries.some(e=>/vbaproject|activex|embeddings|externalLinks/i.test(e.name)))stop('EXCEL_ACTIVE_CONTENT_UNSUPPORTED')
 const archive=await JSZip.loadAsync(bytes,{checkCRC32:false,createFolders:false})
 const xml=new Map<string,string>()
 let cells=0,sheets=0
 for(const item of metadata.entries){
  const entry=archive.file(item.name)
  if(!entry){if(item.name.endsWith('/')&&item.uncompressedSize===0)continue;stop('EXCEL_FILE_INVALID')}
  const actual=await boundedEntry(entry,item.uncompressedSize)
  if(/\.(?:xml|rels)$/i.test(item.name)){
   const content=actual.toString('utf8')
   if(/<!DOCTYPE|<!ENTITY/i.test(content))stop('EXCEL_FILE_INVALID')
   if(/macroEnabled/i.test(content))stop('EXCEL_ACTIVE_CONTENT_UNSUPPORTED')
   if(/TargetMode\s*=\s*["']External["']/i.test(content))stop('EXCEL_EXTERNAL_LINK_UNSUPPORTED')
   if(/^xl\/worksheets\/[^/]+\.xml$/.test(item.name)){
    if(++sheets>limits.sheets)stop('EXCEL_COORDINATE_LIMIT')
    let mergeArea=0
    for(const match of content.matchAll(/\bref=["']([^"']+)["']/g)){
     const coordinates=[...match[1]!.matchAll(/([A-Z]+)([1-9]\d*)/g)]
     if(coordinates.some(v=>columnNumber(v[1]!)>limits.columns||Number(v[2])>limits.rows))stop('EXCEL_COORDINATE_LIMIT')
    }
    for(const match of content.matchAll(/<mergeCell\b[^>]*ref=["']([A-Z]+)([1-9]\d*):([A-Z]+)([1-9]\d*)["']/g)){
     mergeArea+=(columnNumber(match[3]!)-columnNumber(match[1]!)+1)*(Number(match[4])-Number(match[2])+1)
     if(mergeArea>limits.cells)stop('EXCEL_COORDINATE_LIMIT')
    }

    for(const match of content.matchAll(/<(?:row|c)\b([^>]*)/g)){
     const row=attribute(match[1]!,'r')
     if(!row)continue
     if(match[0].startsWith('<row')){if(!/^[1-9]\d*$/.test(row)||Number(row)>limits.rows)stop('EXCEL_COORDINATE_LIMIT')}
     else{const address=row.match(/^([A-Z]+)([1-9]\d*)$/);if(!address||columnNumber(address[1]!)>limits.columns||Number(address[2])>limits.rows||++cells>limits.cells)stop('EXCEL_COORDINATE_LIMIT')}
    }
   }
   xml.set(item.name,content)
  }
 }
 if(!xml.get('[Content_Types].xml')?.includes('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml')||!xml.has('xl/workbook.xml'))stop('EXCEL_FILE_INVALID')
 const relationships=new Map<string,string>()
 for(const m of (xml.get('xl/_rels/workbook.xml.rels')??'').matchAll(/<Relationship\b([^>]*)/g)){
  const id=attribute(m[1]!,'Id'),target=attribute(m[1]!,'Target')
  if(id&&target)relationships.set(id,target.startsWith('/')?target.slice(1):target.startsWith('xl/')?target:'xl/'+target)
 }
 const paths=new Map<string,string>()
 for(const m of xml.get('xl/workbook.xml')!.matchAll(/<sheet\b([^>]*)/g)){
  const id=attribute(m[1]!,'sheetId'),rid=attribute(m[1]!,'r:id'),path=rid&&relationships.get(rid)
  if(id&&path)paths.set(id,path)
 }
 return {xml,paths}
}
export class ExcelCostExtractionAdapter implements CostExtractionAdapter{
 async extract(input:CostExtractionInput):Promise<ExtractionResult>{
  if(input.mimeType!==xlsx)return result('unavailable',['LEGACY_XLS_PARSER_UNAVAILABLE'])
  try{
   const raw=await workbookArchive(input.bytes)
   const book=new ExcelJS.Workbook()
   await book.xlsx.load(Buffer.from(input.bytes) as never)
   if(book.worksheets.length>1)return result('needs_review',['EXCEL_MULTIPLE_SHEETS_REQUIRE_REVIEW'])
   const output=result('needs_review',[])
   const warnings=new Set<Warning>(['PARTY_MATCH_REQUIRES_REVIEW','TOTAL_REQUIRES_REVIEW'])
   const add=(field:string,sheet:ExcelJS.Worksheet,row:number,column:number)=>{if(output.sourceLocations.length>=10000)stop('EXCEL_COORDINATE_LIMIT');output.sourceLocations.push({field,sheet:sheet.name,row,column})}
   // Excel numeric values are read from bounded source XML to preserve exact decimal text.
   for(const sheet of book.worksheets){
    if(sheet.rowCount>limits.rows||sheet.columnCount>limits.columns||sheet.name.length>100)stop('EXCEL_COORDINATE_LIMIT')
    const numeric=new Map<string,string>()
    for(const m of (raw.xml.get(raw.paths.get(String(sheet.id))??'')??'').matchAll(/<c\b([^>]*)(?:\/>|>([\s\S]*?)<\/c>)/g)){
     const address=attribute(m[1]!,'r'),type=attribute(m[1]!,'t'),body=m[2]??''
     const value=body.match(/<v\b[^>]*>([^<]*)<\/v>/)?.[1]
     if(address&&value!==undefined&&(!type||type==='n')&&!/<f\b/.test(body))numeric.set(address,value)
    }
    const text=(row:number,column:number):string|undefined=>{
     const cell=sheet.getCell(row,column),value=cell.value
     if(value===null||value===undefined)return undefined
     if(typeof value==='object'&&('formula' in value||'sharedFormula' in value)){warnings.add('FORMULA_NOT_EVALUATED');return undefined}
     if(numeric.has(cell.address))return numeric.get(cell.address)
     if(typeof value==='string')return value.trim().slice(0,2000)||undefined
     if(typeof value==='number'){warnings.add('NUMBER_FORMAT_REQUIRES_REVIEW');return undefined}
     if(value instanceof Date)return Number.isNaN(value.getTime())?undefined:value.toISOString().slice(0,10)
     if(typeof value==='object'&&'richText' in value)return value.richText.map(v=>v.text).join('').trim().slice(0,2000)||undefined
     return undefined
    }
    const valueMoney=(value:string|undefined)=>{if(value===undefined)return undefined;if(!workflowMoneySchema.safeParse(value).success){warnings.add('NUMBER_FORMAT_REQUIRES_REVIEW');return undefined}return value}
    const metadata=new Map<string,{value:string,row:number}>()
    let headerRow=0,headers=new Map<string,number>()
    for(let row=1;row<=Math.min(sheet.rowCount,50);row++){
     const label=text(row,1),value=text(row,2)
     if(label&&value)metadata.set(norm(label),{value,row})
     const candidate=new Map<string,number>()
     for(let column=1;column<=sheet.columnCount;column++){const v=text(row,column);if(v)candidate.set(norm(v),column)}
     if(candidate.has('mo ta')||candidate.has('nhan su')){headerRow=row;headers=candidate;break}
    }
    const metadataValue=(labels:string[],field:string)=>{for(const label of labels){const found=metadata.get(label);if(found){add(field,sheet,found.row,2);return found.value}}return undefined}
    const kindHint=metadataValue(['loai'],'basis.kind')
    const aliases:Record<string,string>={'vat tu':'materials','nhan cong truc tiep':'direct_labor','thau phu':'subcontract','may moc':'machinery','chi phi khac':'other'}
    const kind=kindHint?(aliases[norm(kindHint)]??kindHint):undefined
    const party=metadataValue(['nha cung cap','doi','thau phu'],'partyHint')
    if(party)output.fields.partyHint=party
    const amount=valueMoney(metadataValue(['tong thanh toan','tong tien'],'amount'));if(amount)output.fields.amount=amount
    const currency=metadataValue(['tien te'],'currencyCode');if(currency&&/^[A-Z]{3}$/.test(currency))output.fields.currencyCode=currency
    const notes={vatBasis:metadataValue(['thue gtgt'],'accountingBasis.vatBasis'),roundingBasis:metadataValue(['lam tron'],'accountingBasis.roundingBasis'),allowanceBasis:metadataValue(['co so phu cap'],'accountingBasis.allowanceBasis')}
    const retainedNotes=Object.fromEntries(Object.entries(notes).filter(([,v])=>v!==undefined))
    if(Object.keys(retainedNotes).length)output.fields.accountingBasis=workflowAccountingBasisSchema.parse(retainedNotes)
    if(kind==='subcontract'){
     output.fields.basis={kind,contractReference:metadataValue(['hop dong'],'basis.contractReference'),acceptanceReference:metadataValue(['nghiem thu'],'basis.acceptanceReference'),retentionAmount:valueMoney(metadataValue(['giu lai bao hanh'],'basis.retentionAmount'))}
    }else if(kind==='direct_labor'){
     const week=metadataValue(['tuan bat dau'],'basis.weekStart')
     const validDate=week&&/^\d{4}-\d{2}-\d{2}$/.test(week)&&!Number.isNaN(new Date(week+'T00:00:00Z').getTime())&&new Date(week+'T00:00:00Z').toISOString().slice(0,10)===week
     if(week&&!validDate)warnings.add('INVALID_DATE_REQUIRES_REVIEW')
     const workers:Extract<NonNullable<ExtractionResult['fields']['basis']>,{kind:'direct_labor'}>['workers']=[]
     const columns=['nhan su','ngay cong','don gia ngay','phu cap'].map(v=>headers.get(v))
     if(columns.every(v=>v!==undefined))for(let row=headerRow+1;row<=sheet.rowCount;row++){
      const workerReference=text(row,columns[0]!),days=valueMoney(text(row,columns[1]!)),dailyRate=valueMoney(text(row,columns[2]!)),allowance=valueMoney(text(row,columns[3]!))
      if(workerReference&&days!==undefined&&dailyRate!==undefined&&allowance!==undefined){workers.push({workerReference,days,dailyRate,allowance});add('basis.workers.'+(workers.length-1),sheet,row,columns[0]!)}
      if(workers.length>1000)stop('EXCEL_COORDINATE_LIMIT')
     }
     output.fields.basis={kind,weekStart:validDate?week:undefined,workers}
    }else if(kind==='materials'||kind==='machinery'||kind==='other'){
     const lines:Extract<NonNullable<ExtractionResult['fields']['basis']>,{kind:'materials'}>['lines']=[]
     const columns=['mo ta','so luong','don vi','don gia'].map(v=>headers.get(v))
     if(columns.every(v=>v!==undefined))for(let row=headerRow+1;row<=sheet.rowCount;row++){
      const description=text(row,columns[0]!),quantity=valueMoney(text(row,columns[1]!)),unit=text(row,columns[2]!),unitPrice=valueMoney(text(row,columns[3]!))
      if(description&&quantity!==undefined&&unit&&unitPrice!==undefined){lines.push({description,quantity,unit,unitPrice});add('basis.lines.'+(lines.length-1),sheet,row,columns[0]!)}
      if(lines.length>1000)stop('EXCEL_COORDINATE_LIMIT')
     }
     output.fields.basis=kind==='materials'?{kind,deliverySite:metadataValue(['dia diem giao'],'basis.deliverySite'),lines}:{kind,lines}
    }else warnings.add('EXCEL_LAYOUT_UNRECOGNIZED')
   }
   output.warnings=[...warnings]
   return costExtractionResultSchema.parse(output)
  }catch(error){
   const warning=costExtractionResultSchema.shape.warnings.element.safeParse(error instanceof Error?error.message:'')
   return result('failed',[warning.success?warning.data:'EXCEL_FILE_INVALID'])
  }
 }
}
export class OfflineCostExtractionAdapter implements CostExtractionAdapter{
 private readonly excel=new ExcelCostExtractionAdapter()
 extract(input:CostExtractionInput):Promise<ExtractionResult>{
  return input.mimeType===xlsx?this.excel.extract(input):Promise.resolve(result('unavailable',[input.mimeType==='application/vnd.ms-excel'?'LEGACY_XLS_PARSER_UNAVAILABLE':'OCR_PROVIDER_NOT_CONFIGURED'],'offline-unavailable-v1'))
 }
}
export class SyntheticFixtureExtractionAdapter implements CostExtractionAdapter{
 constructor(private readonly fixtures:ReadonlyMap<string,ExtractionResult>){}
 async extract(input:CostExtractionInput){
  const value=this.fixtures.get(createHash('sha256').update(input.bytes).digest('hex'))
  return value?costExtractionResultSchema.parse({...structuredClone(value),methodVersion:'synthetic-fixture-v1'}):result('unavailable',['EXCEL_LAYOUT_UNRECOGNIZED'],'synthetic-fixture-v1')
 }
}
