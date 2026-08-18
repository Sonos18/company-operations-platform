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

select * from finish();
rollback;
