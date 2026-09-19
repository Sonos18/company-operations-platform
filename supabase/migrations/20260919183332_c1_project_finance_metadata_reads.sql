SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE FUNCTION private.c1_read_project_finance_directory(
  target_company_id uuid,
  target_after_id uuid,
  target_limit integer
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_actor uuid;
  v_tenant uuid;
  v_context jsonb;
  v_settings record;
  v_projects jsonb;
  v_next text := NULL;
BEGIN
  v_actor := auth.uid();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'PERMISSION_DENIED';
  END IF;
  IF target_limit IS NULL OR target_limit < 1 OR target_limit > 100 THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'INPUT_INVALID';
  END IF;
  v_context := private.c1_master_context(target_company_id, 'cost.read');
  v_tenant := (v_context->>'tenantId')::uuid;
  IF v_tenant IS NULL OR (v_context->>'actorId')::uuid IS DISTINCT FROM v_actor THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'PERMISSION_DENIED';
  END IF;
  SELECT s.default_currency_code, s.money_scale, s.time_zone INTO v_settings
  FROM public.company_cost_settings s
  WHERE s.tenant_id = v_tenant AND s.company_id = target_company_id AND s.enabled;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'MODULE_DISABLED';
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'projectId', x.id, 'projectCode', x.code, 'projectName', x.name
  ) ORDER BY x.id), '[]'::jsonb) INTO v_projects
  FROM (
    SELECT p.id, p.code, p.name
    FROM public.projects p
    WHERE p.tenant_id = v_tenant AND p.company_id = target_company_id
      AND (target_after_id IS NULL OR p.id > target_after_id)
    ORDER BY p.id
    LIMIT target_limit + 1
  ) x;
  IF jsonb_array_length(v_projects) > target_limit THEN
    v_projects := v_projects - target_limit;
    v_next := v_projects->(target_limit - 1)->>'projectId';
  END IF;
  RETURN jsonb_build_object(
    'defaultCurrencyCode', v_settings.default_currency_code,
    'moneyScale', v_settings.money_scale,
    'timeZone', v_settings.time_zone,
    'projects', v_projects,
    'nextCursor', v_next
  );
END;
$$;

CREATE FUNCTION public.c1_read_project_finance_directory(
  target_company_id uuid,
  target_after_id uuid,
  target_limit integer
)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT private.c1_read_project_finance_directory(
    target_company_id, target_after_id, target_limit
  );
$$;

CREATE FUNCTION private.c1_read_project_finance_parties(
  target_company_id uuid,
  target_project_id uuid,
  target_party_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_actor uuid;
  v_tenant uuid;
  v_context jsonb;
  v_result jsonb;
BEGIN
  v_actor := auth.uid();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'PERMISSION_DENIED';
  END IF;
  IF target_project_id IS NULL OR target_party_ids IS NULL
     OR cardinality(target_party_ids) > 50
     OR array_ndims(target_party_ids) > 1 THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'INPUT_INVALID';
  END IF;
  IF array_position(target_party_ids, NULL::uuid) IS NOT NULL THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'INPUT_INVALID';
  END IF;
  v_context := private.c1_master_context(target_company_id, 'cost.read');
  v_tenant := (v_context->>'tenantId')::uuid;
  IF v_tenant IS NULL OR (v_context->>'actorId')::uuid IS DISTINCT FROM v_actor THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'PERMISSION_DENIED';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = target_project_id AND p.tenant_id = v_tenant
      AND p.company_id = target_company_id
  ) THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'RESOURCE_NOT_FOUND';
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'partyId', p.id, 'code', p.code, 'displayName', p.display_name,
    'partyKind', p.party_kind
  ) ORDER BY p.id), '[]'::jsonb) INTO v_result
  FROM public.business_parties p
  WHERE p.tenant_id = v_tenant AND p.company_id = target_company_id
    AND p.id = ANY(target_party_ids)
    AND EXISTS (
      SELECT 1 FROM public.project_subcontracts s
      WHERE s.tenant_id = v_tenant AND s.company_id = target_company_id
        AND s.project_id = target_project_id
        AND s.subcontractor_party_id = p.id
    );
  RETURN v_result;
END;
$$;

CREATE FUNCTION public.c1_read_project_finance_parties(
  target_company_id uuid,
  target_project_id uuid,
  target_party_ids uuid[]
)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT private.c1_read_project_finance_parties(
    target_company_id, target_project_id, target_party_ids
  );
$$;

REVOKE ALL ON FUNCTION private.c1_read_project_finance_directory(uuid,uuid,integer)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.c1_read_project_finance_directory(uuid,uuid,integer)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.c1_read_project_finance_parties(uuid,uuid,uuid[])
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.c1_read_project_finance_parties(uuid,uuid,uuid[])
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.c1_read_project_finance_directory(uuid,uuid,integer)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.c1_read_project_finance_parties(uuid,uuid,uuid[])
  TO authenticated;
NOTIFY pgrst, 'reload schema';
