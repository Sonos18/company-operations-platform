set local lock_timeout = '5s';
set local statement_timeout = '30s';

create function private.c1_material_read_order_currency(target_company_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_context jsonb;
  v_currency_code text;
begin
  v_context := private.c1_material_context(target_company_id, 'material.read');
  perform private.c1_material_context(target_company_id, 'material.order.manage');

  select settings.default_currency_code into v_currency_code
  from public.company_cost_settings as settings
  where settings.tenant_id = (v_context->>'tenantId')::uuid
    and settings.company_id = target_company_id
    and settings.enabled;
  if not found then
    raise exception using errcode = 'P0001', message = 'WORKFLOW_CONFIGURATION_REQUIRED';
  end if;
  return jsonb_build_object('currencyCode', v_currency_code);
end;
$$;

create function public.c1_material_read_order_currency(target_company_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select private.c1_material_read_order_currency(target_company_id);
$$;

revoke all on function private.c1_material_read_order_currency(uuid)
from public, anon, authenticated, service_role;
revoke all on function public.c1_material_read_order_currency(uuid)
from public, anon, authenticated, service_role;
grant execute on function public.c1_material_read_order_currency(uuid) to authenticated;

notify pgrst, 'reload schema';
