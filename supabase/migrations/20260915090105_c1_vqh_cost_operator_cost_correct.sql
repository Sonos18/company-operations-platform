do $$
declare
  v_role_id uuid;
  v_active_actor_count integer;
begin
  select role.id into v_role_id
    from public.roles role
   where role.tenant_id = '10000000-0000-4000-8000-000000000010'::uuid
     and role.company_id = '10000000-0000-4000-8000-000000000020'::uuid
     and role.code = 'c1_vqh_cost_operator'
     and role.is_active;
  if v_role_id is null then
    raise exception using errcode = 'P0001', message = 'C1_COST_OPERATOR_ROLE_REQUIRED';
  end if;

  select count(distinct assignment.user_id) into v_active_actor_count
    from public.company_role_assignments assignment
   where assignment.role_id = v_role_id
     and assignment.revoked_at is null;
  if v_active_actor_count <> 1 then
    raise exception using errcode = 'P0001', message = 'C1_COST_OPERATOR_ACTOR_SCOPE_REQUIRED';
  end if;

  if not exists (
    select 1 from public.permissions permission
     where permission.code = 'cost.correct'
  ) then
    raise exception using errcode = 'P0001', message = 'C1_COST_CORRECT_PERMISSION_REQUIRED';
  end if;

  insert into public.role_permissions (role_id, permission_code)
  select v_role_id, permission.code
    from public.permissions permission
   where permission.code = 'cost.correct'
  on conflict do nothing;
end;
$$;
