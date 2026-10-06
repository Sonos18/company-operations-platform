import {isDeepStrictEqual} from 'node:util'
import {workflowSha} from './c1-cost-workflow-rehearsal-inventory.mjs'
import {workflowSequenceNames,workflowSequenceBudgets,workflowCumulativeBudgets,sequenceAllocations} from './c1-cost-workflow-rehearsal-catalog.mjs'
const parse=value=>typeof value==='string'?JSON.parse(value):value
const keys=(value,wanted)=>value&&typeof value==='object'&&!Array.isArray(value)&&isDeepStrictEqual(Object.keys(value).sort(),[...wanted].sort())
const oid=value=>typeof value==='string'&&/^[1-9][0-9]{0,9}$/.test(value)&&BigInt(value)<=4294967295n||Number.isInteger(value)&&value>0&&value<=4294967295
export const workflowAllSequencePolicy=Object.freeze({
 inventory:Object.freeze([{"oid":"16510","schema":"auth","name":"refresh_tokens_id_seq"},{"oid":"17263","schema":"realtime","name":"subscription_id_seq"},{"oid":"20603","schema":"public","name":"audit_events_id_seq"},{"oid":"20827","schema":"public","name":"company_role_assignments_id_seq"},{"oid":"21159","schema":"public","name":"workflow_node_events_id_seq"}].map(item=>Object.freeze(item))),
 exceptionNames:Object.freeze([...workflowSequenceNames]),perSuite:Object.freeze(workflowSequenceBudgets.map(row=>Object.freeze([...row]))),total:Object.freeze([...workflowCumulativeBudgets]),unapprovedAllocationAllowance:0,
 coverage:'all pg_sequence rows across all namespaces; exact inventory, metadata and nonbudget counters',
 baseline:'complete all-sequence census is included in the separately hashed accepted native baseline',
 evidence:'pgtap-99407dbe-f340-4646-a275-6dcc6672c173-all-sequences-after.json',
})
const allSequenceCollectionSql=String.raw`
do $workflow_all_sequence_census$
declare r record;state jsonb='{}';value jsonb;
begin
 for r in select c.oid,c.relname,c.relpersistence,c.relowner,c.relacl,n.oid namespace_oid,n.nspname,s.*
 from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
 join pg_catalog.pg_sequence s on s.seqrelid=c.oid order by c.oid
 loop
  execute format('select jsonb_build_object(''lastValue'',last_value::text,''isCalled'',is_called) from %I.%I',r.nspname,r.relname) into value;
  state=state||jsonb_build_object(r.oid::text,value||jsonb_build_object('oid',r.oid::text,'schemaOid',r.namespace_oid::text,'schema',r.nspname,'name',r.relname,'ownerOid',r.relowner::text,'persistence',r.relpersistence,'aclSha256',encode(sha256(convert_to(coalesce(r.relacl::text,'NULL'),'UTF8')),'hex'),'typeOid',r.seqtypid::text,'start',r.seqstart::text,'increment',r.seqincrement::text,'min',r.seqmin::text,'max',r.seqmax::text,'cache',r.seqcache::text,'cycle',r.seqcycle));
 end loop;
 perform pg_catalog.set_config('taskovia.workflow_all_sequences',state::text,true);
end;$workflow_all_sequence_census$;
`
export const workflowAllSequenceSnapshotSql="begin isolation level repeatable read read only;\nset local transaction_timeout='15s';set local statement_timeout='15s';set local lock_timeout='5s';set local idle_in_transaction_session_timeout='5s';\n"+allSequenceCollectionSql+"select current_setting('taskovia.workflow_all_sequences') as sequences,clock_timestamp()::text as server_time,current_database() as database,session_user as username;\nrollback;"
export function workflowAllSequenceSnapshot(response){
 let row,state
 try{
  if(response?.rows?.length!==1)throw Error()
  row=response.rows[0];state=parse(row.sequences)
  if(row.database!=='postgres'||row.username!=='postgres'||typeof row.server_time!=='string'||!Number.isFinite(Date.parse(row.server_time))||!state||typeof state!=='object'||Array.isArray(state))throw Error()
  const fields=['oid','schemaOid','schema','name','ownerOid','persistence','aclSha256','typeOid','start','increment','min','max','cache','cycle','lastValue','isCalled']
  if(Object.keys(state).length!==workflowAllSequencePolicy.inventory.length)throw Error()
  for(const item of workflowAllSequencePolicy.inventory)if(state[item.oid]?.schema!==item.schema||state[item.oid]?.name!==item.name)throw Error()
  for(const [key,value] of Object.entries(state)){
   if(!oid(key)||!keys(value,fields)||value.oid!==key||!['schemaOid','ownerOid','typeOid'].every(k=>oid(value[k])))throw Error()
   if(!['schema','name'].every(k=>typeof value[k]==='string'&&value[k].length>0&&Buffer.byteLength(value[k],'utf8')<=63)||!['p','u','t'].includes(value.persistence)||! /^[a-f0-9]{64}$/.test(value.aclSha256))throw Error()
   if(!['start','increment','min','max','cache','lastValue'].every(k=>typeof value[k]==='string'&&/^-?[0-9]{1,20}$/.test(value[k])&&BigInt(value[k])>=-9223372036854775808n&&BigInt(value[k])<=9223372036854775807n)||typeof value.cycle!=='boolean'||typeof value.isCalled!=='boolean')throw Error()
  }
 }catch{throw new Error('WORKFLOW_REHEARSAL_ALL_SEQUENCE_INVALID')}
 return {...row,sequences:state}
}
export function assertWorkflowAllSequencePostflight(before,after,index,cumulative=[0n,0n]){
 const left=workflowAllSequenceSnapshot({rows:[before]}),right=workflowAllSequenceSnapshot({rows:[after]})
 if(left.database!==right.database||left.username!==right.username||Date.parse(right.server_time)<Date.parse(left.server_time))throw new Error('WORKFLOW_REHEARSAL_ALL_SEQUENCE_CHANGED')
 const allocations=[0n,0n]
 for(const key of Object.keys(left.sequences)){
  const first=left.sequences[key],last=right.sequences[key],name=first.schema+'.'+first.name,position=workflowAllSequencePolicy.exceptionNames.indexOf(name)
  const metadata=value=>Object.fromEntries(Object.entries(value).filter(([key])=>key!=='lastValue'&&key!=='isCalled'))
  if(!isDeepStrictEqual(metadata(first),metadata(last)))throw new Error('WORKFLOW_REHEARSAL_ALL_SEQUENCE_METADATA_CHANGED')
  if(position<0){if(!isDeepStrictEqual(first,last))throw new Error('WORKFLOW_REHEARSAL_UNAPPROVED_SEQUENCE_CHANGE')}
  else allocations[position]=sequenceAllocations(first,last)
 }
 const limits=index==='total'?workflowAllSequencePolicy.total:workflowAllSequencePolicy.perSuite[index]
 if(!limits||!Array.isArray(cumulative)||cumulative.length!==2||cumulative.some(n=>typeof n!=='bigint'||n<0n))throw new Error('WORKFLOW_REHEARSAL_SEQUENCE_BUDGET')
 const next=allocations.map((value,i)=>value+cumulative[i])
 if(allocations.some((value,i)=>value>BigInt(limits[i]))||next.some((value,i)=>value>BigInt(workflowAllSequencePolicy.total[i])))throw new Error('WORKFLOW_REHEARSAL_SEQUENCE_BUDGET')
 return {allocations,cumulative:next,allSequenceCount:Object.keys(right.sequences).length,unapprovedSequencesUnchanged:true,allSequenceSnapshotSha256:workflowSha(JSON.stringify(right))}
}
export function assertWorkflowAllSequenceOverlap(full,all){
 for(const [name,value] of Object.entries(full.snapshot.sequences)){
  const matches=Object.values(all.sequences).filter(sequence=>sequence.schema+'.'+sequence.name===name)
  if(matches.length!==1||!Object.entries(value).every(([key,v])=>isDeepStrictEqual(matches[0][key],v)))throw new Error('WORKFLOW_REHEARSAL_ALL_SEQUENCE_ADMISSION_CHANGED')
 }
}
export function workflowAllSequenceAdmissionSql(before){
 const literal="'"+JSON.stringify(before.sequences).replaceAll("'","''")+"'"
 return allSequenceCollectionSql+"do $workflow_pgtap_sequence_admission$ begin if pg_catalog.current_setting('taskovia.workflow_all_sequences')::jsonb is distinct from "+literal+"::jsonb then raise exception 'WORKFLOW_REHEARSAL_ALL_SEQUENCE_ADMISSION_CHANGED';end if;end;$workflow_pgtap_sequence_admission$;\n"
}

