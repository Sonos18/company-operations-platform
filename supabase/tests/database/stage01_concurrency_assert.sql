-- STAGE01 CLOUD DEV FIXED CONCURRENCY FIXTURE
do $$
begin
  if not pg_catalog.pg_try_advisory_lock(81997730120600::bigint) then
    raise exception 'DB-S01-CONCURRENCY advisory fixture lock leaked';
  end if;
  perform pg_catalog.pg_advisory_unlock(81997730120600::bigint);
end $$;
select 'PASS DB-S01-CONCURRENCY exactly one actor and no residue' as result;
