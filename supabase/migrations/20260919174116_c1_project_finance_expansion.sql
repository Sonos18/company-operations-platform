-- Taskovia C1 finance expansion. DRAFT: not executed on Cloud DEV.
-- Target supplied by deployment runner: gtgljlnhwvhqdnwrfdfj (Cloud DEV).
-- This is a migration BODY: execute ALL statements in ONE transaction.
-- A SQL-Editor runner must wrap the whole body in BEGIN / COMMIT.
-- Use a NEW migration identity. Never edit an already-applied migration.
-- No category seed, monetary backfill, legacy-row cleanup, or API cutover here.
-- All new tables are read-only to authenticated; future writes require guarded RPCs.

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '90s';
SELECT pg_catalog.pg_advisory_xact_lock(71842, 1);

DO $$
DECLARE
  t text;
BEGIN
  IF to_regclass('public.projects') IS NULL
     OR to_regclass('public.business_parties') IS NULL
     OR to_regclass('public.project_cost_items') IS NULL
     OR to_regclass('public.audit_events') IS NULL
     OR to_regprocedure('private.c1_can_read_project_cost(uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION 'C1_FINANCE_BASELINE_MISSING';
  END IF;
  FOREACH t IN ARRAY ARRAY[
    'cost_categories', 'project_budget_versions', 'project_budget_lines',
    'project_owner_advances', 'project_subcontracts', 'project_subcontract_payments'
  ] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      RAISE EXCEPTION 'C1_FINANCE_ALREADY_EXISTS: %; inspect history/schema instead of rerunning', t;
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'project_cost_items'
               AND column_name = 'cost_category_id') THEN
    RAISE EXCEPTION 'C1_FINANCE_CATEGORY_COLUMN_ALREADY_EXISTS';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'project_cost_items'
                   AND column_name = 'work_status') THEN
    RAISE EXCEPTION 'C1_FINANCE_UNEXPECTED_LEGACY_BASELINE';
  END IF;
END;
$$;

CREATE TABLE public.cost_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  company_id uuid NOT NULL,
  code text NOT NULL CHECK (code ~ '^[a-z][a-z0-9_]*$'),
  name text NOT NULL CHECK (btrim(name) <> ''),
  display_order integer NOT NULL DEFAULT 0 CHECK (display_order >= 0),
  is_active boolean NOT NULL DEFAULT true,
  version bigint NOT NULL DEFAULT 0 CHECK (version >= 0),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  updated_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT c1fc_category_scope UNIQUE (id, tenant_id, company_id),
  CONSTRAINT c1fc_category_code UNIQUE (tenant_id, company_id, code),
  CONSTRAINT c1fc_category_company FOREIGN KEY (company_id, tenant_id)
    REFERENCES public.companies(id, tenant_id) ON DELETE RESTRICT
);
COMMENT ON TABLE public.cost_categories IS
  'Company-scoped cost taxonomy. VQH seed codes: materials, machinery, direct_labor, subcontract_labor, other. No seed is performed by this migration.';

CREATE TABLE public.project_budget_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  company_id uuid NOT NULL,
  project_id uuid NOT NULL,
  revision_no integer NOT NULL CHECK (revision_no > 0),
  name text NOT NULL CHECK (btrim(name) <> ''),
  currency_code text NOT NULL CHECK (currency_code ~ '^[A-Z]{3}$'),
  detail_mode text NOT NULL DEFAULT 'summary'
    CHECK (detail_mode IN ('summary', 'categorized')),
  total_amount_text text NOT NULL CHECK (total_amount_text ~ '^[0-9]{1,16}([.][0-9]{1,4})?$'),
  total_amount numeric GENERATED ALWAYS AS (total_amount_text::numeric) STORED,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'approved', 'superseded', 'cancelled')),
  effective_date date,
  approved_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  approved_at timestamptz,
  reference text CHECK (reference IS NULL OR btrim(reference) <> ''),
  source_reference text CHECK (source_reference IS NULL OR btrim(source_reference) <> ''),
  note text,
  version bigint NOT NULL DEFAULT 0 CHECK (version >= 0),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  updated_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT c1fc_budget_scope UNIQUE (id, tenant_id, company_id, project_id),
  CONSTRAINT c1fc_budget_revision UNIQUE (tenant_id, company_id, project_id, revision_no),
  CONSTRAINT c1fc_budget_project FOREIGN KEY (project_id, tenant_id, company_id)
    REFERENCES public.projects(id, tenant_id, company_id) ON DELETE RESTRICT,
  CONSTRAINT c1fc_budget_approval_shape CHECK (
    (approved_by IS NULL) = (approved_at IS NULL)
    AND (status NOT IN ('approved', 'superseded') OR approved_at IS NOT NULL)
    AND (status <> 'draft' OR approved_at IS NULL)
  )
);
CREATE UNIQUE INDEX c1fc_budget_one_approved
  ON public.project_budget_versions(tenant_id, company_id, project_id, currency_code)
  WHERE status = 'approved';
COMMENT ON TABLE public.project_budget_versions IS
  'Versioned project estimate. Not investor cash received. No automatic revenue/profit interpretation. Summary-only and categorized versions are explicit, mutually exclusive representation modes.';

CREATE TABLE public.project_budget_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  company_id uuid NOT NULL,
  project_id uuid NOT NULL,
  budget_version_id uuid NOT NULL,
  cost_category_id uuid NOT NULL,
  line_no integer NOT NULL CHECK (line_no > 0),
  description text NOT NULL CHECK (btrim(description) <> ''),
  amount_text text NOT NULL CHECK (amount_text ~ '^[0-9]{1,16}([.][0-9]{1,4})?$'),
  amount numeric GENERATED ALWAYS AS (amount_text::numeric) STORED,
  reference text CHECK (reference IS NULL OR btrim(reference) <> ''),
  source_reference text CHECK (source_reference IS NULL OR btrim(source_reference) <> ''),
  note text,
  version bigint NOT NULL DEFAULT 0 CHECK (version >= 0),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  updated_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT c1fc_budget_line_scope UNIQUE (id, tenant_id, company_id, project_id),
  CONSTRAINT c1fc_budget_line_no UNIQUE (budget_version_id, line_no),
  CONSTRAINT c1fc_budget_line_parent FOREIGN KEY (budget_version_id, tenant_id, company_id, project_id)
    REFERENCES public.project_budget_versions(id, tenant_id, company_id, project_id) ON DELETE RESTRICT,
  CONSTRAINT c1fc_budget_line_category FOREIGN KEY (cost_category_id, tenant_id, company_id)
    REFERENCES public.cost_categories(id, tenant_id, company_id) ON DELETE RESTRICT
);
CREATE INDEX c1fc_budget_lines_scope
  ON public.project_budget_lines(tenant_id, company_id, project_id, budget_version_id);
CREATE INDEX c1fc_budget_lines_category
  ON public.project_budget_lines(cost_category_id, tenant_id, company_id);
COMMENT ON TABLE public.project_budget_lines IS
  'Estimate detail lines; currency inherited from the version. Multiple lines per category are allowed. Header total must match all lines when a categorized version is approved.';

CREATE TABLE public.project_owner_advances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  company_id uuid NOT NULL,
  project_id uuid NOT NULL,
  description text NOT NULL CHECK (btrim(description) <> ''),
  currency_code text NOT NULL CHECK (currency_code ~ '^[A-Z]{3}$'),
  amount_text text NOT NULL CHECK (amount_text ~ '^[0-9]{1,16}([.][0-9]{1,4})?$'),
  amount numeric GENERATED ALWAYS AS (amount_text::numeric) STORED,
  received_date date,
  payer_name text CHECK (payer_name IS NULL OR btrim(payer_name) <> ''),
  receipt_no text CHECK (receipt_no IS NULL OR btrim(receipt_no) <> ''),
  reference text CHECK (reference IS NULL OR btrim(reference) <> ''),
  source_reference text CHECK (source_reference IS NULL OR btrim(source_reference) <> ''),
  note text,
  status text NOT NULL DEFAULT 'recorded' CHECK (status IN ('recorded', 'voided')),
  void_reason text,
  version bigint NOT NULL DEFAULT 0 CHECK (version >= 0),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  updated_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT c1fc_owner_scope UNIQUE (id, tenant_id, company_id, project_id),
  CONSTRAINT c1fc_owner_project FOREIGN KEY (project_id, tenant_id, company_id)
    REFERENCES public.projects(id, tenant_id, company_id) ON DELETE RESTRICT,
  CONSTRAINT c1fc_owner_void_reason CHECK (
    (status = 'recorded' AND void_reason IS NULL)
    OR (status = 'voided' AND void_reason IS NOT NULL AND btrim(void_reason) <> '')
  )
);
CREATE INDEX c1fc_owner_project_date
  ON public.project_owner_advances(tenant_id, company_id, project_id, received_date, id);
COMMENT ON TABLE public.project_owner_advances IS
  'Investor/owner -> company ONLY: actual advances received. Never contractor payouts, never estimate/revenue. NULL received_date means unknown business date, not zero cash or the import date.';

CREATE TABLE public.project_subcontracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  company_id uuid NOT NULL,
  project_id uuid NOT NULL,
  subcontractor_party_id uuid NOT NULL,
  code text NOT NULL CHECK (btrim(code) <> ''),
  contract_no text CHECK (contract_no IS NULL OR btrim(contract_no) <> ''),
  contract_name text NOT NULL CHECK (btrim(contract_name) <> ''),
  contract_date date,
  currency_code text NOT NULL CHECK (currency_code ~ '^[A-Z]{3}$'),
  contract_value_text text CHECK (contract_value_text IS NULL OR contract_value_text ~ '^[0-9]{1,16}([.][0-9]{1,4})?$'),
  contract_value numeric GENERATED ALWAYS AS (contract_value_text::numeric) STORED,
  warranty_retention_rate_bps integer
    CHECK (warranty_retention_rate_bps BETWEEN 0 AND 10000),
  is_active boolean NOT NULL DEFAULT true,
  reference text CHECK (reference IS NULL OR btrim(reference) <> ''),
  source_reference text CHECK (source_reference IS NULL OR btrim(source_reference) <> ''),
  note text,
  version bigint NOT NULL DEFAULT 0 CHECK (version >= 0),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  updated_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT c1fc_subcontract_scope UNIQUE (id, tenant_id, company_id, project_id, currency_code),
  CONSTRAINT c1fc_subcontract_code UNIQUE (tenant_id, company_id, project_id, code),
  CONSTRAINT c1fc_subcontract_project FOREIGN KEY (project_id, tenant_id, company_id)
    REFERENCES public.projects(id, tenant_id, company_id) ON DELETE RESTRICT,
  CONSTRAINT c1fc_subcontract_party FOREIGN KEY (subcontractor_party_id, tenant_id, company_id)
    REFERENCES public.business_parties(id, tenant_id, company_id) ON DELETE RESTRICT
);
CREATE INDEX c1fc_subcontract_party_index
  ON public.project_subcontracts(subcontractor_party_id, tenant_id, company_id, project_id);
COMMENT ON COLUMN public.project_subcontracts.contract_value_text IS
  'Editable reference amount with audit/reason. NULL means not established, 0 means explicitly zero. Not an expense. This schema does not impose an unapproved hard payment ceiling.';
COMMENT ON COLUMN public.project_subcontracts.warranty_retention_rate_bps IS
  'Default for future vouchers only; changing it never recalculates historical payment retention.';

CREATE TABLE public.project_subcontract_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  company_id uuid NOT NULL,
  project_id uuid NOT NULL,
  project_subcontract_id uuid NOT NULL,
  currency_code text NOT NULL CHECK (currency_code ~ '^[A-Z]{3}$'),
  description text NOT NULL CHECK (btrim(description) <> ''),
  payment_date date,
  paid_amount_text text NOT NULL CHECK (paid_amount_text ~ '^[0-9]{1,16}([.][0-9]{1,4})?$'),
  paid_amount numeric GENERATED ALWAYS AS (paid_amount_text::numeric) STORED,
  warranty_retention_amount_text text CHECK (warranty_retention_amount_text IS NULL OR warranty_retention_amount_text ~ '^[0-9]{1,16}([.][0-9]{1,4})?$'),
  warranty_retention_amount numeric GENERATED ALWAYS AS (warranty_retention_amount_text::numeric) STORED,
  retention_rate_bps integer CHECK (retention_rate_bps BETWEEN 0 AND 10000),
  payment_reference text CHECK (payment_reference IS NULL OR btrim(payment_reference) <> ''),
  source_reference text CHECK (source_reference IS NULL OR btrim(source_reference) <> ''),
  note text,
  status text NOT NULL DEFAULT 'recorded' CHECK (status IN ('recorded', 'voided')),
  void_reason text,
  version bigint NOT NULL DEFAULT 0 CHECK (version >= 0),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  updated_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT c1fc_payment_scope UNIQUE (id, tenant_id, company_id, project_id),
  CONSTRAINT c1fc_payment_contract FOREIGN KEY
    (project_subcontract_id, tenant_id, company_id, project_id, currency_code)
    REFERENCES public.project_subcontracts(id, tenant_id, company_id, project_id, currency_code) ON DELETE RESTRICT,
  CONSTRAINT c1fc_payment_retention_shape CHECK
    (retention_rate_bps IS NULL OR warranty_retention_amount_text IS NOT NULL),
  CONSTRAINT c1fc_payment_void_reason CHECK (
    (status = 'recorded' AND void_reason IS NULL)
    OR (status = 'voided' AND void_reason IS NOT NULL AND btrim(void_reason) <> '')
  )
);
CREATE INDEX c1fc_payment_contract_date
  ON public.project_subcontract_payments(project_subcontract_id, tenant_id, company_id, project_id, currency_code, payment_date, id);
CREATE INDEX c1fc_payment_project_date
  ON public.project_subcontract_payments(tenant_id, company_id, project_id, payment_date, id);
COMMENT ON TABLE public.project_subcontract_payments IS
  'Company -> subcontractor cash paid, with a separate recorded warranty-retention snapshot. No acceptance/progress workflow. Not draft payment requests. Voided rows are excluded from totals; never add both this table and its legacy source rows.';
COMMENT ON COLUMN public.project_subcontract_payments.paid_amount_text IS
  'Cash actually paid in this voucher, excluding the separately retained amount. Not the total contract value.';
COMMENT ON COLUMN public.project_subcontract_payments.warranty_retention_amount_text IS
  'Recorded retention: NULL unrecorded, 0 explicitly recorded zero, positive amount retained. Not proof of currently outstanding retention after later release. Release/refund lifecycle is outside this migration.';

-- EXPAND ONLY: leave new classification nullable until controlled mapping/cutover.
ALTER TABLE public.project_cost_items
  ADD COLUMN cost_category_id uuid,
  ADD CONSTRAINT c1fc_cost_item_category FOREIGN KEY (cost_category_id, tenant_id, company_id)
    REFERENCES public.cost_categories(id, tenant_id, company_id) ON DELETE RESTRICT;
CREATE UNIQUE INDEX c1fc_cost_item_one_category
  ON public.project_cost_items(tenant_id, company_id, project_id, cost_category_id)
  WHERE cost_category_id IS NOT NULL;
CREATE INDEX c1fc_cost_item_category_lookup
  ON public.project_cost_items(cost_category_id, tenant_id, company_id);
COMMENT ON COLUMN public.project_cost_items.cost_category_id IS
  'Canonical category. Transitional NULL until reviewed mapping. No description-based classification in runtime. One classified parent per project/category.';

-- New-table write infrastructure only. No existing function or trigger is replaced.
-- An authorized write RPC must validate permission and expectedVersion first.
-- For a privileged one-off write, actor_id/request_id/change_reason are explicit
-- transaction-local settings. They are attribution, NOT an authorization boundary.
CREATE FUNCTION private.c1_finance_prepare_row()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  actor uuid;
  request uuid;
  reason text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'C1_FINANCE_DELETE_UNSUPPORTED';
  END IF;
  actor := auth.uid();
  IF actor IS NULL THEN
    actor := nullif(current_setting('taskovia.c1_finance.actor_id', true), '')::uuid;
  END IF;
  request := nullif(current_setting('taskovia.c1_finance.request_id', true), '')::uuid;
  reason := nullif(btrim(current_setting('taskovia.c1_finance.change_reason', true)), '');
  IF actor IS NULL THEN RAISE EXCEPTION 'C1_FINANCE_ACTOR_REQUIRED'; END IF;
  IF request IS NULL THEN RAISE EXCEPTION 'C1_FINANCE_REQUEST_ID_REQUIRED'; END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := actor;
    NEW.created_at := statement_timestamp();
    NEW.version := 0;
  ELSE
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.company_id IS DISTINCT FROM OLD.company_id THEN
      RAISE EXCEPTION 'C1_FINANCE_IDENTITY_IMMUTABLE';
    END IF;
    IF TG_TABLE_NAME <> 'cost_categories' THEN
      IF NEW.project_id IS DISTINCT FROM OLD.project_id THEN
        RAISE EXCEPTION 'C1_FINANCE_IDENTITY_IMMUTABLE';
      END IF;
    ELSE
      IF NEW.code IS DISTINCT FROM OLD.code THEN
        RAISE EXCEPTION 'C1_FINANCE_CATEGORY_CODE_IMMUTABLE';
      END IF;
    END IF;
    IF reason IS NULL THEN RAISE EXCEPTION 'C1_FINANCE_CHANGE_REASON_REQUIRED'; END IF;
    NEW.created_by := OLD.created_by;
    NEW.created_at := OLD.created_at;
    NEW.version := OLD.version + 1;
  END IF;
  NEW.updated_by := actor;
  NEW.updated_at := statement_timestamp();
  RETURN NEW;
END;
$$;

CREATE FUNCTION private.c1_finance_audit_row()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.audit_events
    (tenant_id, company_id, actor_id, action, resource_type, resource_id,
     request_id, before_summary, after_summary)
  VALUES
    (NEW.tenant_id, NEW.company_id, NEW.updated_by,
     'c1.finance.' || TG_TABLE_NAME || '.' || lower(TG_OP), TG_TABLE_NAME, NEW.id::text,
     nullif(current_setting('taskovia.c1_finance.request_id', true), '')::uuid,
     CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END,
     jsonb_build_object('record', to_jsonb(NEW), 'reason',
       nullif(current_setting('taskovia.c1_finance.change_reason', true), '')));
  RETURN NEW;
END;
$$;

CREATE FUNCTION private.c1_finance_guard_budget()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  line_count bigint;
  line_total numeric;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'draft' THEN RAISE EXCEPTION 'C1_FINANCE_BUDGET_CREATE_DRAFT'; END IF;
    NEW.approved_by := NULL;
    NEW.approved_at := NULL;
    RETURN NEW;
  END IF;
  IF OLD.status <> 'draft' THEN
    IF ROW(NEW.revision_no, NEW.name, NEW.currency_code, NEW.detail_mode,
           NEW.total_amount_text, NEW.effective_date, NEW.approved_by, NEW.approved_at,
           NEW.reference, NEW.source_reference, NEW.note)
       IS DISTINCT FROM
       ROW(OLD.revision_no, OLD.name, OLD.currency_code, OLD.detail_mode,
           OLD.total_amount_text, OLD.effective_date, OLD.approved_by, OLD.approved_at,
           OLD.reference, OLD.source_reference, OLD.note) THEN
      RAISE EXCEPTION 'C1_FINANCE_APPROVED_BUDGET_IMMUTABLE';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status
       AND NOT (OLD.status = 'approved' AND NEW.status IN ('superseded', 'cancelled')) THEN
      RAISE EXCEPTION 'C1_FINANCE_BUDGET_TRANSITION_INVALID';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.status = 'superseded' THEN RAISE EXCEPTION 'C1_FINANCE_BUDGET_TRANSITION_INVALID'; END IF;
  NEW.approved_by := NULL;
  NEW.approved_at := NULL;
  IF NEW.status = 'approved' THEN
    SELECT count(*), coalesce(sum(amount_text::numeric), 0)
      INTO line_count, line_total
    FROM public.project_budget_lines
    WHERE budget_version_id = NEW.id AND tenant_id = NEW.tenant_id
      AND company_id = NEW.company_id AND project_id = NEW.project_id;
    IF NEW.detail_mode = 'categorized'
       AND (line_count = 0 OR line_total <> NEW.total_amount_text::numeric) THEN
      RAISE EXCEPTION 'C1_FINANCE_BUDGET_TOTAL_MISMATCH';
    END IF;
    IF NEW.detail_mode = 'summary' AND line_count <> 0 THEN
      RAISE EXCEPTION 'C1_FINANCE_SUMMARY_BUDGET_HAS_LINES';
    END IF;
    NEW.approved_by := NEW.updated_by;
    NEW.approved_at := statement_timestamp();
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION private.c1_finance_guard_budget_line()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  parent_status text;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.budget_version_id IS DISTINCT FROM OLD.budget_version_id THEN
    RAISE EXCEPTION 'C1_FINANCE_BUDGET_LINE_PARENT_IMMUTABLE';
  END IF;
  SELECT status INTO parent_status
    FROM public.project_budget_versions
    WHERE id = NEW.budget_version_id AND tenant_id = NEW.tenant_id
      AND company_id = NEW.company_id AND project_id = NEW.project_id
    FOR UPDATE;
  IF parent_status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'C1_FINANCE_BUDGET_LINES_REQUIRE_DRAFT';
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION private.c1_finance_guard_recorded_money()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'recorded' THEN RAISE EXCEPTION 'C1_FINANCE_CREATE_RECORDED_ONLY'; END IF;
    RETURN NEW;
  END IF;
  IF TG_TABLE_NAME = 'project_owner_advances' THEN
    IF ROW(NEW.currency_code, NEW.description, NEW.amount_text, NEW.received_date,
           NEW.payer_name, NEW.receipt_no, NEW.reference, NEW.source_reference)
       IS DISTINCT FROM
       ROW(OLD.currency_code, OLD.description, OLD.amount_text, OLD.received_date,
           OLD.payer_name, OLD.receipt_no, OLD.reference, OLD.source_reference) THEN
      RAISE EXCEPTION 'C1_FINANCE_POSTED_MONEY_IMMUTABLE';
    END IF;
  ELSE
    IF ROW(NEW.project_subcontract_id, NEW.currency_code, NEW.description,
           NEW.payment_date, NEW.paid_amount_text, NEW.warranty_retention_amount_text,
           NEW.retention_rate_bps, NEW.payment_reference, NEW.source_reference)
       IS DISTINCT FROM
       ROW(OLD.project_subcontract_id, OLD.currency_code, OLD.description,
           OLD.payment_date, OLD.paid_amount_text, OLD.warranty_retention_amount_text,
           OLD.retention_rate_bps, OLD.payment_reference, OLD.source_reference) THEN
      RAISE EXCEPTION 'C1_FINANCE_POSTED_MONEY_IMMUTABLE';
    END IF;
  END IF;
  IF OLD.status = 'voided' AND NEW.status <> 'voided' THEN
    RAISE EXCEPTION 'C1_FINANCE_VOID_IS_FINAL';
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION private.c1_finance_guard_subcontract()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF NEW.subcontractor_party_id IS DISTINCT FROM OLD.subcontractor_party_id THEN
    RAISE EXCEPTION 'C1_FINANCE_SUBCONTRACT_PARTY_IMMUTABLE';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.c1_finance_prepare_row() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.c1_finance_audit_row() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.c1_finance_guard_budget() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.c1_finance_guard_budget_line() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.c1_finance_guard_recorded_money() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.c1_finance_guard_subcontract() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER a_c1_finance_prepare BEFORE INSERT OR UPDATE OR DELETE ON public.cost_categories
  FOR EACH ROW EXECUTE FUNCTION private.c1_finance_prepare_row();
CREATE TRIGGER z_c1_finance_audit AFTER INSERT OR UPDATE ON public.cost_categories
  FOR EACH ROW EXECUTE FUNCTION private.c1_finance_audit_row();
ALTER TABLE public.cost_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cost_categories FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.cost_categories FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.cost_categories TO authenticated;
CREATE POLICY c1_finance_read ON public.cost_categories
  FOR SELECT TO authenticated
  USING (private.c1_can_read_project_cost(tenant_id, company_id));

CREATE TRIGGER a_c1_finance_prepare BEFORE INSERT OR UPDATE OR DELETE ON public.project_budget_versions
  FOR EACH ROW EXECUTE FUNCTION private.c1_finance_prepare_row();
CREATE TRIGGER z_c1_finance_audit AFTER INSERT OR UPDATE ON public.project_budget_versions
  FOR EACH ROW EXECUTE FUNCTION private.c1_finance_audit_row();
ALTER TABLE public.project_budget_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_budget_versions FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.project_budget_versions FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.project_budget_versions TO authenticated;
CREATE POLICY c1_finance_read ON public.project_budget_versions
  FOR SELECT TO authenticated
  USING (private.c1_can_read_project_cost(tenant_id, company_id));

CREATE TRIGGER a_c1_finance_prepare BEFORE INSERT OR UPDATE OR DELETE ON public.project_budget_lines
  FOR EACH ROW EXECUTE FUNCTION private.c1_finance_prepare_row();
CREATE TRIGGER z_c1_finance_audit AFTER INSERT OR UPDATE ON public.project_budget_lines
  FOR EACH ROW EXECUTE FUNCTION private.c1_finance_audit_row();
ALTER TABLE public.project_budget_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_budget_lines FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.project_budget_lines FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.project_budget_lines TO authenticated;
CREATE POLICY c1_finance_read ON public.project_budget_lines
  FOR SELECT TO authenticated
  USING (private.c1_can_read_project_cost(tenant_id, company_id));

CREATE TRIGGER a_c1_finance_prepare BEFORE INSERT OR UPDATE OR DELETE ON public.project_owner_advances
  FOR EACH ROW EXECUTE FUNCTION private.c1_finance_prepare_row();
CREATE TRIGGER z_c1_finance_audit AFTER INSERT OR UPDATE ON public.project_owner_advances
  FOR EACH ROW EXECUTE FUNCTION private.c1_finance_audit_row();
ALTER TABLE public.project_owner_advances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_owner_advances FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.project_owner_advances FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.project_owner_advances TO authenticated;
CREATE POLICY c1_finance_read ON public.project_owner_advances
  FOR SELECT TO authenticated
  USING (private.c1_can_read_project_cost(tenant_id, company_id));

CREATE TRIGGER a_c1_finance_prepare BEFORE INSERT OR UPDATE OR DELETE ON public.project_subcontracts
  FOR EACH ROW EXECUTE FUNCTION private.c1_finance_prepare_row();
CREATE TRIGGER z_c1_finance_audit AFTER INSERT OR UPDATE ON public.project_subcontracts
  FOR EACH ROW EXECUTE FUNCTION private.c1_finance_audit_row();
ALTER TABLE public.project_subcontracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_subcontracts FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.project_subcontracts FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.project_subcontracts TO authenticated;
CREATE POLICY c1_finance_read ON public.project_subcontracts
  FOR SELECT TO authenticated
  USING (private.c1_can_read_project_cost(tenant_id, company_id));

CREATE TRIGGER a_c1_finance_prepare BEFORE INSERT OR UPDATE OR DELETE ON public.project_subcontract_payments
  FOR EACH ROW EXECUTE FUNCTION private.c1_finance_prepare_row();
CREATE TRIGGER z_c1_finance_audit AFTER INSERT OR UPDATE ON public.project_subcontract_payments
  FOR EACH ROW EXECUTE FUNCTION private.c1_finance_audit_row();
ALTER TABLE public.project_subcontract_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_subcontract_payments FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.project_subcontract_payments FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.project_subcontract_payments TO authenticated;
CREATE POLICY c1_finance_read ON public.project_subcontract_payments
  FOR SELECT TO authenticated
  USING (private.c1_can_read_project_cost(tenant_id, company_id));

CREATE TRIGGER b_c1_finance_budget BEFORE INSERT OR UPDATE ON public.project_budget_versions
  FOR EACH ROW EXECUTE FUNCTION private.c1_finance_guard_budget();
CREATE TRIGGER b_c1_finance_budget_line BEFORE INSERT OR UPDATE ON public.project_budget_lines
  FOR EACH ROW EXECUTE FUNCTION private.c1_finance_guard_budget_line();
CREATE TRIGGER b_c1_finance_owner_money BEFORE INSERT OR UPDATE ON public.project_owner_advances
  FOR EACH ROW EXECUTE FUNCTION private.c1_finance_guard_recorded_money();
CREATE TRIGGER b_c1_finance_payment_money BEFORE INSERT OR UPDATE ON public.project_subcontract_payments
  FOR EACH ROW EXECUTE FUNCTION private.c1_finance_guard_recorded_money();
CREATE TRIGGER b_c1_finance_subcontract BEFORE UPDATE ON public.project_subcontracts
  FOR EACH ROW EXECUTE FUNCTION private.c1_finance_guard_subcontract();

-- No new financial data is inserted. Existing item/detail totals and source rows
-- are untouched. Retain work_status until the separate reviewed retirement step.
NOTIFY pgrst, 'reload schema';
