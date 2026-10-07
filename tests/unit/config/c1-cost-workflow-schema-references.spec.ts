import { readFileSync, readdirSync } from 'node:fs'
import { expect, it } from 'vitest'
const types=readFileSync('shared/types/database.types.ts','utf8')
const files=readdirSync('supabase/migrations').filter(n=>/^20261004210\d00_/.test(n))
const prepared=files.map(file=>({file,sql:readFileSync('supabase/migrations/'+file,'utf8')}))
const catalog=new Map([...types.matchAll(/^ {6}(\w+): \{\s+Row: \{([\s\S]*?)\n {8}\}/gm)].map(m=>[m[1]!,new Set([...m[2]!.matchAll(/^ {10}(\w+):/gm)].map(c=>c[1]!))]))
// Forward-only, unapplied additions are part of this prepared schema, not generated Cloud DEV types.
for(const {sql} of prepared)for(const alter of sql.matchAll(/alter table public\.(\w+)([\s\S]*?);/gi))for(const column of alter[2]!.matchAll(/add column(?: if not exists)? (\w+)/gi))catalog.get(alter[1]!)?.add(column[1]!)
it('canonical table aliases and INSERT columns in prepared SQL match generated types plus additive DDL',()=>{
 const checked=new Set<string>()
 for(const {file,sql} of prepared)for(const query of sql.split(';')){
  const bindings=new Map<string,Set<string>>()
  for(const match of query.matchAll(/(?:from|join|update)\s+public\.(\w+)\s+(?:as\s+)?(\w+)/gi)){
   const table=match[1]!,alias=match[2]!
   if(/^(where|set|for|on|union|order|returning|values|into|limit|group)$/i.test(alias))continue
   const bound=bindings.get(alias)??new Set<string>();bound.add(table);bindings.set(alias,bound)
  }
  for(const [alias,tables] of bindings){
   // Reused nested aliases still require PostgreSQL compilation/runtime verification.
   if(tables.size!==1)continue
   const table=[...tables][0]!,columns=catalog.get(table)
   if(!columns)continue
   for(const reference of query.matchAll(new RegExp('\\b'+alias+'\\.(\\w+)','g'))){
    checked.add(table+'.'+reference[1]);expect(columns.has(reference[1]!),file+': '+table+'.'+reference[1]).toBe(true)
   }
  }
  for(const insert of query.matchAll(/insert into public\.(\w+)\s*\(([\w,\s]+)\)/gi)){
   const columns=catalog.get(insert[1]!)
   if(!columns)continue
   for(const column of insert[2]!.split(',').map(c=>c.trim()))expect(columns.has(column),file+': INSERT '+insert[1]+'.'+column).toBe(true)
  }
 }
 expect(checked.size).toBeGreaterThan(80)
})
it('re-uploading a known primary basis with a supporting-document label cannot bypass its cap',()=>{
 const sql=prepared.find(p=>p.file.includes('extraction.sql'))!.sql
 const guard=sql.slice(sql.indexOf('create or replace function private.c1_workflow_validate_request'),sql.indexOf('create or replace function private.c1_workflow_request_view'))
 expect(guard).toContain('known.verified_sha256=any(private.c1_workflow_primary_basis_hashes(t,c,p,v.evidence_file_ids))')
 expect(guard).toContain('selected.verified_sha256=known.verified_sha256')
 expect(guard).not.toContain('selected.verified_sha256=any(private.c1_workflow_primary_basis_hashes(t,c,p,ids))')
})
it('prepares relabeled same-byte quote negatives and legitimate nonprimary sharing SQL cases',()=>{
 const sql=readFileSync('supabase/tests/database/c1/c1_cost_workflow_requests.test.sql','utf8')
 expect(sql).toContain('reuploaded primary quote relabeled invoice cannot bypass its cap')
 expect(sql).toContain('reuploaded primary quote relabeled accounting_support cannot bypass its cap')
 expect(sql).toContain('genuine nonprimary support may be shared without creating another cap')
})
