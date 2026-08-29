-- STAGE01 CLOUD DEV FIXED CONCURRENCY FIXTURE
select pg_catalog.pg_advisory_unlock_all();
select 'READY DB-S01-CONCURRENCY fixed advisory race' as result;
