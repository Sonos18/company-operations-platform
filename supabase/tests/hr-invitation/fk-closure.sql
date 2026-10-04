-- HR INVITATION FIXED OWNED FIXTURE
-- Check exact composite FK joins, including all incoming CASCADE/SET NULL edges.
do $fk_closure$
declare scopes jsonb := '{"auth.users":"p.id in (''8a041004-0000-4000-8000-000000000001'',''8a041004-0000-4000-8000-000000000002'',''8b041004-0000-4000-8000-000000000001'')","public.tenants":"p.id in (''8a041004-0000-4000-8000-000000000010'',''8b041004-0000-4000-8000-000000000010'')","public.companies":"p.id in (''8a041004-0000-4000-8000-000000000020'',''8b041004-0000-4000-8000-000000000020'')","public.tenant_memberships":"p.tenant_id in (''8a041004-0000-4000-8000-000000000010'',''8b041004-0000-4000-8000-000000000010'')","public.role_permissions":"p.role_id in (''8a041004-0000-4000-8000-000000000301'',''8a041004-0000-4000-8000-000000000302'',''8b041004-0000-4000-8000-000000000302'')","public.company_memberships":"p.company_id in (''8a041004-0000-4000-8000-000000000020'',''8b041004-0000-4000-8000-000000000020'')","public.company_role_assignments":"p.company_id in (''8a041004-0000-4000-8000-000000000020'',''8b041004-0000-4000-8000-000000000020'')","public.roles":"p.company_id in (''8a041004-0000-4000-8000-000000000020'',''8b041004-0000-4000-8000-000000000020'')","public.departments":"p.company_id in (''8a041004-0000-4000-8000-000000000020'',''8b041004-0000-4000-8000-000000000020'')","public.positions":"p.company_id in (''8a041004-0000-4000-8000-000000000020'',''8b041004-0000-4000-8000-000000000020'')","public.employees":"p.company_id in (''8a041004-0000-4000-8000-000000000020'',''8b041004-0000-4000-8000-000000000020'')","public.employee_private_details":"p.company_id in (''8a041004-0000-4000-8000-000000000020'',''8b041004-0000-4000-8000-000000000020'')","public.audit_events":"p.company_id in (''8a041004-0000-4000-8000-000000000020'',''8b041004-0000-4000-8000-000000000020'')"}'::jsonb;
 fk record; matches boolean; outside_scope boolean; source_scope text;
begin
 for fk in
  select c.conname, c.conrelid::regclass as source_table, c.confrelid::regclass as parent_table,
   pn.nspname || '.' || pr.relname as parent_name, sn.nspname || '.' || sr.relname as source_name,
   string_agg(format('s.%I = p.%I',sa.attname,pa.attname),' and ' order by keys.ord) as join_sql
  from pg_constraint c
  join pg_class pr on pr.oid=c.confrelid join pg_namespace pn on pn.oid=pr.relnamespace
  join pg_class sr on sr.oid=c.conrelid join pg_namespace sn on sn.oid=sr.relnamespace
  cross join lateral unnest(c.conkey,c.confkey) with ordinality keys(source_num,target_num,ord)
  join pg_attribute sa on sa.attrelid=c.conrelid and sa.attnum=keys.source_num
  join pg_attribute pa on pa.attrelid=c.confrelid and pa.attnum=keys.target_num
  where c.contype='f' and scopes ? (pn.nspname || '.' || pr.relname)
  group by c.oid,c.conname,c.conrelid,c.confrelid,pn.nspname,pr.relname,sn.nspname,sr.relname
 loop
  execute format('select exists(select 1 from %s s join %s p on %s where %s)',
   fk.source_table,fk.parent_table,fk.join_sql,scopes->>fk.parent_name) into matches;
  if matches then
   source_scope := scopes->>fk.source_name;
   if source_scope is null then raise exception 'HR_EXTERNAL_FK_REFERENCE: %',fk.conname; end if;
   execute format('select exists(select 1 from %s s join %s p on %s where (%s) and not (%s))',
    fk.source_table,fk.parent_table,fk.join_sql,scopes->>fk.parent_name,replace(source_scope,'p.','s.')) into outside_scope;
   if outside_scope then raise exception 'HR_CROSS_SCOPE_FK_REFERENCE: %',fk.conname; end if;
  end if;
 end loop;
end $fk_closure$;
