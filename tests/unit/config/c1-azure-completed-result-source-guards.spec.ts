import {readFileSync} from 'node:fs'
import {describe,it,expect} from 'vitest'
const sql=readFileSync('supabase/migrations/20261007163847_c1_cost_ocr_azure_f0_read_result.sql','utf8')
const signature='public.c1_cost_ocr_azure_f0_read_result(jsonb,jsonb)'
describe('completed Azure raw evidence read-only SQL boundary',()=>{
 it('exposes only the service role capability with a stable private-table reader',()=>{
  expect(sql).toContain('create function public.c1_cost_ocr_azure_f0_read_result(p_binding jsonb,p_payload jsonb) returns jsonb')
  expect(sql).toContain("language plpgsql stable security definer set search_path='' as $$")
  expect(sql).toContain('revoke all on function '+signature+' from public,anon,authenticated,service_role;')
  expect(sql).toContain('grant execute on function '+signature+' to service_role;')
  const body=sql.split('as $$')[1]?.split('$$;')[0]??''
  expect(body).not.toMatch(/\b(?:update|insert|delete|truncate|pg_advisory|for\s+(?:update|share))\b/i)
 })
 it('requires exact frozen actor, request and immutable original bindings',()=>{
  for(const token of ['j.tenant_id=t','j.company_id=c','j.project_id=p','j.file_id=fid','j.file_version=fv','j.sha256=sha','j.created_by=actor','j.request_id is not distinct from rid','j.request_version is not distinct from rv','f.status=\'finalized\' ',"f.workflow_evidence_kind='quotation'",'f.version=fv','f.verified_sha256=sha',"r.version=rv","r.state in('working','returned')"]){expect(sql).toContain(token)}
  expect(sql).toContain("array['key','resourceId'],array['key','resourceId']")
 })
 it('binds completed fixed provider identity and independently verifies the unchanged canonical key',()=>{
  for(const token of ["j.state='complete'","j.resource_id=resource","j.model='prebuilt-layout'","j.configuration_version='azure-f0-rest-2024-11-30-quotation-v2'","j.pages between 1 and 2","key is distinct from expected_key","to_json('azure-pdf-scope-v1'::text)::text"]){expect(sql).toContain(token)}
  expect(sql).toContain("private.c1_workflow_validate_pdf_coverage(job.result,sha,source_size,job.pages)")
  expect(sql).toContain("job.result->'azurePdfCoverage'->'requestedPagesMatched' is distinct from 'true'::jsonb")
 })
 it('bounds private JSON and verifies succeeded model/page evidence before returning it',()=>{
  for(const token of ["octet_length(raw::text)>4000000","raw->>'status' is distinct from 'succeeded'","raw->'analyzeResult'->>'apiVersion' is distinct from '2024-11-30'","raw->'analyzeResult'->>'modelId' is distinct from 'prebuilt-layout'","v_returned is distinct from v_requested","jsonb_build_object('raw',raw)"]){expect(sql).toContain(token)}
  expect(sql).not.toMatch(/grant\s+(?:select|all)\s+on\s+(?:table\s+)?private\./i)
 })
})
