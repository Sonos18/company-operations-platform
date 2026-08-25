alter function public.set_updated_at() set search_path = '';
revoke all on function public.set_updated_at() from public, anon, authenticated;

do $$
begin
  if pg_catalog.to_regprocedure('public.rls_auto_enable()') is not null then
    execute 'revoke execute on function public.rls_auto_enable() from public, anon, authenticated';
  end if;
end
$$;

drop policy if exists roles_select_company_role_catalog on public.roles;
create policy roles_select_company_role_catalog on public.roles
  for select to authenticated
  using (
    is_active
    and (
      private.can_read_role_catalog(tenant_id, company_id)
      or private.has_company_permission(tenant_id, company_id, 'employee.read_all')
      or private.has_company_permission(tenant_id, company_id, 'employee.read_private')
      or exists (
        select 1
        from public.company_role_assignments assignment
        join public.company_memberships membership
          on membership.tenant_id = assignment.tenant_id
         and membership.company_id = assignment.company_id
         and membership.user_id = assignment.user_id
         and membership.is_active
        where assignment.role_id = roles.id
          and assignment.tenant_id = roles.tenant_id
          and assignment.company_id = roles.company_id
          and assignment.user_id = (select auth.uid())
          and assignment.revoked_at is null
      )
    )
  );

drop policy if exists company_role_assignments_select_self_or_role_manager
  on public.company_role_assignments;
create policy company_role_assignments_select_self_or_role_manager
  on public.company_role_assignments
  for select to authenticated
  using (
    (
      user_id = (select auth.uid())
      and public.is_company_member(tenant_id, company_id)
    )
    or private.can_read_role_catalog(tenant_id, company_id)
  );
