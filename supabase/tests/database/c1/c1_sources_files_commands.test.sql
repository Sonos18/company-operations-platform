begin;
do $$
begin
  -- P2 Cloud fixture: I03/I15/I19/I21/I24/A03/A14/A21/A29/A40/A46/A47/A56/A58/A60/A61.
  -- All future rows use reserved c100/c101 scopes and are rolled back with this transaction.
  if current_setting('request.jwt.claims', true) is not null and current_setting('request.jwt.claims', true) like '%@taskovia.invalid%' then
    raise exception 'C1 fixture JWT must contain an actor UUID, never an email';
  end if;
end $$;
rollback;
