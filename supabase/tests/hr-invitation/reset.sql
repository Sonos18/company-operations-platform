-- HR INVITATION FIXED OWNED FIXTURE
select set_config('request.headers','{"x-request-id":"__RUN_ID__"}',true);
select set_config('request.jwt.claims','{"sub":"8a041004-0000-4000-8000-000000000001","role":"authenticated"}',true);
update public.employees set full_name='HR Fixture',department_id='8a041004-0000-4000-8000-000000000201',
 position_id='8a041004-0000-4000-8000-000000000211',hire_date='2026-10-01',employment_status='active',termination_date=null,termination_reason=null
where company_id='8a041004-0000-4000-8000-000000000020' and user_id='8a041004-0000-4000-8000-000000000002';
select public.complete_employee_onboarding('8a041004-0000-4000-8000-000000000020','8a041004-0000-4000-8000-000000000002','HR-FIXTURE','HR Fixture','target@hr-reissue.invalid','8a041004-0000-4000-8000-000000000201','8a041004-0000-4000-8000-000000000211','2026-10-01');
