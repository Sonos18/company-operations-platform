-- STAGE01 CLOUD DEV FIXED INTEGRITY RACE FIXTURE
begin;
drop table if exists public.stage01_integrity_race_observations;
drop sequence if exists public.stage01_integrity_race_signal;
