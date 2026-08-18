begin;
select no_plan();

select has_table('public', 'departments');
select has_table('public', 'positions');
select has_table('public', 'employees');
select has_table('public', 'employee_private_details');
select has_table('public', 'roles');
select has_table('public', 'permissions');
select has_table('public', 'role_permissions');
select has_table('public', 'company_role_assignments');

select has_function('private', 'has_company_permission', array['uuid', 'uuid', 'text']);
select has_function('public', 'complete_employee_onboarding');
select has_function('public', 'revoke_company_role_assignment');
select has_function('public', 'revoke_company_role_assignment', array['bigint', 'text']);

select is(
  (select format_type(atttypid, atttypmod)
   from pg_attribute
   where attrelid = 'public.company_memberships'::regclass
     and attname = 'is_active'),
  'boolean',
  'company memberships records active state as a boolean'
);
select ok(
  (select attnotnull
   from pg_attribute
   where attrelid = 'public.company_memberships'::regclass
     and attname = 'is_active'),
  'company memberships active state is required'
);
select is(
  (select pg_get_expr(adbin, adrelid)
   from pg_attrdef
   where adrelid = 'public.company_memberships'::regclass
     and adnum = (
       select attnum
       from pg_attribute
       where attrelid = 'public.company_memberships'::regclass
         and attname = 'is_active'
     )),
  'true',
  'company memberships default to active'
);
select ok(exists (
  select 1
  from pg_constraint
  where conrelid = 'public.company_memberships'::regclass
    and contype = 'u'
    and conkey = array[
      (select attnum from pg_attribute where attrelid = 'public.company_memberships'::regclass and attname = 'tenant_id'),
      (select attnum from pg_attribute where attrelid = 'public.company_memberships'::regclass and attname = 'company_id'),
      (select attnum from pg_attribute where attrelid = 'public.company_memberships'::regclass and attname = 'user_id')
    ]
), 'company memberships has the ordered same-scope user candidate key');
select ok(exists (
  select 1
  from pg_index i
  where i.indexrelid = 'public.company_memberships_active_scope_user_idx'::regclass
    and i.indrelid = 'public.company_memberships'::regclass
    and not i.indisunique
    and pg_get_indexdef(i.indexrelid) ilike '%(tenant_id, company_id, user_id)%'
    and pg_get_expr(i.indpred, i.indrelid) = 'is_active'
), 'company memberships has an ordered active scope-user lookup index');

select is(
  (select array_agg(attname::text order by attnum) from pg_attribute where attrelid = 'public.departments'::regclass and attnum > 0 and not attisdropped),
  array['id', 'tenant_id', 'company_id', 'code', 'name', 'description', 'is_active', 'created_at', 'updated_at']::text[],
  'departments has exactly the approved columns'
);
select is(
  (select array_agg(format_type(atttypid, atttypmod) order by attnum) from pg_attribute where attrelid = 'public.departments'::regclass and attnum > 0 and not attisdropped),
  array['uuid', 'uuid', 'uuid', 'text', 'text', 'text', 'boolean', 'timestamp with time zone', 'timestamp with time zone']::text[],
  'departments columns have approved types'
);
select is(
  (select array_agg(attnotnull order by attnum) from pg_attribute where attrelid = 'public.departments'::regclass and attnum > 0 and not attisdropped),
  array[true, true, true, true, true, false, true, true, true]::boolean[],
  'departments columns have approved nullability'
);

select is(
  (select array_agg(attname::text order by attnum) from pg_attribute where attrelid = 'public.positions'::regclass and attnum > 0 and not attisdropped),
  array['id', 'tenant_id', 'company_id', 'code', 'name', 'level', 'description', 'is_active', 'created_at', 'updated_at']::text[],
  'positions has exactly the approved columns'
);
select is(
  (select array_agg(format_type(atttypid, atttypmod) order by attnum) from pg_attribute where attrelid = 'public.positions'::regclass and attnum > 0 and not attisdropped),
  array['uuid', 'uuid', 'uuid', 'text', 'text', 'smallint', 'text', 'boolean', 'timestamp with time zone', 'timestamp with time zone']::text[],
  'positions columns have approved types'
);
select is(
  (select array_agg(attnotnull order by attnum) from pg_attribute where attrelid = 'public.positions'::regclass and attnum > 0 and not attisdropped),
  array[true, true, true, true, true, false, false, true, true, true]::boolean[],
  'positions columns have approved nullability'
);

select is(
  (select array_agg(attname::text order by attnum) from pg_attribute where attrelid = 'public.employees'::regclass and attnum > 0 and not attisdropped),
  array['id', 'tenant_id', 'company_id', 'user_id', 'employee_code', 'full_name', 'work_email', 'department_id', 'position_id', 'manager_employee_id', 'hire_date', 'probation_end_date', 'employment_status', 'created_by', 'created_at', 'updated_at']::text[],
  'employees has exactly the approved columns'
);
select is(
  (select array_agg(format_type(atttypid, atttypmod) order by attnum) from pg_attribute where attrelid = 'public.employees'::regclass and attnum > 0 and not attisdropped),
  array['uuid', 'uuid', 'uuid', 'uuid', 'text', 'text', 'text', 'uuid', 'uuid', 'uuid', 'date', 'date', 'text', 'uuid', 'timestamp with time zone', 'timestamp with time zone']::text[],
  'employees columns have approved types'
);
select is(
  (select array_agg(attnotnull order by attnum) from pg_attribute where attrelid = 'public.employees'::regclass and attnum > 0 and not attisdropped),
  array[true, true, true, true, true, true, true, true, false, false, false, false, true, true, true, true]::boolean[],
  'employees columns have approved nullability'
);

select is(
  (select array_agg(attname::text order by attnum) from pg_attribute where attrelid = 'public.employee_private_details'::regclass and attnum > 0 and not attisdropped),
  array['employee_id', 'tenant_id', 'company_id', 'date_of_birth', 'gender', 'personal_email', 'personal_phone', 'current_address', 'permanent_address', 'tax_code', 'social_insurance_number', 'emergency_contact_name', 'emergency_contact_phone', 'created_at', 'updated_at']::text[],
  'employee private details has exactly the approved columns'
);
select is(
  (select array_agg(format_type(atttypid, atttypmod) order by attnum) from pg_attribute where attrelid = 'public.employee_private_details'::regclass and attnum > 0 and not attisdropped),
  array['uuid', 'uuid', 'uuid', 'date', 'text', 'text', 'text', 'text', 'text', 'text', 'text', 'text', 'text', 'timestamp with time zone', 'timestamp with time zone']::text[],
  'employee private details columns have approved types'
);
select is(
  (select array_agg(attnotnull order by attnum) from pg_attribute where attrelid = 'public.employee_private_details'::regclass and attnum > 0 and not attisdropped),
  array[true, true, true, false, false, false, false, false, false, false, false, false, false, true, true]::boolean[],
  'employee private details columns have approved nullability'
);

select is(
  (select array_agg(attname::text order by attnum) from pg_attribute where attrelid = 'public.roles'::regclass and attnum > 0 and not attisdropped),
  array['id', 'tenant_id', 'company_id', 'code', 'name', 'description', 'is_privileged', 'is_system', 'is_active', 'created_at', 'updated_at']::text[],
  'roles has exactly the approved columns'
);
select is(
  (select array_agg(format_type(atttypid, atttypmod) order by attnum) from pg_attribute where attrelid = 'public.roles'::regclass and attnum > 0 and not attisdropped),
  array['uuid', 'uuid', 'uuid', 'text', 'text', 'text', 'boolean', 'boolean', 'boolean', 'timestamp with time zone', 'timestamp with time zone']::text[],
  'roles columns have approved types'
);
select is(
  (select array_agg(attnotnull order by attnum) from pg_attribute where attrelid = 'public.roles'::regclass and attnum > 0 and not attisdropped),
  array[true, true, true, true, true, true, true, true, true, true, true]::boolean[],
  'roles columns have approved nullability'
);

select is(
  (select array_agg(attname::text order by attnum) from pg_attribute where attrelid = 'public.permissions'::regclass and attnum > 0 and not attisdropped),
  array['code', 'module', 'name', 'description', 'created_at']::text[],
  'permissions has exactly the approved columns'
);
select is(
  (select array_agg(format_type(atttypid, atttypmod) order by attnum) from pg_attribute where attrelid = 'public.permissions'::regclass and attnum > 0 and not attisdropped),
  array['text', 'text', 'text', 'text', 'timestamp with time zone']::text[],
  'permissions columns have approved types'
);
select is(
  (select array_agg(attnotnull order by attnum) from pg_attribute where attrelid = 'public.permissions'::regclass and attnum > 0 and not attisdropped),
  array[true, true, true, true, true]::boolean[],
  'permissions columns have approved nullability'
);

select is(
  (select array_agg(attname::text order by attnum) from pg_attribute where attrelid = 'public.role_permissions'::regclass and attnum > 0 and not attisdropped),
  array['role_id', 'permission_code', 'created_at']::text[],
  'role permissions has exactly the approved columns'
);
select is(
  (select array_agg(format_type(atttypid, atttypmod) order by attnum) from pg_attribute where attrelid = 'public.role_permissions'::regclass and attnum > 0 and not attisdropped),
  array['uuid', 'text', 'timestamp with time zone']::text[],
  'role permissions columns have approved types'
);
select is(
  (select array_agg(attnotnull order by attnum) from pg_attribute where attrelid = 'public.role_permissions'::regclass and attnum > 0 and not attisdropped),
  array[true, true, true]::boolean[],
  'role permissions columns have approved nullability'
);

select is(
  (select array_agg(attname::text order by attnum) from pg_attribute where attrelid = 'public.company_role_assignments'::regclass and attnum > 0 and not attisdropped),
  array['id', 'tenant_id', 'company_id', 'user_id', 'role_id', 'granted_by', 'granted_at', 'grant_reason', 'revoked_by', 'revoked_at', 'revoke_reason']::text[],
  'company role assignments has exactly the approved columns'
);
select is(
  (select array_agg(format_type(atttypid, atttypmod) order by attnum) from pg_attribute where attrelid = 'public.company_role_assignments'::regclass and attnum > 0 and not attisdropped),
  array['bigint', 'uuid', 'uuid', 'uuid', 'uuid', 'uuid', 'timestamp with time zone', 'text', 'uuid', 'timestamp with time zone', 'text']::text[],
  'company role assignments columns have approved types'
);
select is(
  (select array_agg(attnotnull order by attnum) from pg_attribute where attrelid = 'public.company_role_assignments'::regclass and attnum > 0 and not attisdropped),
  array[true, true, true, true, true, true, true, true, false, false, false]::boolean[],
  'company role assignments columns have approved nullability'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.departments'::regclass)
  and (select relrowsecurity from pg_class where oid = 'public.positions'::regclass)
  and (select relrowsecurity from pg_class where oid = 'public.employees'::regclass)
  and (select relrowsecurity from pg_class where oid = 'public.employee_private_details'::regclass)
  and (select relrowsecurity from pg_class where oid = 'public.roles'::regclass)
  and (select relrowsecurity from pg_class where oid = 'public.permissions'::regclass)
  and (select relrowsecurity from pg_class where oid = 'public.role_permissions'::regclass)
  and (select relrowsecurity from pg_class where oid = 'public.company_role_assignments'::regclass),
  'RLS is enabled on every employee and RBAC table'
);

select ok(exists (select 1 from pg_constraint where conrelid = 'public.departments'::regclass and contype = 'p' and conkey = array[(select attnum from pg_attribute where attrelid = 'public.departments'::regclass and attname = 'id')]), 'departments has an ID primary key');
select ok(exists (select 1 from pg_constraint where conrelid = 'public.positions'::regclass and contype = 'p' and conkey = array[(select attnum from pg_attribute where attrelid = 'public.positions'::regclass and attname = 'id')]), 'positions has an ID primary key');
select ok(exists (select 1 from pg_constraint where conrelid = 'public.employees'::regclass and contype = 'p' and conkey = array[(select attnum from pg_attribute where attrelid = 'public.employees'::regclass and attname = 'id')]), 'employees has an ID primary key');
select ok(exists (select 1 from pg_constraint where conrelid = 'public.employee_private_details'::regclass and contype = 'p' and conkey = array[(select attnum from pg_attribute where attrelid = 'public.employee_private_details'::regclass and attname = 'employee_id')]), 'employee private details is keyed by employee');
select ok(exists (select 1 from pg_constraint where conrelid = 'public.roles'::regclass and contype = 'p' and conkey = array[(select attnum from pg_attribute where attrelid = 'public.roles'::regclass and attname = 'id')]), 'roles has an ID primary key');
select ok(exists (select 1 from pg_constraint where conrelid = 'public.permissions'::regclass and contype = 'p' and conkey = array[(select attnum from pg_attribute where attrelid = 'public.permissions'::regclass and attname = 'code')]), 'permissions is keyed by its code');
select ok(exists (select 1 from pg_constraint where conrelid = 'public.role_permissions'::regclass and contype = 'p' and conkey = array[(select attnum from pg_attribute where attrelid = 'public.role_permissions'::regclass and attname = 'role_id'), (select attnum from pg_attribute where attrelid = 'public.role_permissions'::regclass and attname = 'permission_code')]), 'role permissions has the approved composite primary key');
select ok(exists (select 1 from pg_constraint where conrelid = 'public.company_role_assignments'::regclass and contype = 'p' and conkey = array[(select attnum from pg_attribute where attrelid = 'public.company_role_assignments'::regclass and attname = 'id')]), 'company role assignments has an ID primary key');

select ok(exists (select 1 from pg_constraint where conrelid = 'public.departments'::regclass and contype = 'f' and confrelid = 'public.companies'::regclass and conkey = array[(select attnum from pg_attribute where attrelid = 'public.departments'::regclass and attname = 'company_id'), (select attnum from pg_attribute where attrelid = 'public.departments'::regclass and attname = 'tenant_id')]), 'departments is scoped to its company and tenant');
select ok(exists (select 1 from pg_constraint where conrelid = 'public.positions'::regclass and contype = 'f' and confrelid = 'public.companies'::regclass and conkey = array[(select attnum from pg_attribute where attrelid = 'public.positions'::regclass and attname = 'company_id'), (select attnum from pg_attribute where attrelid = 'public.positions'::regclass and attname = 'tenant_id')]), 'positions is scoped to its company and tenant');
select ok(exists (select 1 from pg_constraint where conrelid = 'public.employees'::regclass and contype = 'f' and confrelid = 'public.companies'::regclass and conkey = array[(select attnum from pg_attribute where attrelid = 'public.employees'::regclass and attname = 'company_id'), (select attnum from pg_attribute where attrelid = 'public.employees'::regclass and attname = 'tenant_id')]), 'employees is scoped to its company and tenant');
select ok(exists (select 1 from pg_constraint where conrelid = 'public.employees'::regclass and contype = 'f' and confrelid = 'auth.users'::regclass and conkey = array[(select attnum from pg_attribute where attrelid = 'public.employees'::regclass and attname = 'user_id')] and confdeltype = 'r'), 'employees requires a retained Auth user');
select ok(exists (select 1 from pg_constraint where conrelid = 'public.employees'::regclass and contype = 'f' and confrelid = 'auth.users'::regclass and conkey = array[(select attnum from pg_attribute where attrelid = 'public.employees'::regclass and attname = 'created_by')] and confdeltype = 'r'), 'employees retains the creating actor');
select ok(exists (select 1 from pg_constraint where conrelid = 'public.employees'::regclass and contype = 'f' and confrelid = 'public.departments'::regclass and conkey = array[(select attnum from pg_attribute where attrelid = 'public.employees'::regclass and attname = 'tenant_id'), (select attnum from pg_attribute where attrelid = 'public.employees'::regclass and attname = 'company_id'), (select attnum from pg_attribute where attrelid = 'public.employees'::regclass and attname = 'department_id')]), 'employees has a same-scope department foreign key');
select ok(exists (select 1 from pg_constraint where conrelid = 'public.employees'::regclass and contype = 'f' and confrelid = 'public.positions'::regclass and conkey = array[(select attnum from pg_attribute where attrelid = 'public.employees'::regclass and attname = 'tenant_id'), (select attnum from pg_attribute where attrelid = 'public.employees'::regclass and attname = 'company_id'), (select attnum from pg_attribute where attrelid = 'public.employees'::regclass and attname = 'position_id')]), 'employees has a same-scope position foreign key');
select ok(exists (select 1 from pg_constraint where conrelid = 'public.employees'::regclass and contype = 'f' and confrelid = 'public.employees'::regclass and conkey = array[(select attnum from pg_attribute where attrelid = 'public.employees'::regclass and attname = 'tenant_id'), (select attnum from pg_attribute where attrelid = 'public.employees'::regclass and attname = 'company_id'), (select attnum from pg_attribute where attrelid = 'public.employees'::regclass and attname = 'manager_employee_id')]), 'employees has a same-scope manager foreign key');
select ok(exists (select 1 from pg_constraint where conrelid = 'public.employee_private_details'::regclass and contype = 'f' and confrelid = 'public.employees'::regclass and conkey = array[(select attnum from pg_attribute where attrelid = 'public.employee_private_details'::regclass and attname = 'tenant_id'), (select attnum from pg_attribute where attrelid = 'public.employee_private_details'::regclass and attname = 'company_id'), (select attnum from pg_attribute where attrelid = 'public.employee_private_details'::regclass and attname = 'employee_id')] and confdeltype = 'c'), 'private details cascades only with deliberate employee deletion');
select ok(exists (select 1 from pg_constraint where conrelid = 'public.roles'::regclass and contype = 'f' and confrelid = 'public.companies'::regclass and conkey = array[(select attnum from pg_attribute where attrelid = 'public.roles'::regclass and attname = 'company_id'), (select attnum from pg_attribute where attrelid = 'public.roles'::regclass and attname = 'tenant_id')]), 'roles is scoped to its company and tenant');
select ok(exists (select 1 from pg_constraint where conrelid = 'public.role_permissions'::regclass and contype = 'f' and confrelid = 'public.roles'::regclass and conkey = array[(select attnum from pg_attribute where attrelid = 'public.role_permissions'::regclass and attname = 'role_id')]), 'role permissions references a role');
select ok(exists (select 1 from pg_constraint where conrelid = 'public.role_permissions'::regclass and contype = 'f' and confrelid = 'public.permissions'::regclass and conkey = array[(select attnum from pg_attribute where attrelid = 'public.role_permissions'::regclass and attname = 'permission_code')] and confdeltype = 'r'), 'role permissions preserves permission history');
select ok(exists (select 1 from pg_constraint where conrelid = 'public.company_role_assignments'::regclass and contype = 'f' and confrelid = 'public.company_memberships'::regclass and conkey = array[(select attnum from pg_attribute where attrelid = 'public.company_role_assignments'::regclass and attname = 'tenant_id'), (select attnum from pg_attribute where attrelid = 'public.company_role_assignments'::regclass and attname = 'company_id'), (select attnum from pg_attribute where attrelid = 'public.company_role_assignments'::regclass and attname = 'user_id')]), 'role assignments require a company membership in the same scope');
select ok(exists (select 1 from pg_constraint where conrelid = 'public.company_role_assignments'::regclass and contype = 'f' and confrelid = 'public.roles'::regclass and conkey = array[(select attnum from pg_attribute where attrelid = 'public.company_role_assignments'::regclass and attname = 'tenant_id'), (select attnum from pg_attribute where attrelid = 'public.company_role_assignments'::regclass and attname = 'company_id'), (select attnum from pg_attribute where attrelid = 'public.company_role_assignments'::regclass and attname = 'role_id')] and confdeltype = 'r'), 'role assignments preserve role history');
select ok(exists (select 1 from pg_constraint where conrelid = 'public.company_role_assignments'::regclass and contype = 'f' and confrelid = 'auth.users'::regclass and conkey = array[(select attnum from pg_attribute where attrelid = 'public.company_role_assignments'::regclass and attname = 'granted_by')] and confdeltype = 'r'), 'role assignments retain the granting actor');
select ok(exists (select 1 from pg_constraint where conrelid = 'public.company_role_assignments'::regclass and contype = 'f' and confrelid = 'auth.users'::regclass and conkey = array[(select attnum from pg_attribute where attrelid = 'public.company_role_assignments'::regclass and attname = 'revoked_by')] and confdeltype = 'r'), 'role assignments retain the revoking actor');

select ok(exists (select 1 from pg_constraint where conrelid = 'public.departments'::regclass and contype = 'f' and confrelid = 'public.companies'::regclass and conkey = array[(select attnum from pg_attribute where attrelid = 'public.departments'::regclass and attname = 'company_id'), (select attnum from pg_attribute where attrelid = 'public.departments'::regclass and attname = 'tenant_id')] and confkey = array[(select attnum from pg_attribute where attrelid = 'public.companies'::regclass and attname = 'id'), (select attnum from pg_attribute where attrelid = 'public.companies'::regclass and attname = 'tenant_id')]), 'departments composite company foreign key maps tenant and company in order');
select ok(exists (select 1 from pg_constraint where conrelid = 'public.positions'::regclass and contype = 'f' and confrelid = 'public.companies'::regclass and conkey = array[(select attnum from pg_attribute where attrelid = 'public.positions'::regclass and attname = 'company_id'), (select attnum from pg_attribute where attrelid = 'public.positions'::regclass and attname = 'tenant_id')] and confkey = array[(select attnum from pg_attribute where attrelid = 'public.companies'::regclass and attname = 'id'), (select attnum from pg_attribute where attrelid = 'public.companies'::regclass and attname = 'tenant_id')]), 'positions composite company foreign key maps tenant and company in order');
select ok(exists (select 1 from pg_constraint where conrelid = 'public.employees'::regclass and contype = 'f' and confrelid = 'public.companies'::regclass and conkey = array[(select attnum from pg_attribute where attrelid = 'public.employees'::regclass and attname = 'company_id'), (select attnum from pg_attribute where attrelid = 'public.employees'::regclass and attname = 'tenant_id')] and confkey = array[(select attnum from pg_attribute where attrelid = 'public.companies'::regclass and attname = 'id'), (select attnum from pg_attribute where attrelid = 'public.companies'::regclass and attname = 'tenant_id')]), 'employees composite company foreign key maps tenant and company in order');
select ok(exists (select 1 from pg_constraint where conrelid = 'public.employees'::regclass and contype = 'f' and confrelid = 'public.company_memberships'::regclass and conkey = array[(select attnum from pg_attribute where attrelid = 'public.employees'::regclass and attname = 'tenant_id'), (select attnum from pg_attribute where attrelid = 'public.employees'::regclass and attname = 'company_id'), (select attnum from pg_attribute where attrelid = 'public.employees'::regclass and attname = 'user_id')] and confkey = array[(select attnum from pg_attribute where attrelid = 'public.company_memberships'::regclass and attname = 'tenant_id'), (select attnum from pg_attribute where attrelid = 'public.company_memberships'::regclass and attname = 'company_id'), (select attnum from pg_attribute where attrelid = 'public.company_memberships'::regclass and attname = 'user_id')]), 'employees requires a matching company membership in the same tenant and company');
select ok(exists (select 1 from pg_constraint where conrelid = 'public.employees'::regclass and contype = 'f' and confrelid = 'public.departments'::regclass and conkey = array[(select attnum from pg_attribute where attrelid = 'public.employees'::regclass and attname = 'tenant_id'), (select attnum from pg_attribute where attrelid = 'public.employees'::regclass and attname = 'company_id'), (select attnum from pg_attribute where attrelid = 'public.employees'::regclass and attname = 'department_id')] and confkey = array[(select attnum from pg_attribute where attrelid = 'public.departments'::regclass and attname = 'tenant_id'), (select attnum from pg_attribute where attrelid = 'public.departments'::regclass and attname = 'company_id'), (select attnum from pg_attribute where attrelid = 'public.departments'::regclass and attname = 'id')]), 'employees department foreign key preserves tenant and company scope');
select ok(exists (select 1 from pg_constraint where conrelid = 'public.employees'::regclass and contype = 'f' and confrelid = 'public.positions'::regclass and conkey = array[(select attnum from pg_attribute where attrelid = 'public.employees'::regclass and attname = 'tenant_id'), (select attnum from pg_attribute where attrelid = 'public.employees'::regclass and attname = 'company_id'), (select attnum from pg_attribute where attrelid = 'public.employees'::regclass and attname = 'position_id')] and confkey = array[(select attnum from pg_attribute where attrelid = 'public.positions'::regclass and attname = 'tenant_id'), (select attnum from pg_attribute where attrelid = 'public.positions'::regclass and attname = 'company_id'), (select attnum from pg_attribute where attrelid = 'public.positions'::regclass and attname = 'id')]), 'employees position foreign key preserves tenant and company scope');
select ok(exists (select 1 from pg_constraint where conrelid = 'public.employees'::regclass and contype = 'f' and confrelid = 'public.employees'::regclass and conkey = array[(select attnum from pg_attribute where attrelid = 'public.employees'::regclass and attname = 'tenant_id'), (select attnum from pg_attribute where attrelid = 'public.employees'::regclass and attname = 'company_id'), (select attnum from pg_attribute where attrelid = 'public.employees'::regclass and attname = 'manager_employee_id')] and confkey = array[(select attnum from pg_attribute where attrelid = 'public.employees'::regclass and attname = 'tenant_id'), (select attnum from pg_attribute where attrelid = 'public.employees'::regclass and attname = 'company_id'), (select attnum from pg_attribute where attrelid = 'public.employees'::regclass and attname = 'id')]), 'employees manager foreign key preserves tenant and company scope');
select ok(exists (select 1 from pg_constraint where conrelid = 'public.employee_private_details'::regclass and contype = 'f' and confrelid = 'public.employees'::regclass and conkey = array[(select attnum from pg_attribute where attrelid = 'public.employee_private_details'::regclass and attname = 'tenant_id'), (select attnum from pg_attribute where attrelid = 'public.employee_private_details'::regclass and attname = 'company_id'), (select attnum from pg_attribute where attrelid = 'public.employee_private_details'::regclass and attname = 'employee_id')] and confkey = array[(select attnum from pg_attribute where attrelid = 'public.employees'::regclass and attname = 'tenant_id'), (select attnum from pg_attribute where attrelid = 'public.employees'::regclass and attname = 'company_id'), (select attnum from pg_attribute where attrelid = 'public.employees'::regclass and attname = 'id')]), 'private details employee foreign key preserves tenant and company scope');
select ok(exists (select 1 from pg_constraint where conrelid = 'public.roles'::regclass and contype = 'f' and confrelid = 'public.companies'::regclass and conkey = array[(select attnum from pg_attribute where attrelid = 'public.roles'::regclass and attname = 'company_id'), (select attnum from pg_attribute where attrelid = 'public.roles'::regclass and attname = 'tenant_id')] and confkey = array[(select attnum from pg_attribute where attrelid = 'public.companies'::regclass and attname = 'id'), (select attnum from pg_attribute where attrelid = 'public.companies'::regclass and attname = 'tenant_id')]), 'roles composite company foreign key maps tenant and company in order');
select ok(exists (select 1 from pg_constraint where conrelid = 'public.company_role_assignments'::regclass and contype = 'f' and confrelid = 'public.company_memberships'::regclass and conkey = array[(select attnum from pg_attribute where attrelid = 'public.company_role_assignments'::regclass and attname = 'tenant_id'), (select attnum from pg_attribute where attrelid = 'public.company_role_assignments'::regclass and attname = 'company_id'), (select attnum from pg_attribute where attrelid = 'public.company_role_assignments'::regclass and attname = 'user_id')] and confkey = array[(select attnum from pg_attribute where attrelid = 'public.company_memberships'::regclass and attname = 'tenant_id'), (select attnum from pg_attribute where attrelid = 'public.company_memberships'::regclass and attname = 'company_id'), (select attnum from pg_attribute where attrelid = 'public.company_memberships'::regclass and attname = 'user_id')]), 'role assignments membership foreign key preserves tenant and company scope');
select ok(exists (select 1 from pg_constraint where conrelid = 'public.company_role_assignments'::regclass and contype = 'f' and confrelid = 'public.roles'::regclass and conkey = array[(select attnum from pg_attribute where attrelid = 'public.company_role_assignments'::regclass and attname = 'tenant_id'), (select attnum from pg_attribute where attrelid = 'public.company_role_assignments'::regclass and attname = 'company_id'), (select attnum from pg_attribute where attrelid = 'public.company_role_assignments'::regclass and attname = 'role_id')] and confkey = array[(select attnum from pg_attribute where attrelid = 'public.roles'::regclass and attname = 'tenant_id'), (select attnum from pg_attribute where attrelid = 'public.roles'::regclass and attname = 'company_id'), (select attnum from pg_attribute where attrelid = 'public.roles'::regclass and attname = 'id')]), 'role assignments role foreign key preserves tenant and company scope');

select ok(exists (select 1 from pg_constraint where conrelid = 'public.departments'::regclass and contype = 'u' and conkey = array[(select attnum from pg_attribute where attrelid = 'public.departments'::regclass and attname = 'company_id'), (select attnum from pg_attribute where attrelid = 'public.departments'::regclass and attname = 'code')]), 'department codes are unique within a company');
select ok(exists (select 1 from pg_constraint where conrelid = 'public.departments'::regclass and contype = 'u' and conkey = array[(select attnum from pg_attribute where attrelid = 'public.departments'::regclass and attname = 'id'), (select attnum from pg_attribute where attrelid = 'public.departments'::regclass and attname = 'tenant_id'), (select attnum from pg_attribute where attrelid = 'public.departments'::regclass and attname = 'company_id')]), 'departments supports same-scope composite references');
select ok(exists (select 1 from pg_constraint where conrelid = 'public.positions'::regclass and contype = 'u' and conkey = array[(select attnum from pg_attribute where attrelid = 'public.positions'::regclass and attname = 'company_id'), (select attnum from pg_attribute where attrelid = 'public.positions'::regclass and attname = 'code')]), 'position codes are unique within a company');
select ok(exists (select 1 from pg_constraint where conrelid = 'public.positions'::regclass and contype = 'u' and conkey = array[(select attnum from pg_attribute where attrelid = 'public.positions'::regclass and attname = 'id'), (select attnum from pg_attribute where attrelid = 'public.positions'::regclass and attname = 'tenant_id'), (select attnum from pg_attribute where attrelid = 'public.positions'::regclass and attname = 'company_id')]), 'positions supports same-scope composite references');
select ok(exists (select 1 from pg_constraint where conrelid = 'public.employees'::regclass and contype = 'u' and conkey = array[(select attnum from pg_attribute where attrelid = 'public.employees'::regclass and attname = 'company_id'), (select attnum from pg_attribute where attrelid = 'public.employees'::regclass and attname = 'user_id')]), 'an account has one employee record per company');
select ok(exists (select 1 from pg_constraint where conrelid = 'public.employees'::regclass and contype = 'u' and conkey = array[(select attnum from pg_attribute where attrelid = 'public.employees'::regclass and attname = 'company_id'), (select attnum from pg_attribute where attrelid = 'public.employees'::regclass and attname = 'employee_code')]), 'employee codes are unique within a company');
select ok(exists (select 1 from pg_constraint where conrelid = 'public.employees'::regclass and contype = 'u' and conkey = array[(select attnum from pg_attribute where attrelid = 'public.employees'::regclass and attname = 'id'), (select attnum from pg_attribute where attrelid = 'public.employees'::regclass and attname = 'tenant_id'), (select attnum from pg_attribute where attrelid = 'public.employees'::regclass and attname = 'company_id')]), 'employees supports same-scope composite references');
select ok(exists (select 1 from pg_constraint where conrelid = 'public.roles'::regclass and contype = 'u' and conkey = array[(select attnum from pg_attribute where attrelid = 'public.roles'::regclass and attname = 'company_id'), (select attnum from pg_attribute where attrelid = 'public.roles'::regclass and attname = 'code')]), 'role codes are unique within a company');
select ok(exists (select 1 from pg_constraint where conrelid = 'public.roles'::regclass and contype = 'u' and conkey = array[(select attnum from pg_attribute where attrelid = 'public.roles'::regclass and attname = 'id'), (select attnum from pg_attribute where attrelid = 'public.roles'::regclass and attname = 'tenant_id'), (select attnum from pg_attribute where attrelid = 'public.roles'::regclass and attname = 'company_id')]), 'roles supports same-scope composite references');
select ok(exists (select 1 from pg_index i where i.indrelid = 'public.employees'::regclass and i.indisunique and pg_get_indexdef(i.indexrelid) ilike '%(company_id, lower(work_email))%'), 'employee work email is unique case-insensitively within a company');
select ok(exists (select 1 from pg_index i where i.indrelid = 'public.employee_private_details'::regclass and i.indisunique and pg_get_indexdef(i.indexrelid) ilike '%(company_id, tax_code)%' and pg_get_expr(i.indpred, i.indrelid) ilike '%tax_code IS NOT NULL%'), 'tax codes are unique per company when present');
select ok(exists (select 1 from pg_index i where i.indrelid = 'public.employee_private_details'::regclass and i.indisunique and pg_get_indexdef(i.indexrelid) ilike '%(company_id, social_insurance_number)%' and pg_get_expr(i.indpred, i.indrelid) ilike '%social_insurance_number IS NOT NULL%'), 'social insurance numbers are unique per company when present');
select ok(exists (select 1 from pg_index i where i.indrelid = 'public.company_role_assignments'::regclass and i.indisunique and pg_get_indexdef(i.indexrelid) ilike '%(tenant_id, company_id, user_id, role_id)%' and pg_get_expr(i.indpred, i.indrelid) ilike '%revoked_at IS NULL%'), 'only one active tenant-company-user-role assignment is permitted');

select ok(exists (select 1 from pg_constraint where conrelid = 'public.positions'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%level > 0%'), 'position level is positive when present');
select ok(exists (select 1 from pg_constraint where conrelid = 'public.employees'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%probation_end_date >= hire_date%'), 'probation cannot end before hire date');
select ok(exists (select 1 from pg_constraint where conrelid = 'public.employees'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%manager_employee_id <> id%'), 'an employee cannot manage themself');
select ok(exists (select 1 from pg_constraint where conrelid = 'public.employees'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%probation%' and pg_get_constraintdef(oid) ilike '%active%' and pg_get_constraintdef(oid) ilike '%on_leave%' and pg_get_constraintdef(oid) ilike '%terminated%'), 'employment status is limited to approved values');
select ok(exists (select 1 from pg_constraint where conrelid = 'public.employee_private_details'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%female%' and pg_get_constraintdef(oid) ilike '%male%' and pg_get_constraintdef(oid) ilike '%other%' and pg_get_constraintdef(oid) ilike '%undisclosed%'), 'gender is limited to approved values');
select ok(exists (select 1 from pg_constraint where conrelid = 'public.company_role_assignments'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%revoked_by%' and pg_get_constraintdef(oid) ilike '%revoked_at%' and pg_get_constraintdef(oid) ilike '%granted_at%'), 'role assignment revocation fields remain consistent and ordered');
select is((select attidentity from pg_attribute where attrelid = 'public.company_role_assignments'::regclass and attname = 'id'), 'a', 'role assignment IDs are generated always');

select is((select pg_get_expr(adbin, adrelid) from pg_attrdef where adrelid = 'public.departments'::regclass and adnum = (select attnum from pg_attribute where attrelid = 'public.departments'::regclass and attname = 'is_active')), 'true', 'departments default to active');
select is((select pg_get_expr(adbin, adrelid) from pg_attrdef where adrelid = 'public.positions'::regclass and adnum = (select attnum from pg_attribute where attrelid = 'public.positions'::regclass and attname = 'is_active')), 'true', 'positions default to active');
select is((select pg_get_expr(adbin, adrelid) from pg_attrdef where adrelid = 'public.roles'::regclass and adnum = (select attnum from pg_attribute where attrelid = 'public.roles'::regclass and attname = 'is_privileged')), 'false', 'roles are non-privileged by default');
select is((select pg_get_expr(adbin, adrelid) from pg_attrdef where adrelid = 'public.roles'::regclass and adnum = (select attnum from pg_attribute where attrelid = 'public.roles'::regclass and attname = 'is_system')), 'true', 'roles default to system roles');
select is((select pg_get_expr(adbin, adrelid) from pg_attrdef where adrelid = 'public.roles'::regclass and adnum = (select attnum from pg_attribute where attrelid = 'public.roles'::regclass and attname = 'is_active')), 'true', 'roles default to active');
select ok(not exists (
  select 1
  from (values
    ('public.departments'::regclass, 'created_at'), ('public.departments'::regclass, 'updated_at'),
    ('public.positions'::regclass, 'created_at'), ('public.positions'::regclass, 'updated_at'),
    ('public.employees'::regclass, 'created_at'), ('public.employees'::regclass, 'updated_at'),
    ('public.employee_private_details'::regclass, 'created_at'), ('public.employee_private_details'::regclass, 'updated_at'),
    ('public.roles'::regclass, 'created_at'), ('public.roles'::regclass, 'updated_at'),
    ('public.permissions'::regclass, 'created_at'), ('public.role_permissions'::regclass, 'created_at'),
    ('public.company_role_assignments'::regclass, 'granted_at')
  ) as expected(relid, attname)
  left join pg_attribute a on a.attrelid = expected.relid and a.attname = expected.attname
  left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
  where d.oid is null or pg_get_expr(d.adbin, d.adrelid) <> 'now()'
), 'all approved timestamps default to now()');

select is(
  (
    select array_agg(department.code order by department.code)
    from public.departments department
    where department.tenant_id = '10000000-0000-4000-8000-000000000010'
      and department.company_id = '10000000-0000-4000-8000-000000000020'
      and department.is_active
  ),
  array['ACCOUNTING', 'BLD', 'CONSTRUCTION', 'DESIGN', 'HR', 'PROCUREMENT', 'TECH']::text[],
  'VQH has exactly the seven approved active departments'
);
select ok(
  (
    select tech.id <> design.id
    from public.departments tech
    join public.departments design
      on design.tenant_id = tech.tenant_id
     and design.company_id = tech.company_id
     and design.code = 'DESIGN'
    where tech.tenant_id = '10000000-0000-4000-8000-000000000010'
      and tech.company_id = '10000000-0000-4000-8000-000000000020'
      and tech.code = 'TECH'
  ),
  'VQH TECH and DESIGN resolve to distinct departments'
);
select is(
  (
    select array_agg(company_role.code order by company_role.code)
    from public.roles company_role
    where company_role.tenant_id = '10000000-0000-4000-8000-000000000010'
      and company_role.company_id = '10000000-0000-4000-8000-000000000020'
      and company_role.is_active
  ),
  array['accountant', 'company_admin', 'designer', 'employee', 'hr_manager', 'inventory_auditor', 'supplier_sourcing', 'technical_staff']::text[],
  'VQH has exactly the eight approved active roles'
);
select is(
  (
    select array_agg(permission.code order by permission.code)
    from public.permissions permission
  ),
  array[
    'account.disable', 'account.invite', 'accounting_document.read', 'accounting_document.update',
    'drawing.create', 'drawing.read', 'drawing.update', 'employee.create', 'employee.offboard',
    'employee.read_all', 'employee.read_directory', 'employee.read_private', 'employee.read_self_private',
    'employee.update', 'inventory.read', 'inventory_value.read', 'project.read', 'quotation_request.create',
    'quotation_request.update', 'role.assign', 'role.read', 'role.revoke', 'stock_adjustment.approve',
    'stock_adjustment.read', 'stock_count.create', 'stock_count.update', 'supplier.create', 'supplier.read',
    'supplier.update', 'supplier_payment.approve', 'task.read_assigned', 'task.update_assigned',
    'technical_document.read', 'technical_document.update'
  ]::text[],
  'the seed has the complete explicit permission catalog without wildcards'
);
select is(
  (
    select array_agg(role_permission.permission_code order by role_permission.permission_code)
    from public.role_permissions role_permission
    join public.roles company_role on company_role.id = role_permission.role_id
    where company_role.tenant_id = '10000000-0000-4000-8000-000000000010'
      and company_role.company_id = '10000000-0000-4000-8000-000000000020'
      and company_role.code = 'employee'
  ),
  array['employee.read_directory', 'employee.read_self_private', 'project.read', 'task.read_assigned', 'task.update_assigned']::text[],
  'employee has only directory, self-private, project, and assigned-task permissions'
);
select is(
  (
    select array_agg(role_permission.permission_code order by role_permission.permission_code)
    from public.role_permissions role_permission
    join public.roles company_role on company_role.id = role_permission.role_id
    where company_role.tenant_id = '10000000-0000-4000-8000-000000000010'
      and company_role.company_id = '10000000-0000-4000-8000-000000000020'
      and company_role.code = 'hr_manager'
  ),
  array['account.invite', 'employee.create', 'employee.read_all', 'employee.read_directory', 'employee.read_private', 'employee.update', 'role.read']::text[],
  'HR has employee/profile/invite access without role, account, or approval authority'
);
select is(
  (
    select array_agg(role_permission.permission_code order by role_permission.permission_code)
    from public.role_permissions role_permission
    join public.roles company_role on company_role.id = role_permission.role_id
    where company_role.tenant_id = '10000000-0000-4000-8000-000000000010'
      and company_role.company_id = '10000000-0000-4000-8000-000000000020'
      and company_role.code = 'supplier_sourcing'
  ),
  array['inventory.read', 'quotation_request.create', 'quotation_request.update', 'supplier.create', 'supplier.read', 'supplier.update']::text[],
  'supplier sourcing has supplier, quotation, and inventory-read permissions only'
);
select is(
  (
    select array_agg(role_permission.permission_code order by role_permission.permission_code)
    from public.role_permissions role_permission
    join public.roles company_role on company_role.id = role_permission.role_id
    where company_role.tenant_id = '10000000-0000-4000-8000-000000000010'
      and company_role.company_id = '10000000-0000-4000-8000-000000000020'
      and company_role.code = 'inventory_auditor'
  ),
  array['inventory.read', 'stock_adjustment.read', 'stock_count.create', 'stock_count.update']::text[],
  'inventory auditor cannot approve stock adjustments'
);
select is(
  (
    select array_agg(role_permission.permission_code order by role_permission.permission_code)
    from public.role_permissions role_permission
    join public.roles company_role on company_role.id = role_permission.role_id
    where company_role.tenant_id = '10000000-0000-4000-8000-000000000010'
      and company_role.company_id = '10000000-0000-4000-8000-000000000020'
      and company_role.code = 'technical_staff'
  ),
  array['project.read', 'task.read_assigned', 'task.update_assigned', 'technical_document.read', 'technical_document.update']::text[],
  'technical staff has assigned-work and technical-document permissions'
);
select is(
  (
    select array_agg(role_permission.permission_code order by role_permission.permission_code)
    from public.role_permissions role_permission
    join public.roles company_role on company_role.id = role_permission.role_id
    where company_role.tenant_id = '10000000-0000-4000-8000-000000000010'
      and company_role.company_id = '10000000-0000-4000-8000-000000000020'
      and company_role.code = 'designer'
  ),
  array['drawing.create', 'drawing.read', 'drawing.update', 'project.read', 'task.read_assigned', 'task.update_assigned']::text[],
  'designers have assigned-work and drawing permissions'
);
select is(
  (
    select array_agg(role_permission.permission_code order by role_permission.permission_code)
    from public.role_permissions role_permission
    join public.roles company_role on company_role.id = role_permission.role_id
    where company_role.tenant_id = '10000000-0000-4000-8000-000000000010'
      and company_role.company_id = '10000000-0000-4000-8000-000000000020'
      and company_role.code = 'accountant'
  ),
  array['accounting_document.read', 'accounting_document.update', 'inventory_value.read', 'supplier.read']::text[],
  'accountants do not receive payment approval without a separate approval'
);
select is(
  (
    select array_agg(role_permission.permission_code order by role_permission.permission_code)
    from public.role_permissions role_permission
    join public.roles company_role on company_role.id = role_permission.role_id
    where company_role.tenant_id = '10000000-0000-4000-8000-000000000010'
      and company_role.company_id = '10000000-0000-4000-8000-000000000020'
      and company_role.code = 'company_admin'
  ),
  (
    select array_agg(permission.code order by permission.code)
    from public.permissions permission
  ),
  'company admin has every explicit permission code'
);
select is(
  (
    select array_agg(employee.employee_code order by employee.employee_code)
    from public.employees employee
    where employee.tenant_id = '10000000-0000-4000-8000-000000000010'
      and employee.company_id = '10000000-0000-4000-8000-000000000020'
  ),
  array['VQH-HAU', 'VQH-HIEU', 'VQH-LONG', 'VQH-NHI', 'VQH-NHU', 'VQH-Y']::text[],
  'VQH has exactly the six approved employee records'
);
select is(
  (
    select array_agg(company_role.code order by company_role.code)
    from public.company_role_assignments assignment
    join public.roles company_role on company_role.id = assignment.role_id
    join public.employees employee on employee.user_id = assignment.user_id
      and employee.tenant_id = assignment.tenant_id
      and employee.company_id = assignment.company_id
    where employee.employee_code = 'VQH-NHU'
      and assignment.revoked_at is null
  ),
  array['employee', 'hr_manager', 'inventory_auditor', 'supplier_sourcing']::text[],
  'Như has the approved active role matrix'
);
select is(
  (
    select array_agg(company_role.code order by company_role.code)
    from public.company_role_assignments assignment
    join public.roles company_role on company_role.id = assignment.role_id
    join public.employees employee on employee.user_id = assignment.user_id
      and employee.tenant_id = assignment.tenant_id
      and employee.company_id = assignment.company_id
    where employee.employee_code in ('VQH-LONG', 'VQH-HIEU')
      and assignment.revoked_at is null
    group by employee.employee_code
    order by employee.employee_code
  ),
  array[
    array['employee', 'technical_staff']::text[],
    array['employee', 'technical_staff']::text[]
  ]::text[][],
  'Long and Hiếu each have the technical role matrix'
);
select is(
  (
    select array_agg(company_role.code order by company_role.code)
    from public.company_role_assignments assignment
    join public.roles company_role on company_role.id = assignment.role_id
    join public.employees employee on employee.user_id = assignment.user_id
      and employee.tenant_id = assignment.tenant_id
      and employee.company_id = assignment.company_id
    where employee.employee_code = 'VQH-Y'
      and assignment.revoked_at is null
  ),
  array['accountant', 'employee']::text[],
  'Y has the approved accountant role matrix'
);
select is(
  (
    select array_agg(company_role.code order by company_role.code)
    from public.company_role_assignments assignment
    join public.roles company_role on company_role.id = assignment.role_id
    join public.employees employee on employee.user_id = assignment.user_id
      and employee.tenant_id = assignment.tenant_id
      and employee.company_id = assignment.company_id
    where employee.employee_code in ('VQH-NHI', 'VQH-HAU')
      and assignment.revoked_at is null
    group by employee.employee_code
    order by employee.employee_code
  ),
  array[
    array['designer', 'employee']::text[],
    array['designer', 'employee']::text[]
  ]::text[][],
  'Nhi and Hậu each have the designer role matrix'
);
select is(
  (
    select array_agg(company_role.code order by company_role.code)
    from public.company_role_assignments assignment
    join public.roles company_role on company_role.id = assignment.role_id
    where assignment.tenant_id = '10000000-0000-4000-8000-000000000010'
      and assignment.company_id = '10000000-0000-4000-8000-000000000020'
      and assignment.user_id = '10000000-0000-4000-8000-000000000001'
      and assignment.revoked_at is null
  ),
  array['company_admin']::text[],
  'the existing VQH owner has the normalized company admin role'
);
select ok(
  not exists (
    select 1
    from public.company_memberships membership
    where not membership.is_active
       or membership.roles is distinct from array['employee']::text[]
  ),
  'every seeded company membership is active with only the employee compatibility role'
);
select ok(
  not exists (
    select 1
    from public.company_role_assignments assignment
    where assignment.tenant_id = '10000000-0000-4000-8000-000000000010'
      and assignment.company_id = '10000000-0000-4000-8000-000000000020'
      and assignment.revoked_at is null
    group by assignment.user_id, assignment.role_id
    having count(*) > 1
  ),
  'VQH seed has no duplicate active role assignments'
);
select is(
  (
    select count(*)
    from public.employees employee
    join public.employee_private_details private_details on private_details.employee_id = employee.id
    where employee.tenant_id = '10000000-0000-4000-8000-000000000010'
      and employee.company_id = '10000000-0000-4000-8000-000000000020'
      and employee.position_id is null
      and employee.hire_date is null
      and employee.probation_end_date is null
      and private_details.date_of_birth is null
      and private_details.gender is null
      and private_details.personal_email is null
      and private_details.personal_phone is null
      and private_details.current_address is null
      and private_details.permanent_address is null
      and private_details.tax_code is null
      and private_details.social_insurance_number is null
      and private_details.emergency_contact_name is null
      and private_details.emergency_contact_phone is null
  ),
  6::bigint,
  'VQH seed employees retain incomplete organizational and private profiles'
);

select * from finish();
rollback;
