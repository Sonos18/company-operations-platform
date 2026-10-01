-- C1 ORDINARY DETAIL CONCURRENCY FIXTURE
begin;
alter table public.cost_categories disable trigger a_c1_finance_prepare;
alter table public.roles disable trigger roles_audit_role_catalog_change;
alter table public.role_permissions disable trigger role_permissions_audit_role_catalog_change;
alter table public.company_role_assignments disable trigger company_role_assignments_audit_employee_rbac_change;
alter table public.company_role_assignments disable trigger company_role_assignments_prevent_last_admin_removal;
alter table public.audit_events disable trigger audit_events_prevent_mutation;
delete from public.cost_command_receipts receipt where receipt.command_name = 'cost_evidence.detail_link' and exists (select 1 from public.cost_evidence_links link join public.project_cost_item_details detail on detail.id=link.project_cost_item_detail_id join public.project_cost_items item on item.id=detail.project_cost_item_id where receipt.result_resource_id=link.id and item.tenant_id='c1f10000-0000-4000-8000-000000000010' and item.company_id='c1f10000-0000-4000-8000-000000000020' and item.project_id='c1f10000-0000-4000-8000-000000000102');
delete from public.cost_command_receipts receipt where receipt.command_name like 'project_cost_detail.%' and exists (select 1 from public.project_cost_item_details detail join public.project_cost_items item on item.id=detail.project_cost_item_id where receipt.result_resource_id=detail.id and item.tenant_id='c1f10000-0000-4000-8000-000000000010' and item.company_id='c1f10000-0000-4000-8000-000000000020' and item.project_id='c1f10000-0000-4000-8000-000000000102');
delete from public.cost_command_receipts where tenant_id = 'c1f10000-0000-4000-8000-000000000010' and company_id = 'c1f10000-0000-4000-8000-000000000020' and actor_id = 'c1f10000-0000-4000-8000-000000000903' and command_name in ('project_cost.correct','project_cost_detail.create_and_publish');
delete from public.audit_events audit where audit.action like 'c1.project_cost_detail.%' and exists (select 1 from public.project_cost_item_details detail join public.project_cost_items item on item.id=detail.project_cost_item_id where audit.resource_type='project_cost_item_detail' and audit.resource_id=detail.id::text and item.tenant_id='c1f10000-0000-4000-8000-000000000010' and item.company_id='c1f10000-0000-4000-8000-000000000020' and item.project_id='c1f10000-0000-4000-8000-000000000102');
delete from public.cost_evidence_links link where exists (select 1 from public.project_cost_item_details detail join public.project_cost_items item on item.id=detail.project_cost_item_id where link.project_cost_item_detail_id=detail.id and item.tenant_id='c1f10000-0000-4000-8000-000000000010' and item.company_id='c1f10000-0000-4000-8000-000000000020' and item.project_id='c1f10000-0000-4000-8000-000000000102');
delete from public.project_cost_item_detail_sources link where exists (select 1 from public.project_cost_item_details detail join public.project_cost_items item on item.id=detail.project_cost_item_id where link.project_cost_item_detail_id=detail.id and item.tenant_id='c1f10000-0000-4000-8000-000000000010' and item.company_id='c1f10000-0000-4000-8000-000000000020' and item.project_id='c1f10000-0000-4000-8000-000000000102');
do $$
declare v_item record;
begin
  for v_item in select item.id from public.project_cost_items item where item.tenant_id='c1f10000-0000-4000-8000-000000000010' and item.company_id='c1f10000-0000-4000-8000-000000000020' and item.project_id='c1f10000-0000-4000-8000-000000000102' loop
    if private.c1_project_cost_item_has_managed_detail_state('c1f10000-0000-4000-8000-000000000010','c1f10000-0000-4000-8000-000000000020',v_item.id) then raise exception 'C1 ordinary detail cleanup managed state remains for fixture parent %',v_item.id; end if;
  end loop;
end;
$$;
delete from public.project_cost_items where tenant_id = 'c1f10000-0000-4000-8000-000000000010' and company_id = 'c1f10000-0000-4000-8000-000000000020' and project_id = 'c1f10000-0000-4000-8000-000000000102';
delete from public.cost_categories where id in ('c1f10000-0000-4000-8000-000000000301','c1f10000-0000-4000-8000-000000000302') and tenant_id = 'c1f10000-0000-4000-8000-000000000010' and company_id = 'c1f10000-0000-4000-8000-000000000020';
delete from public.projects where id = 'c1f10000-0000-4000-8000-000000000102' and tenant_id = 'c1f10000-0000-4000-8000-000000000010' and company_id = 'c1f10000-0000-4000-8000-000000000020';
delete from public.company_cost_settings where tenant_id = 'c1f10000-0000-4000-8000-000000000010' and company_id = 'c1f10000-0000-4000-8000-000000000020';
delete from public.company_role_assignments where tenant_id = 'c1f10000-0000-4000-8000-000000000010' and company_id = 'c1f10000-0000-4000-8000-000000000020' and user_id = 'c1f10000-0000-4000-8000-000000000903' and role_id = 'c1f10000-0000-4000-8000-000000000913';
delete from public.role_permissions where role_id = 'c1f10000-0000-4000-8000-000000000913';
delete from public.roles where id = 'c1f10000-0000-4000-8000-000000000913' and tenant_id = 'c1f10000-0000-4000-8000-000000000010' and company_id = 'c1f10000-0000-4000-8000-000000000020';
delete from public.company_memberships where user_id = 'c1f10000-0000-4000-8000-000000000903' and tenant_id = 'c1f10000-0000-4000-8000-000000000010' and company_id = 'c1f10000-0000-4000-8000-000000000020';
delete from public.tenant_memberships where user_id = 'c1f10000-0000-4000-8000-000000000903' and tenant_id = 'c1f10000-0000-4000-8000-000000000010';
delete from public.audit_events where tenant_id = 'c1f10000-0000-4000-8000-000000000010' and company_id = 'c1f10000-0000-4000-8000-000000000020';
delete from public.companies where id = 'c1f10000-0000-4000-8000-000000000020' and tenant_id = 'c1f10000-0000-4000-8000-000000000010';
delete from public.tenants where id = 'c1f10000-0000-4000-8000-000000000010';
delete from auth.users where id = 'c1f10000-0000-4000-8000-000000000903';
alter table public.audit_events enable trigger audit_events_prevent_mutation;
alter table public.company_role_assignments enable trigger company_role_assignments_prevent_last_admin_removal;
alter table public.company_role_assignments enable trigger company_role_assignments_audit_employee_rbac_change;
alter table public.role_permissions enable trigger role_permissions_audit_role_catalog_change;
alter table public.roles enable trigger roles_audit_role_catalog_change;
alter table public.cost_categories enable trigger a_c1_finance_prepare;
commit;
