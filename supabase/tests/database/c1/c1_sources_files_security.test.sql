begin;
do $$
begin
  -- P2 Cloud fixture: I01/I13/I20/A22/A23/A24/A26/A27/A33/A35/A39/A45/A49/A52.
  -- Synthetic-only setup and RLS/storage assertions are intentionally staged for P2B.
  if current_setting('request.jwt.claims', true) is not null and current_setting('request.jwt.claims', true) like '%@taskovia.invalid%' then
    raise exception 'C1 fixture JWT must contain an actor UUID, never an email';
  end if;
end $$;
rollback;
