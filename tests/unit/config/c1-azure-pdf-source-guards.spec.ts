import {readFileSync} from 'node:fs'
import {describe,it,expect} from 'vitest'
const extraction=readFileSync('supabase/migrations/20261004210600_c1_cost_workflow_extraction.sql','utf8')
const store=readFileSync('supabase/migrations/20261005045710_c1_cost_ocr_azure_f0_storage.sql','utf8')
describe('prepared PDF SQL identity and coverage guards',()=>{
 it('validates original-bound coverage before public review-result persistence',()=>{
  expect(extraction).toContain('create function private.c1_workflow_validate_pdf_coverage')
  expect(extraction).toContain("original->>'mimeType'='application/pdf'")
  expect(extraction).toContain("private.c1_workflow_validate_pdf_coverage(result,original->>'sha256',(original->>'sizeBytes')::bigint,null)")
 })
 it('retains exact prefix units in the private SQL canonical identity',()=>{
  expect(store).toContain("to_json('azure-pdf-scope-v1'::text)::text||','||to_json(pdf_scope)::text")
  expect(store).toContain("source_mime='application/pdf'")
  expect(store).toContain("pdf_scope='1' and pages<>1")
 })
 it('guards both reservation and CAS against another uncertain original send',()=>{
  const lookups=store.match(/other_job\.state in\('sending','submitted','uncertain'\)/g)||[]
  expect(lookups.length).toBeGreaterThanOrEqual(2)
  expect(store).toContain("other_job.result->'azurePdfCoverage' is null")
  expect(store).toContain('other_job.sha256=sha')
 })
 it('requires coverage at durable completion and keeps only the private server grant',()=>{
  expect(store).toContain('private.c1_workflow_validate_pdf_coverage(v_result,sha,source_size,job.pages)')
  expect(store).toContain('revoke all on function public.c1_cost_ocr_azure_f0_job(text,jsonb,jsonb) from public,anon,authenticated,service_role;')
  expect(store).toContain('grant execute on function public.c1_cost_ocr_azure_f0_job(text,jsonb,jsonb) to service_role;')
 })
})
