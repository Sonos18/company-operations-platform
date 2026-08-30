-- STAGE01 CLOUD DEV FIXED INTEGRITY RACE FIXTURE
begin;
do $$
declare
  signal_seen boolean := false;
begin
  for attempt in 1..100 loop
    select sequence.last_value is not null
    into signal_seen
    from pg_catalog.pg_sequences as sequence
    where sequence.schemaname = 'public'
      and sequence.sequencename = 'stage01_integrity_race_signal';
    exit when signal_seen;
    perform pg_catalog.pg_sleep(0.1);
  end loop;
  if not signal_seen then
    raise exception 'completion-first actor A readiness signal timed out';
  end if;
end;
$$;
set local role authenticated;
select pg_catalog.set_config(
  'request.jwt.claims',
  '{"sub":"7c000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
select public.update_contact_method(
  '7c000000-0000-4000-8000-000000000020',
  '7c000000-0000-4000-8000-000000000060',
  '7c000000-0000-4000-8000-000000000093',
  '{"isUsable":false,"expectedContactVersion":0}'::jsonb,
  '7c000000-0000-4000-8000-00000000b101'
);
reset role;
insert into public.stage01_integrity_race_observations (actor, observed_at)
values ('actor_b', pg_catalog.clock_timestamp());
commit;
