-- STAGE01 CLOUD DEV FIXED CONCURRENCY FIXTURE
begin;
set local lock_timeout = '250ms';
select pg_catalog.pg_advisory_xact_lock(81997730120600::bigint);
select pg_catalog.pg_sleep(3);
commit;
select 'PASS DB-S01-CONCURRENCY actor A won' as result;
