set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- The SELECT RLS policy invokes this private classifier as authenticated.
-- PostgreSQL requires EXECUTE even when another permissive policy allows the row.
grant execute on function private.c1_material_evidence_file(uuid) to authenticated;
