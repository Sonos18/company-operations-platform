create or replace function private.c1_jsonb_canonical_text(target_value jsonb)
returns text
language plpgsql
immutable
strict
security definer
set search_path = ''
as $$
declare v_value_type text := jsonb_typeof(target_value); v_result text;
begin
  if v_value_type = 'object' then
    select coalesce('{' || string_agg(to_jsonb(entry.key)::text || ':' || private.c1_jsonb_canonical_text(entry.value), ',' order by entry.key collate "C") || '}', '{}')
    into v_result from jsonb_each(target_value) entry;
    return v_result;
  end if;
  if v_value_type = 'array' then
    select coalesce('[' || string_agg(private.c1_jsonb_canonical_text(entry.value), ',' order by entry.ordinality) || ']', '[]')
    into v_result from jsonb_array_elements(target_value) with ordinality entry(value, ordinality);
    return v_result;
  end if;
  return target_value::text;
end;
$$;
