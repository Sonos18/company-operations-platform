import {workflowNativeStateCollectionSql} from './c1-cost-workflow-rehearsal-native.mjs'
import {workflowAllSequenceCollectionSql} from './c1-cost-workflow-rehearsal-all-sequences.mjs'

// Keep both original collection bodies and every later validation boundary.
// Sequence counters are not MVCC: the existing overlap/postflight checks remain.
export const workflowSnapshotPairSql="begin isolation level repeatable read read only;\nset local transaction_timeout='15s';set local statement_timeout='15s';set local lock_timeout='5s';set local idle_in_transaction_session_timeout='5s';\n"+workflowNativeStateCollectionSql+'\n'+workflowAllSequenceCollectionSql+"\nselect pg_catalog.current_setting('taskovia.workflow_snapshot_result')::jsonb::text as snapshot,pg_catalog.current_setting('taskovia.workflow_all_sequences') as sequences,clock_timestamp()::text as server_time,current_database() as database,session_user as username;\nrollback;"
export function workflowSnapshotPairRows(response){
 const row=response?.rows?.[0]
 if(response?.rows?.length!==1||!row||Object.keys(row).sort().join(',')!=='database,sequences,server_time,snapshot,username'||!Number.isFinite(Date.parse(row.server_time))||typeof row.server_time!=='string'||typeof row.database!=='string'||typeof row.username!=='string'||!row.snapshot||!row.sequences||![row.snapshot,row.sequences].every(value=>typeof value==='string'||typeof value==='object'&&!Array.isArray(value)))throw new Error('WORKFLOW_REHEARSAL_SNAPSHOT_PAIR_INVALID')
 const metadata={server_time:row.server_time,database:row.database,username:row.username}
 return {fullResponse:{rows:[{...metadata,snapshot:row.snapshot}]},allResponse:{rows:[{...metadata,sequences:row.sequences}]}}
}
