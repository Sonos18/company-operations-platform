import {describe,it,expect} from 'vitest'
import {workflowSnapshotPairSql,workflowSnapshotPairRows} from '../../../scripts/c1-cost-workflow-rehearsal-snapshot-pair.mjs'
import {workflowNativeStateCollectionSql} from '../../../scripts/c1-cost-workflow-rehearsal-native.mjs'
import {workflowAllSequenceCollectionSql} from '../../../scripts/c1-cost-workflow-rehearsal-all-sequences.mjs'
const meta={server_time:'2026-10-06T09:00:00Z',database:'postgres',username:'postgres'}
const row=()=>({...meta,snapshot:'{"complete":"original bytes"}',sequences:'{"all":"original bytes"}'})
describe('lossless paired read-only snapshot',()=>{
 it('collects untouched bodies once inside one bounded rollback transaction',()=>{
  expect(workflowSnapshotPairSql).toContain(workflowNativeStateCollectionSql)
  expect(workflowSnapshotPairSql).toContain(workflowAllSequenceCollectionSql)
  expect(workflowSnapshotPairSql.match(/begin isolation level repeatable read read only;/g)).toHaveLength(1)
  expect(workflowSnapshotPairSql.match(/rollback;/g)).toHaveLength(1)
  for(const text of ["transaction_timeout='15s'","statement_timeout='15s'","lock_timeout='5s'","idle_in_transaction_session_timeout='5s'"])expect(workflowSnapshotPairSql).toContain(text)
  expect(workflowSnapshotPairSql.trim().endsWith('rollback;')).toBe(true)
  expect(workflowSnapshotPairSql).not.toMatch(/nextval\s*\(|setval\s*\(|create table|alter role/i)
 })
 it('projects both original evidence rows without parsing or dropping payload bytes',()=>{
  const value=row(),pair=workflowSnapshotPairRows({rows:[value]})
  expect(pair.fullResponse).toEqual({rows:[{...meta,snapshot:value.snapshot}]})
  expect(pair.allResponse).toEqual({rows:[{...meta,sequences:value.sequences}]})
 })
 it.each(['snapshot','sequences','server_time','database','username'])('rejects missing %s instead of accepting partial evidence',field=>{
  const value=Object.fromEntries(Object.entries(row()).filter(([key])=>key!==field))
  expect(()=>workflowSnapshotPairRows({rows:[value]})).toThrow('SNAPSHOT_PAIR_INVALID')
 })
 it.each([[],[row(),row()]])('rejects a missing or multiple envelope',rows=>{
  expect(()=>workflowSnapshotPairRows({rows})).toThrow('SNAPSHOT_PAIR_INVALID')
 })
 it.each([{...row(),unexpected:'private prose'},{...row(),server_time:'invalid'},{...row(),snapshot:null},{...row(),sequences:null}])('rejects malformed paired row',value=>{
  expect(()=>workflowSnapshotPairRows({rows:[value]})).toThrow('SNAPSHOT_PAIR_INVALID')
 })
})
