begin;
select plan(19);
select has_table('public', 'tenants', 'tenants exists');
select has_table('public', 'companies', 'companies exists');
select has_table('public', 'tenant_memberships', 'tenant memberships exists');
select has_table('public', 'company_memberships', 'company memberships exists');
select has_table('public', 'audit_events', 'audit events exists');
select has_column('public', 'companies', 'tenant_id', 'company has tenant scope');
select has_column('public', 'company_memberships', 'company_id', 'membership has company scope');
select has_column('public', 'audit_events', 'request_id', 'audit has request ID');
select has_function('public', 'is_tenant_member', array['uuid'], 'tenant helper exists');
select has_function('public', 'is_company_member', array['uuid', 'uuid'], 'company helper exists');
select ok(
  exists (
    select 1
    from pg_constraint con
    where con.conrelid = 'public.company_memberships'::regclass
      and con.contype = 'f'
      and con.conkey = array[
        (select attnum from pg_attribute where attrelid = 'public.company_memberships'::regclass and attname = 'user_id'),
        (select attnum from pg_attribute where attrelid = 'public.company_memberships'::regclass and attname = 'tenant_id')
      ]
      and con.confrelid = 'public.tenant_memberships'::regclass
  ),
  'company membership requires a tenant membership in the same tenant'
);
select ok(
  exists (
    select 1
    from pg_constraint con
    where con.conrelid = 'public.company_memberships'::regclass
      and con.contype = 'f'
      and con.conkey = array[
        (select attnum from pg_attribute where attrelid = 'public.company_memberships'::regclass and attname = 'company_id'),
        (select attnum from pg_attribute where attrelid = 'public.company_memberships'::regclass and attname = 'tenant_id')
      ]
      and con.confrelid = 'public.companies'::regclass
  ),
  'company membership requires a company in the same tenant'
);
select ok(
  exists (
    select 1
    from pg_constraint con
    where con.conrelid = 'public.audit_events'::regclass
      and con.contype = 'f'
      and con.conkey = array[
        (select attnum from pg_attribute where attrelid = 'public.audit_events'::regclass and attname = 'company_id'),
        (select attnum from pg_attribute where attrelid = 'public.audit_events'::regclass and attname = 'tenant_id')
      ]
      and con.confrelid = 'public.companies'::regclass
  ),
  'audit events require a company in the same tenant'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.tenants'::regclass)
  and (select relrowsecurity from pg_class where oid = 'public.companies'::regclass)
  and (select relrowsecurity from pg_class where oid = 'public.tenant_memberships'::regclass)
  and (select relrowsecurity from pg_class where oid = 'public.company_memberships'::regclass)
  and (select relrowsecurity from pg_class where oid = 'public.audit_events'::regclass),
  'RLS is enabled on every tenancy table'
);
select ok(
  exists (
    select 1 from pg_proc
    where oid = 'public.is_tenant_member(uuid)'::regprocedure
      and prosecdef
      and coalesce(proconfig, array[]::text[]) @> array['search_path=""']
  ),
  'tenant helper is a definer function with an empty search path'
);
select ok(
  exists (
    select 1 from pg_proc
    where oid = 'public.is_company_member(uuid, uuid)'::regprocedure
      and prosecdef
      and coalesce(proconfig, array[]::text[]) @> array['search_path=""']
  ),
  'company helper is a definer function with an empty search path'
);
select ok(
  not (
    has_table_privilege('anon', 'public.tenants', 'select') or has_table_privilege('anon', 'public.tenants', 'truncate') or has_table_privilege('anon', 'public.tenants', 'references') or has_table_privilege('anon', 'public.tenants', 'trigger') or has_table_privilege('anon', 'public.tenants', 'maintain')
    or has_table_privilege('anon', 'public.companies', 'select') or has_table_privilege('anon', 'public.companies', 'truncate') or has_table_privilege('anon', 'public.companies', 'references') or has_table_privilege('anon', 'public.companies', 'trigger') or has_table_privilege('anon', 'public.companies', 'maintain')
    or has_table_privilege('anon', 'public.tenant_memberships', 'select') or has_table_privilege('anon', 'public.tenant_memberships', 'truncate') or has_table_privilege('anon', 'public.tenant_memberships', 'references') or has_table_privilege('anon', 'public.tenant_memberships', 'trigger') or has_table_privilege('anon', 'public.tenant_memberships', 'maintain')
    or has_table_privilege('anon', 'public.company_memberships', 'select') or has_table_privilege('anon', 'public.company_memberships', 'truncate') or has_table_privilege('anon', 'public.company_memberships', 'references') or has_table_privilege('anon', 'public.company_memberships', 'trigger') or has_table_privilege('anon', 'public.company_memberships', 'maintain')
    or has_table_privilege('anon', 'public.audit_events', 'select') or has_table_privilege('anon', 'public.audit_events', 'truncate') or has_table_privilege('anon', 'public.audit_events', 'references') or has_table_privilege('anon', 'public.audit_events', 'trigger') or has_table_privilege('anon', 'public.audit_events', 'maintain')
  ),
  'anon lacks all tenancy table privileges'
);
select ok(
  not (
    has_table_privilege('authenticated', 'public.tenants', 'truncate') or has_table_privilege('authenticated', 'public.tenants', 'references') or has_table_privilege('authenticated', 'public.tenants', 'trigger') or has_table_privilege('authenticated', 'public.tenants', 'maintain')
    or has_table_privilege('authenticated', 'public.companies', 'truncate') or has_table_privilege('authenticated', 'public.companies', 'references') or has_table_privilege('authenticated', 'public.companies', 'trigger') or has_table_privilege('authenticated', 'public.companies', 'maintain')
    or has_table_privilege('authenticated', 'public.tenant_memberships', 'truncate') or has_table_privilege('authenticated', 'public.tenant_memberships', 'references') or has_table_privilege('authenticated', 'public.tenant_memberships', 'trigger') or has_table_privilege('authenticated', 'public.tenant_memberships', 'maintain')
    or has_table_privilege('authenticated', 'public.company_memberships', 'truncate') or has_table_privilege('authenticated', 'public.company_memberships', 'references') or has_table_privilege('authenticated', 'public.company_memberships', 'trigger') or has_table_privilege('authenticated', 'public.company_memberships', 'maintain')
    or has_table_privilege('authenticated', 'public.audit_events', 'truncate') or has_table_privilege('authenticated', 'public.audit_events', 'references') or has_table_privilege('authenticated', 'public.audit_events', 'trigger') or has_table_privilege('authenticated', 'public.audit_events', 'maintain')
  ),
  'authenticated lacks mutation and administrative table privileges'
);
select ok(
  has_table_privilege('authenticated', 'public.tenants', 'select')
  and has_table_privilege('authenticated', 'public.companies', 'select')
  and has_table_privilege('authenticated', 'public.tenant_memberships', 'select')
  and has_table_privilege('authenticated', 'public.company_memberships', 'select')
  and has_table_privilege('authenticated', 'public.audit_events', 'select'),
  'authenticated retains intended select permissions'
);
select * from finish();
rollback;
