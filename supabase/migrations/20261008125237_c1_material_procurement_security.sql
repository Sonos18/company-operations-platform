set local lock_timeout = '5s';
set local statement_timeout = '90s';
select pg_catalog.pg_advisory_xact_lock(71842, 42);

insert into public.permissions(code, module, name, description) values
  ('material.read', 'cost', 'Read material procurement', 'Read scoped material catalog and proposals'),
  ('material.manage', 'cost', 'Manage material catalog', 'Create and update canonical materials'),
  ('material.proposal.submit', 'cost', 'Submit material proposals', 'Create, update and submit owned material proposals'),
  ('material.proposal.decide', 'cost', 'Decide material proposals', 'Approve or return submitted material proposals'),
  ('material.order.manage', 'cost', 'Manage material orders', 'Create and read material purchase orders'),
  ('material.supplier.record', 'cost', 'Record chosen suppliers', 'Resolve chosen supplier organizations and supplier material names'),
  ('material.contract.record', 'cost', 'Record material contracts', 'Read orders and record reviewed signed material contracts')
on conflict (code) do nothing;

alter table public.material_items enable row level security;
alter table public.material_items force row level security;
alter table public.material_supplier_names enable row level security;
alter table public.material_supplier_names force row level security;
alter table public.material_proposals enable row level security;
alter table public.material_proposals force row level security;
alter table public.material_proposal_lines enable row level security;
alter table public.material_proposal_lines force row level security;
alter table public.material_proposal_revisions enable row level security;
alter table public.material_proposal_revisions force row level security;
alter table public.material_proposal_revision_lines enable row level security;
alter table public.material_proposal_revision_lines force row level security;
alter table public.material_proposal_decisions enable row level security;
alter table public.material_proposal_decisions force row level security;
alter table public.material_orders enable row level security;
alter table public.material_orders force row level security;
alter table public.material_order_allocations enable row level security;
alter table public.material_order_allocations force row level security;
alter table public.material_order_contracts enable row level security;
alter table public.material_order_contracts force row level security;
alter table public.material_evidence_scopes enable row level security;
alter table public.material_evidence_scopes force row level security;

revoke all on
  public.material_items,
  public.material_supplier_names,
  public.material_proposals,
  public.material_proposal_lines,
  public.material_proposal_revisions,
  public.material_proposal_revision_lines,
  public.material_proposal_decisions,
  public.material_orders,
  public.material_order_allocations,
  public.material_order_contracts,
  public.material_evidence_scopes
from public, anon, authenticated, service_role;

grant select on
  public.material_items,
  public.material_supplier_names,
  public.material_proposals,
  public.material_proposal_lines,
  public.material_proposal_revisions,
  public.material_proposal_revision_lines,
  public.material_proposal_decisions,
  public.material_orders,
  public.material_order_allocations,
  public.material_order_contracts,
  public.material_evidence_scopes
to authenticated;

create function private.c1_material_actor_has_permission(
  target_tenant_id uuid,
  target_company_id uuid,
  target_permission text
)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null
    and private.c1_workflow_user_has_permission(target_tenant_id, target_company_id, auth.uid(), target_permission);
$$;

create function private.c1_material_can_read_proposal(
  target_tenant_id uuid,
  target_company_id uuid,
  target_project_id uuid,
  target_proposal_id uuid
)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.c1_material_actor_has_permission(target_tenant_id, target_company_id, 'material.read')
    and exists (
      select 1
      from public.material_proposals proposal
      where proposal.id = target_proposal_id
        and proposal.tenant_id = target_tenant_id
        and proposal.company_id = target_company_id
        and proposal.project_id = target_project_id
        and (
          proposal.created_by = auth.uid()
          or private.c1_material_actor_has_permission(target_tenant_id, target_company_id, 'material.proposal.decide')
          or private.c1_material_actor_has_permission(target_tenant_id, target_company_id, 'material.order.manage')
          or private.c1_material_actor_has_permission(target_tenant_id, target_company_id, 'material.contract.record')
        )
    );
$$;

create function private.c1_material_can_read_revision(
  target_tenant_id uuid,
  target_company_id uuid,
  target_project_id uuid,
  target_revision_id uuid
)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.material_proposal_revisions revision
    where revision.id = target_revision_id
      and revision.tenant_id = target_tenant_id
      and revision.company_id = target_company_id
      and revision.project_id = target_project_id
      and private.c1_material_can_read_proposal(
        revision.tenant_id,
        revision.company_id,
        revision.project_id,
        revision.proposal_id
      )
  );
$$;

create function private.c1_material_can_read_order(
  target_tenant_id uuid,
  target_company_id uuid,
  target_project_id uuid
)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.c1_material_actor_has_permission(target_tenant_id, target_company_id, 'material.read')
    and (
      private.c1_material_actor_has_permission(target_tenant_id, target_company_id, 'material.order.manage')
      or private.c1_material_actor_has_permission(target_tenant_id, target_company_id, 'material.contract.record')
      or (
        private.c1_material_actor_has_permission(target_tenant_id, target_company_id, 'cost.notification.read')
        and exists (
          select 1
          from public.cost_workflow_companies config
          where config.tenant_id = target_tenant_id
            and config.company_id = target_company_id
            and config.notification_recipient_id = auth.uid()
        )
      )
    )
    and exists (
      select 1
      from public.projects project
      where project.id = target_project_id
        and project.tenant_id = target_tenant_id
        and project.company_id = target_company_id
    );
$$;

revoke all on function
  private.c1_material_actor_has_permission(uuid, uuid, text),
  private.c1_material_can_read_proposal(uuid, uuid, uuid, uuid),
  private.c1_material_can_read_revision(uuid, uuid, uuid, uuid),
  private.c1_material_can_read_order(uuid, uuid, uuid)
from public, anon, authenticated, service_role;

grant execute on function
  private.c1_material_actor_has_permission(uuid, uuid, text),
  private.c1_material_can_read_proposal(uuid, uuid, uuid, uuid),
  private.c1_material_can_read_revision(uuid, uuid, uuid, uuid),
  private.c1_material_can_read_order(uuid, uuid, uuid)
to authenticated;

create policy material_items_read on public.material_items for select to authenticated
using (private.c1_material_actor_has_permission(tenant_id, company_id, 'material.read'));

create policy material_supplier_names_read on public.material_supplier_names for select to authenticated
using (private.c1_material_actor_has_permission(tenant_id, company_id, 'material.read'));

create policy material_proposals_read on public.material_proposals for select to authenticated
using (private.c1_material_can_read_proposal(tenant_id, company_id, project_id, id));

create policy material_proposal_lines_read on public.material_proposal_lines for select to authenticated
using (private.c1_material_can_read_proposal(tenant_id, company_id, project_id, proposal_id));

create policy material_proposal_revisions_read on public.material_proposal_revisions for select to authenticated
using (private.c1_material_can_read_proposal(tenant_id, company_id, project_id, proposal_id));

create policy material_proposal_revision_lines_read on public.material_proposal_revision_lines for select to authenticated
using (private.c1_material_can_read_revision(tenant_id, company_id, project_id, revision_id));

create policy material_proposal_decisions_read on public.material_proposal_decisions for select to authenticated
using (private.c1_material_can_read_proposal(tenant_id, company_id, project_id, proposal_id));

create policy material_orders_financial_read on public.material_orders for select to authenticated
using (private.c1_material_can_read_order(tenant_id, company_id, project_id));

create policy material_order_allocations_financial_read on public.material_order_allocations for select to authenticated
using (private.c1_material_can_read_order(tenant_id, company_id, project_id));

create policy material_order_contracts_financial_read on public.material_order_contracts for select to authenticated
using (private.c1_material_can_read_order(tenant_id, company_id, project_id));

create policy material_evidence_scopes_financial_read on public.material_evidence_scopes for select to authenticated
using (private.c1_material_can_read_order(tenant_id, company_id, project_id));

create policy material_cost_evidence_financial_read on public.cost_evidence_files
for select to authenticated using (
  exists (
    select 1
    from public.material_evidence_scopes as evidence_scope
    where evidence_scope.evidence_file_id = cost_evidence_files.id
      and evidence_scope.tenant_id = cost_evidence_files.tenant_id
      and evidence_scope.company_id = cost_evidence_files.company_id
      and evidence_scope.project_id = cost_evidence_files.project_id
      and private.c1_material_can_read_order(
        evidence_scope.tenant_id,
        evidence_scope.company_id,
        evidence_scope.project_id
      )
  )
);

create or replace function private.c1_workflow_can_read_file(
  target_tenant_id uuid,
  target_company_id uuid,
  target_project_id uuid,
  target_file_id uuid
)
returns boolean language sql stable security definer set search_path='' as $$
  select (
    private.c1_workflow_actor_has_permission(target_tenant_id,target_company_id,'cost.request.file.read')
    and private.c1_workflow_can_read(target_tenant_id,target_company_id,target_project_id)
    and exists (
      select 1
      from public.cost_evidence_files as evidence
      where evidence.id=target_file_id
        and evidence.tenant_id=target_tenant_id
        and evidence.company_id=target_company_id
        and evidence.project_id=target_project_id
        and evidence.status='finalized'
        and (
          (evidence.workflow_origin and evidence.created_by=(select auth.uid())
            and private.c1_workflow_actor_has_permission(target_tenant_id,target_company_id,'cost.request.submit'))
          or exists (
            select 1 from public.cost_workflow_request_evidence as request_evidence
            where request_evidence.evidence_file_id=evidence.id
              and request_evidence.tenant_id=target_tenant_id
              and request_evidence.company_id=target_company_id
              and request_evidence.project_id=target_project_id
          )
          or exists (
            select 1 from public.cost_workflow_contract_versions as basis
            where evidence.id=any(basis.evidence_file_ids)
              and basis.tenant_id=target_tenant_id
              and basis.company_id=target_company_id
              and basis.project_id=target_project_id
          )
          or exists (
            select 1 from public.cost_workflow_legacy_cash_reconciliation as mapping
            where evidence.id=any(mapping.evidence_file_ids)
              and mapping.tenant_id=target_tenant_id
              and mapping.company_id=target_company_id
              and mapping.project_id=target_project_id
          )
          or exists (
            select 1 from public.cost_workflow_payments as payment
            where evidence.id=any(payment.evidence_file_ids)
              and payment.tenant_id=target_tenant_id
              and payment.company_id=target_company_id
              and payment.project_id=target_project_id
          )
          or (
            evidence.workflow_origin
            and evidence.workflow_target_id is not null
            and evidence.workflow_target_kind in ('payment','adjustment','adjustment_source')
          )
        )
    )
  ) or (
    private.c1_material_can_read_order(target_tenant_id,target_company_id,target_project_id)
    and exists (
      select 1
      from public.cost_evidence_files as evidence
      join public.material_evidence_scopes as evidence_scope
        on evidence_scope.evidence_file_id=evidence.id
       and evidence_scope.tenant_id=evidence.tenant_id
       and evidence_scope.company_id=evidence.company_id
       and evidence_scope.project_id=evidence.project_id
      where evidence.id=target_file_id
        and evidence.tenant_id=target_tenant_id
        and evidence.company_id=target_company_id
        and evidence.project_id=target_project_id
        and evidence.status='finalized'
    )
  );
$$;

revoke all on function private.c1_workflow_can_read_file(uuid,uuid,uuid,uuid)
from public,anon,authenticated,service_role;
grant execute on function private.c1_workflow_can_read_file(uuid,uuid,uuid,uuid)
to authenticated;
