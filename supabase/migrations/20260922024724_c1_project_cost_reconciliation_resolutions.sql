SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE TABLE public.project_cost_reconciliation_resolutions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  company_id uuid NOT NULL,
  project_id uuid NOT NULL,
  cost_category_id uuid NOT NULL,
  resolution_code text NOT NULL,
  reason text NOT NULL,
  version bigint NOT NULL DEFAULT 0,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  updated_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_cost_reconciliation_resolutions_project_fkey
    FOREIGN KEY (project_id, tenant_id, company_id)
    REFERENCES public.projects(id, tenant_id, company_id)
    ON DELETE RESTRICT,
  CONSTRAINT project_cost_reconciliation_resolutions_category_fkey
    FOREIGN KEY (cost_category_id, tenant_id, company_id)
    REFERENCES public.cost_categories(id, tenant_id, company_id)
    ON DELETE RESTRICT,
  CONSTRAINT project_cost_reconciliation_resolutions_resolution_check
    CHECK (resolution_code = 'canonical_subcontract_payments_authoritative'),
  CONSTRAINT project_cost_reconciliation_resolutions_reason_check
    CHECK (btrim(reason) <> ''),
  CONSTRAINT project_cost_reconciliation_resolutions_version_check
    CHECK (version >= 0),
  CONSTRAINT project_cost_reconciliation_resolutions_one_per_category
    UNIQUE (tenant_id, company_id, project_id, cost_category_id)
);

CREATE INDEX project_cost_reconciliation_resolutions_scope_idx
  ON public.project_cost_reconciliation_resolutions
  (tenant_id, company_id, project_id, cost_category_id, id);

ALTER TABLE public.project_cost_reconciliation_resolutions ENABLE ROW LEVEL SECURITY;

CREATE POLICY c1_finance_read
  ON public.project_cost_reconciliation_resolutions
  FOR SELECT
  TO authenticated
  USING (private.c1_can_read_project_cost(tenant_id, company_id));

REVOKE ALL ON TABLE public.project_cost_reconciliation_resolutions FROM anon;
REVOKE ALL ON TABLE public.project_cost_reconciliation_resolutions FROM authenticated;
GRANT SELECT ON TABLE public.project_cost_reconciliation_resolutions TO authenticated;

CREATE TRIGGER a_c1_finance_prepare
  BEFORE INSERT OR DELETE OR UPDATE
  ON public.project_cost_reconciliation_resolutions
  FOR EACH ROW
  EXECUTE FUNCTION private.c1_finance_prepare_row();

CREATE TRIGGER z_c1_finance_audit
  AFTER INSERT OR UPDATE
  ON public.project_cost_reconciliation_resolutions
  FOR EACH ROW
  EXECUTE FUNCTION private.c1_finance_audit_row();

COMMENT ON TABLE public.project_cost_reconciliation_resolutions IS
  'Audited C1 finance decision that resolves a legacy project-cost category to a canonical source.';

COMMENT ON COLUMN public.project_cost_reconciliation_resolutions.resolution_code IS
  'canonical_subcontract_payments_authoritative means recorded project_subcontract_payments are authoritative for the category while legacy rows are retained for history.';

NOTIFY pgrst, 'reload schema';
