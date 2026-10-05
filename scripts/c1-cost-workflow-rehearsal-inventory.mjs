import {createHash} from 'node:crypto'
import {readFileSync,readdirSync,realpathSync,openSync,readSync,closeSync} from 'node:fs'
import {dirname,join,resolve,relative} from 'node:path'
import {createRequire} from 'node:module'
import {fileURLToPath} from 'node:url'
export const workflowSourceRoot=resolve(dirname(fileURLToPath(import.meta.url)),'..')
export const workflowSha=value=>createHash('sha256').update(value).digest('hex')
function fileSha(file){const hash=createHash('sha256'),fd=openSync(file,'r'),buffer=Buffer.alloc(1024*1024);try{let bytes;while((bytes=readSync(fd,buffer,0,buffer.length,null)))hash.update(buffer.subarray(0,bytes));return hash.digest('hex')}finally{closeSync(fd)}}
const bodyNormal=value=>value.replace(/\r\n?/g,'\n').trim()
function splitArguments(value){
 const result=[];let start=0,depth=0,quote=false
 for(let i=0;i<value.length;i++){const c=value[i];if(c==="'"){if(quote&&value[i+1]==="'"){i++;continue}quote=!quote}else if(!quote){if(c==='('||c==='[')depth++;if(c===')'||c===']')depth--;if(c===','&&depth===0){result.push(value.slice(start,i));start=i+1}}}
 if(quote||depth!==0)throw new Error('WORKFLOW_REHEARSAL_SOURCE_ARGUMENTS')
 if(value.trim())result.push(value.slice(start))
 return result
}
function argumentType(value){
 const clean=value.replace(/\s+(?:default|=)[\s\S]*$/i,'').replace(/^\s*(?:inout|in|variadic)\s+/i,'').trim().replace(/\s+/g,' ').toLowerCase()
 const builtin=/^(?:uuid|jsonb?|text|bool(?:ean)?|bigint|smallint|int(?:eger|[248])?|numeric|decimal|real|double precision|timestamp(?:\([0-9]+\))?(?: with(?:out)? time zone)?|timestamptz|date|time|bytea|oid|regclass|record|trigger|void|varchar|character varying)(?:\[\])?$/i
 return builtin.test(clean)||/^\w+\.\w+(?:\[\])?$/.test(clean)?clean:clean.replace(/^\w+\s+/,'')
}
export function workflowFunctionInventory(files){
 const registry=new Map()
 for(const file of files){
  const source=file.sql.replace(/\r\n?/g,'\n'),events=[]
  const definitions=/create\s+(?:or\s+replace\s+)?function\s+([a-z_][a-z_0-9]*\.[a-z_][a-z_0-9]*)\s*\(/gi
  for(const match of source.matchAll(definitions)){
   const start=match.index+match[0].length;let end=start,depth=1,quote=false
   for(;end<source.length&&depth;end++){const c=source[end];if(c==="'"){if(quote&&source[end+1]==="'"){end++;continue}quote=!quote}else if(!quote){if(c==='(')depth++;if(c===')')depth--}}
   if(depth)throw new Error('WORKFLOW_REHEARSAL_SOURCE_FUNCTION')
   const args=splitArguments(source.slice(start,end-1)).filter(v=>!/^\s*out\b/i.test(v)),types=args.map(argumentType)
   const rest=source.slice(end),header=/^[\s\S]*?\bas\s+(\$[a-z_0-9]*\$)/i.exec(rest)
   if(!header)throw new Error('WORKFLOW_REHEARSAL_SOURCE_FUNCTION_BODY')
   const from=header[0].length,to=rest.indexOf(header[1],from)
   if(to<0)throw new Error('WORKFLOW_REHEARSAL_SOURCE_FUNCTION_BODY')
   const after=to+header[1].length,attributes=header[0]+rest.slice(after,rest.indexOf(';',after))
   const name=match[1].toLowerCase(),body=bodyNormal(rest.slice(from,to))
   const config=[...attributes.matchAll(/\bset\s+([a-z_]+)\s*(?:=|to)\s*([\s\S]*?)(?=\b(?:set|as|language|security|stable|immutable|volatile|strict|parallel|returns)\b|$)/gi)].map(m=>m[1].toLowerCase()+'='+m[2].trim().replace(/[\s'"]/g,'')).sort()
   const returns=/\breturns\s+(setof\s+)?([\w.]+(?:\[\])?)/i.exec(attributes)
   const returnType=returns?.[2]?.toLowerCase()==='table'?'record':returns?.[2]?.toLowerCase()
   if(!returnType)throw new Error('WORKFLOW_REHEARSAL_SOURCE_RETURN_TYPE')
   const fn={name,args:args.length,types,defaults:args.filter(v=>/\s+(?:default|=)/i.test(v)).length,returnType,returnsSet:!!returns?.[1]||returns?.[2]?.toLowerCase()==='table',body,sha256:workflowSha(body),definer:/\bsecurity\s+definer\b/i.test(attributes),config,language:/\blanguage\s+(\w+)/i.exec(attributes)?.[1]?.toLowerCase(),volatility:/\bimmutable\b/i.test(attributes)?'i':/\bstable\b/i.test(attributes)?'s':'v',strict:/\bstrict\b|returns\s+null\s+on\s+null\s+input/i.test(attributes),leakproof:/\bleakproof\b/i.test(attributes),parallel:/\bparallel\s+safe\b/i.test(attributes)?'s':/\bparallel\s+restricted\b/i.test(attributes)?'r':'u'}
   events.push({at:match.index,kind:'create',fn})
  }
  for(const m of source.matchAll(/\b(alter|drop)\s+function\s+(?:if\s+exists\s+)?([\w.]+)\s*\(([^;]*?)\)\s*([^;]*);/gi))events.push({at:m.index,kind:m[1].toLowerCase(),name:m[2].toLowerCase(),types:splitArguments(m[3]).map(argumentType),action:m[4].trim()})
  events.sort((a,b)=>a.at-b.at)
  for(const event of events){
   if(event.kind==='create'){registry.set(event.fn.name+'('+event.fn.types.join(',')+')',event.fn);continue}
   const key=event.name+'('+event.types.join(',')+')',fn=registry.get(key)
   if(event.kind==='drop'){registry.delete(key);continue}
   if(!fn)throw new Error('WORKFLOW_REHEARSAL_SOURCE_ALTER_TARGET')
   const rename=/^rename\s+to\s+(\w+)$/i.exec(event.action),config=/^set\s+(\w+)\s*(?:=|to)\s*(.*?)$/i.exec(event.action)
   if(rename){registry.delete(key);fn.name=fn.name.slice(0,fn.name.lastIndexOf('.')+1)+rename[1].toLowerCase();registry.set(fn.name+'('+fn.types.join(',')+')',fn)}
   else if(config){fn.config=fn.config.filter(c=>!c.startsWith(config[1].toLowerCase()+'='));fn.config.push(config[1].toLowerCase()+'='+config[2].replace(/[\s'"]/g,''));fn.config.sort()}
   else throw new Error('WORKFLOW_REHEARSAL_SOURCE_ALTER_UNSUPPORTED')
  }
 }
 return [...registry.values()]
}
export const workflowFunctionDescriptor=fn=>Object.fromEntries(Object.entries(fn).filter(([key])=>key!=='body'))
// Normalize comments and literal values before checking DML targets. Dollar-quoted
// PL/pgSQL bodies remain visible; only single-quoted SQL data and comments are skipped.
function workflowWriterText(sql){
 let text='',commentDepth=0,single=false,line=false
 for(let i=0;i<sql.length;i++){
  const c=sql[i],next=sql[i+1]
  if(line){if(c==='\n'){line=false;text+=' '}continue}
  if(commentDepth){if(c==='/'&&next==='*'){commentDepth++;i++}else if(c==='*'&&next==='/'){commentDepth--;i++}continue}
  if(single){if(c==="'"&&next==="'"){i++;continue}if(c==="\\"){i++;continue}if(c==="'")single=false;continue}
  if(c==='-'&&next==='-'){line=true;i++;text+=' ';continue}
  if(c==='/'&&next==='*'){commentDepth=1;i++;text+=' ';continue}
  if(c==="'"){single=true;text+=' ';continue}
  // Simple quoted identifiers normalize to their unquoted spelling.
  text+=c==='"'?'':c
 }
 if(commentDepth||single)throw new Error('WORKFLOW_REHEARSAL_SELECT_ONLY_IDENTITY')
 return text
}
export function workflowDependencyInventory({baseMigrations,migrations,suites}){
 const functions=workflowFunctionInventory([...baseMigrations,...migrations])
 const byName=new Map()
 for(const fn of functions){const list=byName.get(fn.name)||[];list.push(fn);byName.set(fn.name,list)}
 const triggers=new Map()
 for(const file of [...baseMigrations,...migrations]){
  const events=[]
  for(const m of file.sql.matchAll(/create\s+(?:or\s+replace\s+)?(?:constraint\s+)?trigger\s+(\w+)[\s\S]*?\bon\s+((?:public|private|auth|storage)\.\w+)[\s\S]*?\bexecute\s+(?:function|procedure)\s+([\w.]+)\s*\(([^)]*)\)/gi)){
   const table=m[2].toLowerCase(),name=m[1].toLowerCase(),head=m[0].slice(0,m[0].search(/\bon\s+/i)),types=(/\bfor\s+each\s+row\b/i.test(m[0])?1:0)+(/\bbefore\b/i.test(head)?2:0)+(/\binsert\b/i.test(head)?4:0)+(/\bdelete\b/i.test(head)?8:0)+(/\bupdate\b/i.test(head)?16:0)+(/\btruncate\b/i.test(head)?32:0)+(/\binstead\s+of\b/i.test(head)?64:0)
   const whenRaw=/\bwhen\s*\(([\s\S]*?)\)\s*execute/i.exec(m[0])?.[1]
   const whenParts=whenRaw?.split(/\s+and\s+/i).map(v=>/^\s*((?:old|new)\.\w+)\s*(=|<>)\s*'([a-z_0-9.:-]+)'\s*$/i.exec(v))
   if(whenRaw&&whenParts.some(v=>!v||v[3]!==v[3].toLowerCase()))throw new Error('WORKFLOW_REHEARSAL_TRIGGER_CONDITION_UNREVIEWED')
   const whenExpression=whenParts?whenParts.map(v=>v[1].toLowerCase()+v[2]+"'"+v[3]+"'").join('and'):null
   const args=splitArguments(m[4]).map(v=>{const match=/^\s*'((?:[^']|'')*)'\s*$/.exec(v);if(!match)throw new Error('WORKFLOW_REHEARSAL_TRIGGER_ARGUMENT');return match[1].replaceAll("''","'")})
   const attrs=/\bupdate\s+of\s+(.+?)(?=\s+or\s+|\s+on\s+)/i.exec(m[0])?.[1]?.split(',').map(v=>v.trim().toLowerCase()).sort()||[]
   events.push({at:m.index,add:true,key:table+':'+name,table,fn:m[3].toLowerCase(),type:types,enabled:'O',argsHex:args.map(v=>Buffer.from(v+'\0').toString('hex')).join(''),nArgs:args.length,attributes:attrs,whenExpression,constraint:/\bconstraint\s+trigger\b/i.test(m[0]),deferrable:/\bdeferrable\b/i.test(m[0])&&!/\bnot\s+deferrable\b/i.test(m[0]),initiallyDeferred:/\binitially\s+deferred\b/i.test(m[0])})
  }
  for(const m of file.sql.matchAll(/drop\s+trigger\s+(?:if\s+exists\s+)?(\w+)\s+on\s+((?:public|private|auth|storage)\.\w+)/gi))events.push({at:m.index,add:false,key:m[2].toLowerCase()+':'+m[1].toLowerCase()})
  events.sort((a,b)=>a.at-b.at)
  for(const event of events){if(event.add)triggers.set(event.key,event);else triggers.delete(event.key)}
 }
 const relations=new Set(),calls=new Set()
 const addRefs=text=>{for(const m of text.matchAll(/\b((?:public|private|auth|storage)\.[a-z_][a-z_0-9]*)\b/gi)){const name=m[1].toLowerCase();if(byName.has(name))calls.add(name);else if(!name.startsWith('auth.')||name==='auth.users')relations.add(name)}}
 for(const file of [...migrations,...suites])addRefs(file.sql)
 let size=-1
 while(size!==relations.size+calls.size){
  size=relations.size+calls.size
  for(const trigger of triggers.values())if(relations.has(trigger.table))calls.add(trigger.fn)
  for(const name of calls)for(const fn of byName.get(name)||[])addRefs(fn.body)
 }
 const reachable=functions.filter(fn=>calls.has(fn.name))
 // Source allowlists also cover PL/pgSQL calls and trigger bodies, beyond pg_depend.
 if(reachable.some(fn=>/\b(?:execute|nextval|setval|lo_export|pg_write_file)\b|\b(?:net|http|dblink|aws_s3)\s*\./i.test(fn.body)))throw new Error('WORKFLOW_REHEARSAL_DYNAMIC_DEPENDENCY')
 const selectOnlyIdentities=[]
 if(relations.has('public.workflow_node_events')){
  // Check suite/migration DML and every reachable function, including attached triggers.
  // Ambiguous unqualified writers are rejected too; no allocation exception is created.
  const sources=[...migrations,...suites,...reachable.map(fn=>({sql:fn.body}))]
  const writer=/\b(?:insert\s+into|update(?:\s+only)?|delete\s+from|merge\s+into|truncate(?:\s+table)?|copy)\s+(?:only\s+)?(?:(?:"?public"?)\s*\.\s*)?"?workflow_node_events\b/i
  if(sources.some(file=>{const text=workflowWriterText(file.sql);return writer.test(text)||/\b(?:truncate(?:\s+table)?|drop\s+table)\b[^;]*\bworkflow_node_events\b|\balter\s+table\s+(?:only\s+)?(?:public\.)?workflow_node_events\b/i.test(text)}))throw new Error('WORKFLOW_REHEARSAL_SELECT_ONLY_IDENTITY')
  selectOnlyIdentities.push({relation:'public.workflow_node_events',column:'id',sequence:'public.workflow_node_events_id_seq'})
 }
 const sourceFunctions=functions.map(workflowFunctionDescriptor).sort((a,b)=>(a.name+a.sha256).localeCompare(b.name+b.sha256))
 return {functions:sourceFunctions,selectOnlyIdentities,relations:[...relations].sort(),reachableFunctions:[...calls].sort(),triggers:[...triggers.values()].filter(t=>relations.has(t.table)).map(trigger=>Object.fromEntries(Object.entries(trigger).filter(([key])=>!['at','add','table'].includes(key)))).sort((a,b)=>a.key.localeCompare(b.key))}
}
function filesUnder(directory){
 return readdirSync(directory,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?filesUnder(join(directory,entry.name)):entry.name.endsWith('.mjs')?[join(directory,entry.name)]:[]).sort()
}
export function workflowExecutionInventory(cwd=workflowSourceRoot){
 const sourceFiles=[...filesUnder(resolve(cwd,'scripts')),resolve(cwd,'package.json'),resolve(cwd,'pnpm-lock.yaml'),resolve(cwd,'supabase/config.toml'),resolve(cwd,'supabase/templates/invite.html'),resolve(cwd,'supabase/templates/recovery.html')]
 const executionSources=sourceFiles.map(file=>({name:relative(cwd,file).replaceAll('\\','/'),sha256:workflowSha(readFileSync(file))}))
 const cliPackage=realpathSync(resolve(cwd,'node_modules/supabase/package.json'))
 const meta=JSON.parse(readFileSync(cliPackage,'utf8'))
 if(meta.version!=='2.114.0'||process.platform!=='linux'||process.arch!=='x64')throw new Error('WORKFLOW_REHEARSAL_CLI_PLATFORM')
 const require=createRequire(cliPackage)
 const binaryPackage=require.resolve('@supabase/cli-linux-x64/package.json')
 const binaryMeta=JSON.parse(readFileSync(binaryPackage,'utf8'))
 if(binaryMeta.version!==meta.version)throw new Error('WORKFLOW_REHEARSAL_CLI_VERSION')
 const binary=resolve(dirname(binaryPackage),'bin/supabase')
 const runtime={node:process.version,nodeSha256:fileSha(process.execPath),platform:process.platform,architecture:process.arch,cliVersion:meta.version,wrapperSha256:workflowSha(readFileSync(resolve(dirname(cliPackage),'dist/supabase.js'))),binarySha256:fileSha(binary),binaryPackageSha256:workflowSha(readFileSync(binaryPackage))}
 return {executionSources,runtime,binary}
}
export function readWorkflowBaseMigrations(cwd=workflowSourceRoot){
 return readdirSync(resolve(cwd,'supabase/migrations')).filter(name=>/^\d{14}.*\.sql$/.test(name)&&name.slice(0,14)<'20261004210000').sort().map(name=>({name,sql:readFileSync(resolve(cwd,'supabase/migrations',name),'utf8')}))
}
