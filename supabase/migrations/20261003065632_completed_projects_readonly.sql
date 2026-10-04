SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '90s';

-- A shared project lock lasts until commit, conflicting with the row lock used
-- by project completion. Replays with no data writes retain their existing RPC
-- receipt semantics. Existing RPC authorization and RLS stay in place.
CREATE FUNCTION private.c1_lock_writable_project(target_tenant_id uuid, target_company_id uuid, target_project_id uuid)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_state text;
BEGIN
  SELECT operational_state INTO v_state FROM public.projects
  WHERE tenant_id = target_tenant_id AND company_id = target_company_id AND id = target_project_id
  FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION USING errcode = 'P0001', message = 'RESOURCE_NOT_FOUND'; END IF;
  IF v_state = 'completed' THEN RAISE EXCEPTION USING errcode = 'P0001', message = 'PROJECT_COMPLETED'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION private.c1_lock_writable_project(uuid,uuid,uuid) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION private.c1_guard_completed_project_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_rows jsonb[]; v_row jsonb; v_project uuid; v_tenant uuid; v_company uuid;
BEGIN
  IF TG_TABLE_NAME = 'projects' THEN
    IF OLD.operational_state = 'completed' THEN
      RAISE EXCEPTION USING errcode = 'P0001', message = 'PROJECT_COMPLETED';
    END IF;
  ELSE
    IF TG_OP = 'INSERT' THEN v_rows := ARRAY[to_jsonb(NEW)];
    ELSIF TG_OP = 'DELETE' THEN v_rows := ARRAY[to_jsonb(OLD)];
    ELSE v_rows := ARRAY[to_jsonb(OLD), to_jsonb(NEW)]; END IF;
    FOREACH v_row IN ARRAY v_rows LOOP
      v_tenant := (v_row->>'tenant_id')::uuid;
      v_company := (v_row->>'company_id')::uuid;
      v_project := NULL;
      IF TG_ARGV[0] = 'project' THEN v_project := (v_row->>'project_id')::uuid;
      ELSIF TG_ARGV[0] = 'item' THEN
        SELECT project_id INTO v_project FROM public.project_cost_items
        WHERE id=(v_row->>'project_cost_item_id')::uuid AND tenant_id=v_tenant AND company_id=v_company;
      ELSIF TG_ARGV[0] = 'detail' THEN
        SELECT item.project_id INTO v_project
        FROM public.project_cost_item_details detail
        JOIN public.project_cost_items item ON item.id=detail.project_cost_item_id AND item.tenant_id=detail.tenant_id AND item.company_id=detail.company_id
        WHERE detail.id=(v_row->>'project_cost_item_detail_id')::uuid AND detail.tenant_id=v_tenant AND detail.company_id=v_company;
      ELSIF TG_ARGV[0] = 'engagement' THEN
        SELECT project_id INTO v_project FROM public.project_engagements
        WHERE id=(v_row->>'engagement_id')::uuid AND tenant_id=v_tenant AND company_id=v_company;
      ELSIF TG_ARGV[0] = 'storage' THEN
        IF v_row->>'bucket_id' <> 'c1-accounting-evidence' THEN CONTINUE; END IF;
        SELECT project_id,tenant_id,company_id INTO v_project,v_tenant,v_company
        FROM public.cost_evidence_files
        WHERE bucket_id=v_row->>'bucket_id' AND object_path=v_row->>'name';
      END IF;
      PERFORM private.c1_lock_writable_project(v_tenant,v_company,v_project);
    END LOOP;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;
REVOKE ALL ON FUNCTION private.c1_guard_completed_project_write() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER a_c1_completed_project_guard BEFORE UPDATE OR DELETE ON public.projects
FOR EACH ROW EXECUTE FUNCTION private.c1_guard_completed_project_write();
CREATE TRIGGER a_c1_completed_project_guard BEFORE INSERT OR UPDATE OR DELETE ON public.project_cost_items
FOR EACH ROW EXECUTE FUNCTION private.c1_guard_completed_project_write('project');
CREATE TRIGGER a_c1_completed_project_guard BEFORE INSERT OR UPDATE OR DELETE ON public.project_engagements
FOR EACH ROW EXECUTE FUNCTION private.c1_guard_completed_project_write('project');
CREATE TRIGGER a_c1_completed_project_guard BEFORE INSERT OR UPDATE OR DELETE ON public.project_budget_versions
FOR EACH ROW EXECUTE FUNCTION private.c1_guard_completed_project_write('project');
CREATE TRIGGER a_c1_completed_project_guard BEFORE INSERT OR UPDATE OR DELETE ON public.project_budget_lines
FOR EACH ROW EXECUTE FUNCTION private.c1_guard_completed_project_write('project');
CREATE TRIGGER a_c1_completed_project_guard BEFORE INSERT OR UPDATE OR DELETE ON public.project_owner_advances
FOR EACH ROW EXECUTE FUNCTION private.c1_guard_completed_project_write('project');
CREATE TRIGGER a_c1_completed_project_guard BEFORE INSERT OR UPDATE OR DELETE ON public.project_subcontracts
FOR EACH ROW EXECUTE FUNCTION private.c1_guard_completed_project_write('project');
CREATE TRIGGER a_c1_completed_project_guard BEFORE INSERT OR UPDATE OR DELETE ON public.project_subcontract_payments
FOR EACH ROW EXECUTE FUNCTION private.c1_guard_completed_project_write('project');
CREATE TRIGGER a_c1_completed_project_guard BEFORE INSERT OR UPDATE OR DELETE ON public.project_cost_reconciliation_resolutions
FOR EACH ROW EXECUTE FUNCTION private.c1_guard_completed_project_write('project');
CREATE TRIGGER a_c1_completed_project_guard BEFORE INSERT OR UPDATE OR DELETE ON public.cost_evidence_files
FOR EACH ROW EXECUTE FUNCTION private.c1_guard_completed_project_write('project');
CREATE TRIGGER a_c1_completed_project_guard BEFORE INSERT OR UPDATE OR DELETE ON public.cost_evidence_links
FOR EACH ROW EXECUTE FUNCTION private.c1_guard_completed_project_write('project');
CREATE TRIGGER a_c1_completed_project_guard BEFORE INSERT OR UPDATE OR DELETE ON public.project_cost_item_details
FOR EACH ROW EXECUTE FUNCTION private.c1_guard_completed_project_write('item');
CREATE TRIGGER a_c1_completed_project_guard BEFORE INSERT OR UPDATE OR DELETE ON public.project_cost_item_sources
FOR EACH ROW EXECUTE FUNCTION private.c1_guard_completed_project_write('item');
CREATE TRIGGER a_c1_completed_project_guard BEFORE INSERT OR UPDATE OR DELETE ON public.project_cost_item_detail_sources
FOR EACH ROW EXECUTE FUNCTION private.c1_guard_completed_project_write('detail');
CREATE TRIGGER a_c1_completed_project_guard BEFORE INSERT OR UPDATE OR DELETE ON public.engagement_components
FOR EACH ROW EXECUTE FUNCTION private.c1_guard_completed_project_write('engagement');
-- Upload intents issued before completion must not allow a later upload.
CREATE TRIGGER a_c1_completed_project_evidence_guard BEFORE INSERT OR UPDATE ON storage.objects
FOR EACH ROW EXECUTE FUNCTION private.c1_guard_completed_project_write('storage');

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE FUNCTION private.c1_read_project_finance_directory_v2(
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
  v_after_rank integer;
  v_after_updated timestamptz;
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
  IF target_after_id IS NOT NULL THEN
    SELECT CASE p.operational_state WHEN 'active' THEN 0 WHEN 'paused' THEN 1 WHEN 'unknown' THEN 2 ELSE 3 END, p.updated_at INTO v_after_rank, v_after_updated
    FROM public.projects p WHERE p.id=target_after_id AND p.tenant_id=v_tenant AND p.company_id=target_company_id;
    IF NOT FOUND THEN RAISE EXCEPTION USING errcode='P0001', message='RESOURCE_NOT_FOUND'; END IF;
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'projectId',x.id,'projectCode',x.code,'projectName',x.name,
    'operationalState',x.operational_state,'updatedAt',x.updated_at
  ) ORDER BY x.state_rank,x.updated_at DESC,x.id), '[]'::jsonb) INTO v_projects
  FROM (
    SELECT p.id,p.code,p.name,p.operational_state,p.updated_at,CASE p.operational_state WHEN 'active' THEN 0 WHEN 'paused' THEN 1 WHEN 'unknown' THEN 2 ELSE 3 END AS state_rank
    FROM public.projects p
    WHERE p.tenant_id=v_tenant AND p.company_id=target_company_id AND (
      target_after_id IS NULL OR CASE p.operational_state WHEN 'active' THEN 0 WHEN 'paused' THEN 1 WHEN 'unknown' THEN 2 ELSE 3 END > v_after_rank
      OR (CASE p.operational_state WHEN 'active' THEN 0 WHEN 'paused' THEN 1 WHEN 'unknown' THEN 2 ELSE 3 END = v_after_rank AND p.updated_at < v_after_updated)
      OR (CASE p.operational_state WHEN 'active' THEN 0 WHEN 'paused' THEN 1 WHEN 'unknown' THEN 2 ELSE 3 END = v_after_rank AND p.updated_at = v_after_updated AND p.id > target_after_id)
    )
    ORDER BY state_rank,p.updated_at DESC,p.id LIMIT target_limit+1
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

create function public.c1_read_project_cost_draft_management_metadata_v2(target_company_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_tenant_id uuid;
begin
  if v_actor_id is null then raise exception using errcode = 'P0001', message = 'PERMISSION_DENIED'; end if;
  select membership.tenant_id into v_tenant_id
  from public.company_memberships membership
  where membership.company_id = target_company_id and membership.user_id = v_actor_id and membership.is_active;
  if v_tenant_id is null or not exists (
    select 1 from public.company_cost_settings settings
    where settings.tenant_id = v_tenant_id and settings.company_id = target_company_id and settings.enabled
  ) or not (
    private.has_company_permission(v_tenant_id, target_company_id, 'cost.manage')
    or private.has_company_permission(v_tenant_id, target_company_id, 'cost.prepare')
  ) then raise exception using errcode = 'P0001', message = 'PERMISSION_DENIED'; end if;

  return pg_catalog.jsonb_build_object(
    'projects', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id', project.id, 'code', project.code, 'name', project.name, 'operationalState', project.operational_state) order by project.code, project.id)
      from public.projects project
      where project.tenant_id = v_tenant_id and project.company_id = target_company_id
    ), '[]'::jsonb),
    'categories', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'categoryId', category.id, 'code', category.code, 'name', category.name,
        'isActive', category.is_active, 'draftEligible', category.is_active and category.posting_strategy = 'ordinary_detail',
        'postingStrategy', category.posting_strategy
      ) order by category.display_order, category.id)
      from public.cost_categories category
      where category.tenant_id = v_tenant_id and category.company_id = target_company_id
    ), '[]'::jsonb)
  );
end;
$$;

CREATE FUNCTION public.c1_read_project_finance_directory_v2(target_company_id uuid, target_after_id uuid, target_limit integer)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$ SELECT private.c1_read_project_finance_directory_v2(target_company_id,target_after_id,target_limit); $$;

REVOKE ALL ON FUNCTION private.c1_read_project_finance_directory_v2(uuid,uuid,integer) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.c1_read_project_finance_directory_v2(uuid,uuid,integer) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.c1_read_project_cost_draft_management_metadata_v2(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.c1_read_project_finance_directory_v2(uuid,uuid,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.c1_read_project_cost_draft_management_metadata_v2(uuid) TO authenticated;
NOTIFY pgrst, 'reload schema';
