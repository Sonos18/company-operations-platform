set local lock_timeout = '5s';
set local statement_timeout = '90s';
select pg_catalog.pg_advisory_xact_lock(71842, 31);
-- Permission catalog only: no account, role or membership is assigned by this migration.
insert into public.permissions(code,module,name,description) values
('project.cost_manager.assign','costs','Phân công quản lý duyệt chi phí','Quyền trong quy trình chi phí có chứng từ'),
('cost.request.submit','costs','Lập và gửi yêu cầu chi phí','Quyền trong quy trình chi phí có chứng từ'),
('cost.request.decide','costs','Duyệt yêu cầu chi phí dự án được phân công','Quyền trong quy trình chi phí có chứng từ'),
('cost.request.read','costs','Xem yêu cầu chi phí','Quyền trong quy trình chi phí có chứng từ'),
('cost.request.file.read','costs','Xem và tải chứng từ chi phí','Quyền trong quy trình chi phí có chứng từ'),
('cost.party.read','costs','Tra cứu đối tác chi phí','Quyền trong quy trình chi phí có chứng từ'),
('cost.notification.read','costs','Xem thông báo duyệt chi phí','Quyền trong quy trình chi phí có chứng từ')
on conflict(code) do nothing;

create function private.c1_workflow_is_current_manager(target_tenant_id uuid,target_company_id uuid,target_project_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
 select private.has_company_permission(target_tenant_id,target_company_id,'cost.request.decide')
 and (select assignment.manager_user_id from public.cost_workflow_manager_assignments assignment
      where assignment.tenant_id=target_tenant_id and assignment.company_id=target_company_id and assignment.project_id=target_project_id
      order by assignment.assignment_version desc limit 1) = (select auth.uid());
$$;
create function private.c1_workflow_is_director(target_tenant_id uuid,target_company_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
 select private.has_company_permission(target_tenant_id,target_company_id,'project.cost_manager.assign')
 and exists(select 1 from public.cost_workflow_companies company
   where company.tenant_id=target_tenant_id and company.company_id=target_company_id
   and company.notification_recipient_id=(select auth.uid()));
$$;
create function private.c1_workflow_can_read(target_tenant_id uuid,target_company_id uuid,target_project_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
 select private.has_company_permission(target_tenant_id,target_company_id,'cost.request.read')
 and (private.has_company_permission(target_tenant_id,target_company_id,'cost.request.submit')
      or private.c1_workflow_is_current_manager(target_tenant_id,target_company_id,target_project_id)
      or private.c1_workflow_is_director(target_tenant_id,target_company_id));
$$;
revoke all on function private.c1_workflow_is_current_manager(uuid,uuid,uuid),private.c1_workflow_is_director(uuid,uuid),private.c1_workflow_can_read(uuid,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function private.c1_workflow_is_current_manager(uuid,uuid,uuid),private.c1_workflow_is_director(uuid,uuid),private.c1_workflow_can_read(uuid,uuid,uuid) to authenticated;

create function private.c1_workflow_retain_history() returns trigger
language plpgsql set search_path = '' as $$
begin
 raise exception using errcode='P0001',message='WORKFLOW_HISTORY_IMMUTABLE';
end;
$$;
revoke all on function private.c1_workflow_retain_history() from public,anon,authenticated,service_role;

alter table public.cost_workflow_companies enable row level security;
alter table public.cost_workflow_companies force row level security;
revoke all on public.cost_workflow_companies from public,anon,authenticated,service_role;
grant select on public.cost_workflow_companies to authenticated;
create policy cost_workflow_companies_read on public.cost_workflow_companies for select to authenticated using (private.has_company_permission(tenant_id,company_id,'cost.request.read') or private.c1_workflow_is_director(tenant_id,company_id));
create trigger cost_workflow_companies_retain before delete on public.cost_workflow_companies for each row execute function private.c1_workflow_retain_history();

alter table public.cost_workflow_party_classifications enable row level security;
alter table public.cost_workflow_party_classifications force row level security;
revoke all on public.cost_workflow_party_classifications from public,anon,authenticated,service_role;
grant select on public.cost_workflow_party_classifications to authenticated;
create policy cost_workflow_party_classifications_read on public.cost_workflow_party_classifications for select to authenticated using (private.has_company_permission(tenant_id,company_id,'cost.party.read'));
create trigger cost_workflow_party_classifications_retain before update or delete on public.cost_workflow_party_classifications for each row execute function private.c1_workflow_retain_history();

alter table public.cost_workflow_manager_assignments enable row level security;
alter table public.cost_workflow_manager_assignments force row level security;
revoke all on public.cost_workflow_manager_assignments from public,anon,authenticated,service_role;
grant select on public.cost_workflow_manager_assignments to authenticated;
create policy cost_workflow_manager_assignments_read on public.cost_workflow_manager_assignments for select to authenticated using (private.c1_workflow_can_read(tenant_id,company_id,project_id));
create trigger cost_workflow_manager_assignments_retain before update or delete on public.cost_workflow_manager_assignments for each row execute function private.c1_workflow_retain_history();

alter table public.cost_workflow_contracts enable row level security;
alter table public.cost_workflow_contracts force row level security;
revoke all on public.cost_workflow_contracts from public,anon,authenticated,service_role;
grant select on public.cost_workflow_contracts to authenticated;
create policy cost_workflow_contracts_read on public.cost_workflow_contracts for select to authenticated using (private.c1_workflow_can_read(tenant_id,company_id,project_id));
create trigger cost_workflow_contracts_retain before delete on public.cost_workflow_contracts for each row execute function private.c1_workflow_retain_history();

alter table public.cost_workflow_contract_versions enable row level security;
alter table public.cost_workflow_contract_versions force row level security;
revoke all on public.cost_workflow_contract_versions from public,anon,authenticated,service_role;
grant select on public.cost_workflow_contract_versions to authenticated;
create policy cost_workflow_contract_versions_read on public.cost_workflow_contract_versions for select to authenticated using (private.c1_workflow_can_read(tenant_id,company_id,project_id));
create trigger cost_workflow_contract_versions_retain before update or delete on public.cost_workflow_contract_versions for each row execute function private.c1_workflow_retain_history();

alter table public.cost_workflow_requests enable row level security;
alter table public.cost_workflow_requests force row level security;
revoke all on public.cost_workflow_requests from public,anon,authenticated,service_role;
grant select on public.cost_workflow_requests to authenticated;
create policy cost_workflow_requests_read on public.cost_workflow_requests for select to authenticated using (private.c1_workflow_can_read(tenant_id,company_id,project_id));
create trigger cost_workflow_requests_retain before delete on public.cost_workflow_requests for each row execute function private.c1_workflow_retain_history();

alter table public.cost_workflow_request_versions enable row level security;
alter table public.cost_workflow_request_versions force row level security;
revoke all on public.cost_workflow_request_versions from public,anon,authenticated,service_role;
grant select on public.cost_workflow_request_versions to authenticated;
create policy cost_workflow_request_versions_read on public.cost_workflow_request_versions for select to authenticated using (private.c1_workflow_can_read(tenant_id,company_id,project_id));
create trigger cost_workflow_request_versions_retain before update or delete on public.cost_workflow_request_versions for each row execute function private.c1_workflow_retain_history();

alter table public.cost_workflow_decisions enable row level security;
alter table public.cost_workflow_decisions force row level security;
revoke all on public.cost_workflow_decisions from public,anon,authenticated,service_role;
grant select on public.cost_workflow_decisions to authenticated;
create policy cost_workflow_decisions_read on public.cost_workflow_decisions for select to authenticated using (private.c1_workflow_can_read(tenant_id,company_id,project_id));
create trigger cost_workflow_decisions_retain before update or delete on public.cost_workflow_decisions for each row execute function private.c1_workflow_retain_history();

alter table public.cost_workflow_installments enable row level security;
alter table public.cost_workflow_installments force row level security;
revoke all on public.cost_workflow_installments from public,anon,authenticated,service_role;
grant select on public.cost_workflow_installments to authenticated;
create policy cost_workflow_installments_read on public.cost_workflow_installments for select to authenticated using (private.c1_workflow_can_read(tenant_id,company_id,project_id));
create trigger cost_workflow_installments_retain before update or delete on public.cost_workflow_installments for each row execute function private.c1_workflow_retain_history();

alter table public.cost_workflow_payments enable row level security;
alter table public.cost_workflow_payments force row level security;
revoke all on public.cost_workflow_payments from public,anon,authenticated,service_role;
grant select on public.cost_workflow_payments to authenticated;
create policy cost_workflow_payments_read on public.cost_workflow_payments for select to authenticated using (private.c1_workflow_can_read(tenant_id,company_id,project_id));
create trigger cost_workflow_payments_retain before update or delete on public.cost_workflow_payments for each row execute function private.c1_workflow_retain_history();

alter table public.cost_workflow_consumptions enable row level security;
alter table public.cost_workflow_consumptions force row level security;
revoke all on public.cost_workflow_consumptions from public,anon,authenticated,service_role;
grant select on public.cost_workflow_consumptions to authenticated;
create policy cost_workflow_consumptions_read on public.cost_workflow_consumptions for select to authenticated using (private.c1_workflow_can_read(tenant_id,company_id,project_id));
create trigger cost_workflow_consumptions_retain before update or delete on public.cost_workflow_consumptions for each row execute function private.c1_workflow_retain_history();

alter table public.cost_workflow_refunds enable row level security;
alter table public.cost_workflow_refunds force row level security;
revoke all on public.cost_workflow_refunds from public,anon,authenticated,service_role;
grant select on public.cost_workflow_refunds to authenticated;
create policy cost_workflow_refunds_read on public.cost_workflow_refunds for select to authenticated using (private.c1_workflow_can_read(tenant_id,company_id,project_id));
create trigger cost_workflow_refunds_retain before update or delete on public.cost_workflow_refunds for each row execute function private.c1_workflow_retain_history();

alter table public.cost_workflow_corrections enable row level security;
alter table public.cost_workflow_corrections force row level security;
revoke all on public.cost_workflow_corrections from public,anon,authenticated,service_role;
grant select on public.cost_workflow_corrections to authenticated;
create policy cost_workflow_corrections_read on public.cost_workflow_corrections for select to authenticated using (private.c1_workflow_can_read(tenant_id,company_id,project_id));
create trigger cost_workflow_corrections_retain before update or delete on public.cost_workflow_corrections for each row execute function private.c1_workflow_retain_history();

alter table public.cost_workflow_notifications enable row level security;
alter table public.cost_workflow_notifications force row level security;
revoke all on public.cost_workflow_notifications from public,anon,authenticated,service_role;
grant select on public.cost_workflow_notifications to authenticated;
create policy cost_workflow_notifications_read on public.cost_workflow_notifications for select to authenticated using (recipient_id=(select auth.uid()) and private.has_company_permission(tenant_id,company_id,'cost.notification.read'));
create trigger cost_workflow_notifications_retain before delete on public.cost_workflow_notifications for each row execute function private.c1_workflow_retain_history();

alter table public.cost_workflow_extractions enable row level security;
alter table public.cost_workflow_extractions force row level security;
revoke all on public.cost_workflow_extractions from public,anon,authenticated,service_role;
grant select on public.cost_workflow_extractions to authenticated;
create policy cost_workflow_extractions_read on public.cost_workflow_extractions for select to authenticated using (private.c1_workflow_can_read(tenant_id,company_id,project_id));
create trigger cost_workflow_extractions_retain before update or delete on public.cost_workflow_extractions for each row execute function private.c1_workflow_retain_history();
