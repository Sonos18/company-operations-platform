-- HR INVITATION FIXED OWNED FIXTURE
do $checks$
declare
  original_id uuid;
  returned_id uuid;
  scenario integer;
  rejected boolean;
  expected_error text;
  target_name text;
  department uuid;
  position uuid;
  hired date;
  role_count bigint;
  company constant uuid := '8a041004-0000-4000-8000-000000000020';
  target constant uuid := '8a041004-0000-4000-8000-000000000002';
begin
 select id into original_id from public.employees where company_id=company and user_id=target;
 select count(*) into role_count from public.company_role_assignments where company_id=company;
 returned_id := public.complete_employee_onboarding(company,target,'HR-FIXTURE','HR Fixture','target@hr-reissue.invalid',
  '8a041004-0000-4000-8000-000000000201','8a041004-0000-4000-8000-000000000211','2026-10-01');
 if returned_id is distinct from original_id then raise exception 'HR_REPLAY_CHANGED_ID'; end if;
 for scenario in 1..9 loop
  target_name := case when scenario=1 then 'Changed Fixture' else 'HR Fixture' end;
  department := case when scenario=2 then '8a041004-0000-4000-8000-000000000202' else '8a041004-0000-4000-8000-000000000201' end;
  position := case when scenario=3 then '8a041004-0000-4000-8000-000000000212' else '8a041004-0000-4000-8000-000000000211' end;
  hired := case when scenario=4 then '2026-10-02'::date else '2026-10-01'::date end;
  expected_error := case when scenario in (5,6,8,9) then 'PERMISSION_DENIED' else 'EMPLOYEE_EMAIL_CONFLICT' end;
  if scenario=5 then perform set_config('request.jwt.claims','{"sub":"8b041004-0000-4000-8000-000000000001","role":"authenticated"}',true); end if;
  if scenario=6 then perform set_config('request.jwt.claims','{}',true); end if;
  if scenario=7 then update public.employees set employment_status='terminated' where id=original_id; end if;
  if scenario in (8,9) then
   delete from public.role_permissions where role_id='8a041004-0000-4000-8000-000000000302'
    and permission_code=case when scenario=8 then 'account.invite' else 'employee.create' end;
  end if;
  rejected := false;
  begin
   perform public.complete_employee_onboarding(company,target,'HR-FIXTURE',target_name,'target@hr-reissue.invalid',department,position,hired);
  exception when sqlstate 'P0001' then
   if sqlerrm <> expected_error then raise; end if;
   rejected := true;
  end;
  if not rejected then raise exception 'HR_EXPECTED_REJECTION'; end if;
  if (select count(*) from public.company_role_assignments where company_id=company) <> role_count
    or not (select is_active from public.company_memberships where company_id=company and user_id=target)
  then raise exception 'HR_REJECTION_CHANGED_ACCESS'; end if;
  if scenario in (8,9) then
   insert into public.role_permissions(role_id,permission_code)
    values('8a041004-0000-4000-8000-000000000302',case when scenario=8 then 'account.invite' else 'employee.create' end);
  end if;
  perform set_config('request.jwt.claims','{"sub":"8a041004-0000-4000-8000-000000000001","role":"authenticated"}',true);
 end loop;
 update public.employees set employment_status='active',position_id=null,hire_date=null where id=original_id;
 returned_id := public.complete_employee_onboarding(company,target,'HR-FIXTURE','HR Fixture','target@hr-reissue.invalid',
  '8a041004-0000-4000-8000-000000000201',null,null);
 if returned_id is distinct from original_id then raise exception 'HR_NULL_REPLAY_CHANGED_ID'; end if;
 rejected := false;
 begin
  perform public.complete_employee_onboarding(company,target,'HR-FIXTURE','HR Fixture','target@hr-reissue.invalid',
   '8a041004-0000-4000-8000-000000000201','8a041004-0000-4000-8000-000000000211','2026-10-01');
 exception when sqlstate 'P0001' then
  if sqlerrm <> 'EMPLOYEE_EMAIL_CONFLICT' then raise; end if;
  rejected := true;
 end;
 if not rejected then raise exception 'HR_EXPECTED_NULL_MISMATCH'; end if;
end $checks$;
