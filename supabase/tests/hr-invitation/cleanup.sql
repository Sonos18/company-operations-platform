-- HR INVITATION FIXED OWNED FIXTURE
do $blocked$ begin raise exception 'HR_COMMITTED_FIXTURES_DISABLED_CONCURRENCY_DEFERRED'; end $blocked$;
-- See closure.sql for the approved rollback-only deactivation proof.
-- Permanent setup, cleanup and retention remain unapproved.
