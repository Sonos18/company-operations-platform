import {createHash} from 'node:crypto'
import {lstatSync,realpathSync,readdirSync,readFileSync} from 'node:fs'
import {resolve,join,relative,sep,parse} from 'node:path'
import {CANONICAL_DEV_PROJECT_REF} from './assert-cloud-dev-target.mjs'
export const workflowLinkedRoot='/data/remote-worktrees/task1-task2-integration'
const hash=value=>createHash('sha256').update(value).digest('hex')
function metadata(path){
 const stat=lstatSync(path,{bigint:true})
 if(stat.isSymbolicLink()||(!stat.isDirectory()&&!stat.isFile())||realpathSync(path)!==path)throw new Error('WORKFLOW_REHEARSAL_LINK_PATH')
 return {kind:stat.isDirectory()?'directory':'file',realpath:realpathSync(path),device:String(stat.dev),inode:String(stat.ino),ctimeNs:String(stat.ctimeNs),mtimeNs:String(stat.mtimeNs),size:String(stat.size),mode:String(stat.mode),uid:String(stat.uid),gid:String(stat.gid)}
}
export function workflowLinkedEndpoint(value){
 // Validate original syntax before URL parsing can normalize it. Never retain a password.
 const match=/^(postgres|postgresql):\/\/([^:@/?#]+)@([^:/?#]+):5432\/postgres$/.exec(value.trim())
 if(!match)throw new Error('WORKFLOW_REHEARSAL_LINK_ENDPOINT')
 let username
 try{username=decodeURIComponent(match[2])}catch{throw new Error('WORKFLOW_REHEARSAL_LINK_ENDPOINT')}
 const hostname=match[3]
 const pooler=/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+pooler\.supabase\.com$/.test(hostname)&&username==='postgres.'+CANONICAL_DEV_PROJECT_REF
 const direct=hostname==='db.'+CANONICAL_DEV_PROJECT_REF+'.supabase.co'&&username==='postgres'
 if(!pooler&&!direct)throw new Error('WORKFLOW_REHEARSAL_LINK_ENDPOINT')
 return {scheme:match[1],hostname,port:5432,database:'postgres',username,kind:pooler?'official-pooler':'official-direct'}
}
function cacheMetadata(root){
 const entries={}
 const visit=path=>{
  const name=relative(root,path).split(sep).join('/')||'.'
  entries[name]=metadata(path)
  if(entries[name].kind==='directory')for(const child of readdirSync(path).sort()){
   if(!/^[a-zA-Z0-9._-]+$/.test(child))throw new Error('WORKFLOW_REHEARSAL_LINK_PATH')
   visit(join(path,child))
  }
 }
 visit(join(root,'supabase','.temp'))
 return entries
}
export function readWorkflowLinkMetadata(linkRoot=workflowLinkedRoot){
 try{
  const root=resolve(linkRoot),paths={}
  // Reject symlinks in every ancestor, including retained root and config paths.
  let ancestor=parse(root).root
  for(const segment of root.slice(ancestor.length).split(sep).filter(Boolean)){ancestor=join(ancestor,segment);metadata(ancestor)}
  for(const name of ['.','supabase','supabase/templates','supabase/config.toml','supabase/templates/invite.html','supabase/templates/recovery.html'])paths[name]=metadata(resolve(root,name))
  const cache=cacheMetadata(root)
  const read=name=>readFileSync(join(root,'supabase','.temp',name),'utf8')
  const projectRef=read('project-ref').trim()
  if(projectRef!==CANONICAL_DEV_PROJECT_REF)throw new Error('WORKFLOW_REHEARSAL_LINK_PROJECT')
  const pooler=read('pooler-url'),endpoint=workflowLinkedEndpoint(pooler),linkedText=read('linked-project.json')
  let project
  try{project=JSON.parse(linkedText)}catch{throw new Error('WORKFLOW_REHEARSAL_LINK_PROJECT')}
  const keys=['name','organization_id','organization_slug','ref']
  const rawKeys=[...linkedText.matchAll(/"((?:[^"\\]|\\.)*)"\s*:/g)].map(match=>match[1]).sort()
  if(JSON.stringify(rawKeys)!==JSON.stringify(keys.slice().sort()))throw new Error('WORKFLOW_REHEARSAL_LINK_PROJECT')
  if(!project||Array.isArray(project)||JSON.stringify(Object.keys(project).sort())!==JSON.stringify(keys.slice().sort())||keys.some(key=>typeof project[key]!=='string'||!project[key])||project.ref!==CANONICAL_DEV_PROJECT_REF)throw new Error('WORKFLOW_REHEARSAL_LINK_PROJECT')
  const contentHashes=Object.fromEntries(['supabase/config.toml','supabase/templates/invite.html','supabase/templates/recovery.html'].map(name=>[name,hash(readFileSync(resolve(root,name)))]))
  // Opaque cache/credential material is never read or hashed; only the verified nonsecret seam is.
  contentHashes['supabase/.temp/project-ref']=hash(read('project-ref'))
  contentHashes['supabase/.temp/pooler-url']=hash(pooler)
  contentHashes['supabase/.temp/linked-project.json']=hash(linkedText)
  if(JSON.stringify(cache)!==JSON.stringify(cacheMetadata(root))||Object.entries(paths).some(([name,value])=>JSON.stringify(value)!==JSON.stringify(metadata(resolve(root,name)))))throw new Error('WORKFLOW_REHEARSAL_LINK_CHANGED')
  return {root,projectRef,endpoint,project,contentHashes,paths,cache}
 }catch(error){
  if(/^WORKFLOW_REHEARSAL_LINK_/.test(error?.message))throw error
  throw new Error('WORKFLOW_REHEARSAL_LINK_UNAVAILABLE',{cause:error})
 }
}
export function assertWorkflowLinkUnchanged(linkRoot,frozen){
 const current=readWorkflowLinkMetadata(linkRoot)
 if(JSON.stringify(current)!==JSON.stringify(frozen))throw new Error('WORKFLOW_REHEARSAL_LINK_CHANGED')
 return current
}
