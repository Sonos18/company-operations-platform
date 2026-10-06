// Replay only the three pinned historical pg_get_functiondef corrections in memory.
// These applied migration files and database functions are never edited or executed here.
const target=(name,originalSha256,correctedSha256,from,to,count)=>Object.freeze({name,originalSha256,correctedSha256,from,to,count})
export const workflowReviewedBaselineCorrections=Object.freeze([
 Object.freeze({provenance:'20260922083315_c1_accounting_write_snapshot_constraint_scope_fix.sql',provenanceSha256:'590024e6d94b376f62aa438fc3636d1b47f9c0670377894bbf9e4c1abd717863',reason:'Qualify the intended public deferred constraint under an empty search_path.',targets:Object.freeze([
  target('private.c1_prepare_project_cost_financials','291524a2b2c664d3d459c397a9068a6ad7a0ddb9164231ef7fdf2164e6fe18ec','e75161901484ff2bf96d5570f5ffb030beed5c7e3caa6faa48af73575aabc94b','set constraints c1_project_cost_item_details_sync','set constraints public.c1_project_cost_item_details_sync',2),
  target('private.c1_correct_published_project_cost','e687f05eca6e18f0d567fb132c47f58e0385b2014af67d4d8b7b5ebebf250fe9','ae2325a43801386b88c248b8a2830f2238cf446fc5c0799df27065d7806d8d94','set constraints c1_project_cost_item_details_sync','set constraints public.c1_project_cost_item_details_sync',2)
 ])}),
 Object.freeze({provenance:'20260922092309_c1_accounting_write_evidence_kind_contract_fix.sql',provenanceSha256:'35ba72457c5c6a01121173148c3182583f04e82320f18e0eabe9e67e094bf58f',reason:'Existing evidence contract correction changes the accepted source kind from source_file to source_workbook.',targets:Object.freeze([
  target('private.c1_link_cost_evidence','cefce9d31af69deb827fdd6d4c9bd5fd62bdf6cbe569f6c4815b2b2c71cc49a8','8e27acd5484ac9bb16682dfd0b1f51e265d21e11070ac02916b2c616cc6f2a5a',"'source_file'","'source_workbook'",1)
 ])}),
 Object.freeze({provenance:'20260922101400_c1_accounting_write_finalize_validation_fix.sql',provenanceSha256:'4435ab0dc26e2b2c484a83548e9825a38eb64ec0d96a397b9e1fa72da31a4610',reason:'Existing object validation correction counts the keys after the object and allowed-key guards.',targets:Object.freeze([
  target('private.c1_finalize_cost_evidence','2b790f659c3392adba739ce9efa1296ce58af6ac07ace2cd0ed8c22fae83d2bf','03637014cdfa9ba47231f769c895ef08a9ed560c484930eef32387509e11cba9','jsonb_object_length(target_input)','(select count(*) from jsonb_object_keys(target_input))',1)
 ])})
])
export function workflowReplayBaselineCorrection(file,registry,sha){
 const profile=workflowReviewedBaselineCorrections.find(entry=>entry.provenance===file.name)
 if(!profile)return
 if(sha(file.sql)!==profile.provenanceSha256)throw new Error('WORKFLOW_REHEARSAL_BASELINE_CORRECTION_DRIFT')
 for(const entry of profile.targets){
  const matches=[...registry.values()].filter(fn=>fn.name===entry.name)
  if(matches.length!==1)throw new Error('WORKFLOW_REHEARSAL_BASELINE_CORRECTION_TARGET')
  const fn=matches[0]
  if(fn.sha256!==entry.originalSha256||fn.body.split(entry.from).length-1!==entry.count)throw new Error('WORKFLOW_REHEARSAL_BASELINE_CORRECTION_DRIFT')
  const body=fn.body.replaceAll(entry.from,entry.to)
  if(sha(body)!==entry.correctedSha256)throw new Error('WORKFLOW_REHEARSAL_BASELINE_CORRECTION_DRIFT')
  // Preserve every signature, security, configuration and volatility attribute.
  fn.body=body;fn.sha256=entry.correctedSha256
 }
}

// Exact existing policy helpers needed by this cost/role relation closure.
// This source-defined list is never populated from live catalogue contents.
export const workflowReviewedPolicyRoots=Object.freeze([
 'private.c1_can_read_project_cost',
 'private.c1_can_read_project_cost_detail',
 'private.c1_can_read_project_cost_detail_evidence_metadata',
 'private.c1_can_read_project_cost_detail_source',
 'private.c1_can_read_source',
 'private.can_read_role_catalog',
 'private.has_any_active_company_membership',
 'public.is_company_member',
 'public.is_tenant_member'
])
export const workflowReviewedPolicyScope=Object.freeze([
 'public.project_cost_items','public.project_cost_item_details',
 'public.cost_source_files','public.company_roles','public.company_role_assignments'
])
