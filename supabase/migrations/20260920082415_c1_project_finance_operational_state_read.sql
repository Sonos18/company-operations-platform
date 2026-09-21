SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE FUNCTION private.c1_read_project_finance_operational_states(
  target_company_id uuid,
  target_project_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_actor uuid;
  v_context jsonb;
  v_tenant uuid;
  v_result jsonb;
BEGIN
  v_actor := auth.uid();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'PERMISSION_DENIED';
  END IF;
  -- Reject non-vector input before array_position(), which only accepts one dimension.
  IF array_ndims(target_project_ids) IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'INPUT_INVALID';
  END IF;
  IF target_project_ids IS NULL OR cardinality(target_project_ids) < 1
    OR cardinality(target_project_ids) > 100
    OR array_position(target_project_ids, NULL::uuid) IS NOT NULL
    OR cardinality(target_project_ids) <> cardinality(ARRAY(SELECT DISTINCT unnest(target_project_ids))) THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'INPUT_INVALID';
  END IF;
  v_context := private.c1_master_context(target_company_id, 'cost.read');
  v_tenant := (v_context->>'tenantId')::uuid;
  IF v_tenant IS NULL OR (v_context->>'actorId')::uuid IS DISTINCT FROM v_actor THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'PERMISSION_DENIED';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.company_cost_settings s
    WHERE s.tenant_id = v_tenant AND s.company_id = target_company_id AND s.enabled
  ) THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'MODULE_DISABLED';
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'projectId', p.id, 'operationalState', p.operational_state
  ) ORDER BY p.id), '[]'::jsonb) INTO v_result
  FROM public.projects p
  WHERE p.tenant_id = v_tenant AND p.company_id = target_company_id
    AND p.id = ANY(target_project_ids);
  IF jsonb_array_length(v_result) <> cardinality(target_project_ids) THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'RESOURCE_NOT_FOUND';
  END IF;
  RETURN v_result;
END;
$$;

CREATE FUNCTION public.c1_read_project_finance_operational_states(
  target_company_id uuid,
  target_project_ids uuid[]
)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT private.c1_read_project_finance_operational_states(target_company_id, target_project_ids);
$$;

REVOKE ALL ON FUNCTION private.c1_read_project_finance_operational_states(uuid,uuid[]) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.c1_read_project_finance_operational_states(uuid,uuid[]) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.c1_read_project_finance_operational_states(uuid,uuid[]) TO authenticated;
NOTIFY pgrst, 'reload schema';
