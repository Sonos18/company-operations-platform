-- STAGE01 CLOUD DEV FIXED CONCURRENCY FIXTURE
select pg_catalog.pg_advisory_unlock_all();
select 'PASS DB-S01-CONCURRENCY cleanup' as result;
