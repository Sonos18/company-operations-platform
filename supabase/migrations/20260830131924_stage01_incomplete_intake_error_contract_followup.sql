create or replace function private.stage01_taxonomy_entry(
  target_definition jsonb,
  target_taxonomy_key text,
  target_code text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  matched_entry jsonb;
  matched_count bigint;
begin
  if nullif(pg_catalog.btrim(target_taxonomy_key), '') is null
     or pg_catalog.jsonb_typeof(
       target_definition #> array['taxonomies', target_taxonomy_key]
     ) is distinct from 'array' then
    raise exception using errcode = 'P0001', message = 'INVALID_COMMAND_INPUT';
  end if;

  if nullif(pg_catalog.btrim(target_code), '') is null then
    return null;
  end if;

  select (pg_catalog.jsonb_agg(entry.value) -> 0), pg_catalog.count(*)
  into matched_entry, matched_count
  from pg_catalog.jsonb_array_elements(
    target_definition #> array['taxonomies', target_taxonomy_key]
  ) as entry(value)
  where entry.value ->> 'code' = pg_catalog.btrim(target_code);

  if matched_count <> 1 then
    raise exception using errcode = 'P0001', message = 'INVALID_COMMAND_INPUT';
  end if;

  return matched_entry;
end;
$$;

revoke all on function private.stage01_taxonomy_entry(jsonb, text, text)
  from public, anon, authenticated;
