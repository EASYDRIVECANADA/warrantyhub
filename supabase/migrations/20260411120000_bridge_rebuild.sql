-- =============================================================================
-- Phase 1: Bridge Rebuild — Additive Migration
-- =============================================================================
-- This migration adds the new prototype schema alongside the existing tables.
-- Nothing is dropped or renamed. Existing tables, columns, and RLS policies
-- remain fully functional. A follow-up destructive migration (Phase 7) will
-- remove the old world after the new app code is verified in production.
--
-- New tables:  user_roles, dealerships, dealership_members, providers,
--              provider_members, contract_remittances, dealership_product_pricing
-- Altered:     products (3 new JSONB columns + provider_entity_id)
--              contracts (bridging columns for new schema)
-- New fns:     has_role, is_dealership_member, is_provider_member,
--              update_updated_at_column (if not exists)
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1.1  Role enum + user_roles table
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM (
    'super_admin',
    'dealership_admin',
    'dealership_employee',
    'provider'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 1.2  Backfill user_roles from profiles.role
-- ---------------------------------------------------------------------------
INSERT INTO public.user_roles (user_id, role)
SELECT id,
  CASE upper(role)
    WHEN 'SUPER_ADMIN' THEN 'super_admin'::app_role
    WHEN 'ADMIN'        THEN 'super_admin'::app_role
    WHEN 'DEALER_ADMIN' THEN 'dealership_admin'::app_role
    WHEN 'DEALER'       THEN 'dealership_admin'::app_role
    WHEN 'DEALER_EMPLOYEE' THEN 'dealership_employee'::app_role
    WHEN 'PROVIDER'     THEN 'provider'::app_role
  END
FROM public.profiles
WHERE upper(role) IN ('SUPER_ADMIN','ADMIN','DEALER_ADMIN','DEALER','DEALER_EMPLOYEE','PROVIDER')
ON CONFLICT (user_id, role) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 1.3  Helper functions (security definer to prevent RLS recursion)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.is_dealership_member(_user_id UUID, _dealership_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.dealership_members
    WHERE user_id = _user_id AND dealership_id = _dealership_id
  )
$$;

CREATE OR REPLACE FUNCTION public.is_provider_member(_user_id UUID, _provider_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.provider_members
    WHERE user_id = _user_id AND provider_id = _provider_id
  )
$$;

-- Generic updated_at trigger function (may already exist from prototype)
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- ---------------------------------------------------------------------------
-- 1.4  dealerships — new table, populated from existing dealers
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.dealerships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  province TEXT,
  license_number TEXT,
  admin_code TEXT NOT NULL DEFAULT substr(md5(random()::text), 1, 8),
  compliance_info JSONB DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'approved'
    CHECK (status IN ('pending', 'approved', 'suspended')),
  -- Stripe subscription columns carried over from dealers
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  subscription_status TEXT,
  subscription_plan_key TEXT,
  subscription_price_id TEXT,
  subscription_trial_end TIMESTAMPTZ,
  subscription_current_period_end TIMESTAMPTZ,
  subscription_cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
  subscription_seats_limit INTEGER,
  contract_fee_cents INTEGER,
  -- Bridge column to old dealers table
  legacy_dealer_id UUID UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.dealerships ENABLE ROW LEVEL SECURITY;

-- Backfill from existing dealers
INSERT INTO public.dealerships (
  name, legacy_dealer_id, status,
  stripe_customer_id, stripe_subscription_id,
  subscription_status, subscription_plan_key, subscription_price_id,
  subscription_trial_end, subscription_current_period_end,
  subscription_cancel_at_period_end, subscription_seats_limit,
  contract_fee_cents
)
SELECT
  d.name,
  d.id,
  'approved',
  d.stripe_customer_id,
  d.stripe_subscription_id,
  d.subscription_status,
  d.subscription_plan_key,
  d.subscription_price_id,
  d.subscription_trial_end,
  d.subscription_current_period_end,
  COALESCE(d.subscription_cancel_at_period_end, false),
  d.subscription_seats_limit,
  d.contract_fee_cents
FROM public.dealers d
ON CONFLICT (legacy_dealer_id) DO NOTHING;

-- updated_at trigger
DROP TRIGGER IF EXISTS update_dealerships_updated_at ON public.dealerships;
CREATE TRIGGER update_dealerships_updated_at
  BEFORE UPDATE ON public.dealerships
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 1.5  dealership_members — copy from dealer_members
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.dealership_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  dealership_id UUID NOT NULL REFERENCES public.dealerships(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'employee'
    CHECK (role IN ('admin', 'employee')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, dealership_id)
);
ALTER TABLE public.dealership_members ENABLE ROW LEVEL SECURITY;

-- Backfill from existing dealer_members
INSERT INTO public.dealership_members (user_id, dealership_id, role)
SELECT
  dm.user_id,
  ds.id,
  CASE
    WHEN dm.role IN ('DEALER_ADMIN', 'DEALER') THEN 'admin'
    ELSE 'employee'
  END
FROM public.dealer_members dm
JOIN public.dealerships ds ON ds.legacy_dealer_id = dm.dealer_id
WHERE dm.status = 'ACTIVE'
ON CONFLICT (user_id, dealership_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 1.6  providers — new entity table (currently providers live on profiles)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name TEXT NOT NULL,
  contact_email TEXT,
  contact_phone TEXT,
  address TEXT,
  regions_served TEXT[] DEFAULT '{"Ontario"}',
  description TEXT,
  logo_url TEXT,
  status TEXT NOT NULL DEFAULT 'approved'
    CHECK (status IN ('pending', 'approved', 'suspended')),
  legacy_profile_id UUID UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.providers ENABLE ROW LEVEL SECURITY;

-- Backfill from profiles where role = PROVIDER
INSERT INTO public.providers (
  company_name, contact_email, logo_url, legacy_profile_id, status
)
SELECT
  COALESCE(company_name, display_name, email, 'Unknown Provider'),
  email,
  provider_logo_url,
  id,
  'approved'
FROM public.profiles
WHERE upper(role) = 'PROVIDER'
ON CONFLICT (legacy_profile_id) DO NOTHING;

-- updated_at trigger
DROP TRIGGER IF EXISTS update_providers_updated_at ON public.providers;
CREATE TRIGGER update_providers_updated_at
  BEFORE UPDATE ON public.providers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- provider_members
CREATE TABLE IF NOT EXISTS public.provider_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider_id UUID NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member'
    CHECK (role IN ('admin', 'member')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider_id)
);
ALTER TABLE public.provider_members ENABLE ROW LEVEL SECURITY;

-- Backfill: each provider profile becomes an admin member of its own provider entity
INSERT INTO public.provider_members (user_id, provider_id, role)
SELECT p.id, pr.id, 'admin'
FROM public.profiles p
JOIN public.providers pr ON pr.legacy_profile_id = p.id
WHERE upper(p.role) = 'PROVIDER'
ON CONFLICT (user_id, provider_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 1.7  products — add bridging columns (keep existing table intact)
-- ---------------------------------------------------------------------------
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS provider_entity_id UUID REFERENCES public.providers(id);

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS pricing_json JSONB DEFAULT '{}';

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS eligibility_rules JSONB DEFAULT '{}';

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS coverage_details_json JSONB DEFAULT '{}';

-- Bridge: link products to the new providers table via the legacy profile id
UPDATE public.products SET provider_entity_id = pr.id
FROM public.providers pr
WHERE pr.legacy_profile_id = products.provider_id
  AND products.provider_entity_id IS NULL;

-- updated_at trigger (products already has updated_at column)
DROP TRIGGER IF EXISTS update_products_updated_at ON public.products;
CREATE TRIGGER update_products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 1.8  Collapse product_pricing + product_addons into products.pricing_json
-- ---------------------------------------------------------------------------
UPDATE public.products p SET pricing_json = jsonb_build_object(
  'tiers',  COALESCE(
    (SELECT jsonb_agg(jsonb_build_object(
      'id', pp.id,
      'term_months', pp.term_months,
      'term_km', pp.term_km,
      'vehicle_mileage_min_km', pp.vehicle_mileage_min_km,
      'vehicle_mileage_max_km', pp.vehicle_mileage_max_km,
      'vehicle_class', pp.vehicle_class,
      'deductible_cents', pp.deductible_cents,
      'base_price_cents', pp.base_price_cents,
      'dealer_cost_cents', pp.dealer_cost_cents,
      'claim_limit_cents', pp.claim_limit_cents,
      'claim_limit_type', pp.claim_limit_type,
      'claim_limit_amount_cents', pp.claim_limit_amount_cents,
      'is_default', pp.is_default
    )) FROM public.product_pricing pp WHERE pp.product_id = p.id),
    '[]'::jsonb
  ),
  'addons', COALESCE(
    (SELECT jsonb_agg(jsonb_build_object(
      'id', pa.id,
      'name', pa.name,
      'description', pa.description,
      'pricing_type', pa.pricing_type,
      'base_price_cents', pa.base_price_cents,
      'min_price_cents', pa.min_price_cents,
      'max_price_cents', pa.max_price_cents,
      'dealer_cost_cents', pa.dealer_cost_cents,
      'active', pa.active
    )) FROM public.product_addons pa WHERE pa.product_id = p.id),
    '[]'::jsonb
  )
)
WHERE p.pricing_json = '{}'::jsonb OR p.pricing_json IS NULL;

-- ---------------------------------------------------------------------------
-- 1.9  contracts — add bridging columns (dollars + new status + dealership FK)
-- ---------------------------------------------------------------------------
ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS dealership_id UUID REFERENCES public.dealerships(id);

ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS contract_price NUMERIC(10,2);

ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS dealer_cost_dollars NUMERIC(10,2);

ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS customer_first_name TEXT;

ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS customer_last_name TEXT;

ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS status_new TEXT
    CHECK (status_new IN ('draft', 'submitted', 'active', 'cancelled', 'expired'));

ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS provider_entity_id UUID REFERENCES public.providers(id);

ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS start_date DATE;

ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS end_date DATE;

-- updated_at trigger for contracts
DROP TRIGGER IF EXISTS update_contracts_updated_at ON public.contracts;
CREATE TRIGGER update_contracts_updated_at
  BEFORE UPDATE ON public.contracts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Backfill bridging columns
UPDATE public.contracts SET
  dealership_id = ds.id
FROM public.dealerships ds
WHERE ds.legacy_dealer_id = contracts.dealer_id
  AND contracts.dealership_id IS NULL;

UPDATE public.contracts SET
  provider_entity_id = pr.id
FROM public.providers pr
WHERE pr.legacy_profile_id = contracts.provider_id
  AND contracts.provider_entity_id IS NULL;

UPDATE public.contracts SET
  contract_price = (pricing_base_price_cents::NUMERIC / 100),
  dealer_cost_dollars = (pricing_dealer_cost_cents::NUMERIC / 100)
WHERE contract_price IS NULL
  AND pricing_base_price_cents IS NOT NULL;

UPDATE public.contracts SET
  customer_first_name = split_part(customer_name, ' ', 1),
  customer_last_name  = NULLIF(regexp_replace(customer_name, '^\S+\s*', '', ''), '')
WHERE customer_first_name IS NULL
  AND customer_name IS NOT NULL;

UPDATE public.contracts SET
  status_new = CASE upper(status)
    WHEN 'DRAFT'    THEN 'draft'
    WHEN 'SOLD'     THEN 'submitted'
    WHEN 'REMITTED' THEN 'active'
    WHEN 'PAID'     THEN 'active'
    ELSE 'draft'
  END
WHERE status_new IS NULL;

-- ---------------------------------------------------------------------------
-- 1.10  contract_remittances — new per-contract remittance model
--        (named differently to avoid collision with existing `remittances` table)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.contract_remittances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  amount NUMERIC(10,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'paid', 'overdue')),
  due_date DATE NOT NULL,
  paid_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.contract_remittances ENABLE ROW LEVEL SECURITY;

-- Backfill from contracts that have pricing data
INSERT INTO public.contract_remittances (contract_id, amount, status, due_date, paid_date)
SELECT
  c.id,
  (c.pricing_dealer_cost_cents::NUMERIC / 100),
  CASE WHEN c.paid_at IS NOT NULL THEN 'paid' ELSE 'pending' END,
  COALESCE(c.sold_at::date, c.created_at::date),
  c.paid_at::date
FROM public.contracts c
WHERE c.pricing_dealer_cost_cents IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.contract_remittances cr WHERE cr.contract_id = c.id
  );

-- updated_at trigger
DROP TRIGGER IF EXISTS update_contract_remittances_updated_at ON public.contract_remittances;
CREATE TRIGGER update_contract_remittances_updated_at
  BEFORE UPDATE ON public.contract_remittances
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 1.11  dealership_product_pricing — retail price overlays
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.dealership_product_pricing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dealership_id UUID NOT NULL REFERENCES public.dealerships(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  retail_price JSONB NOT NULL DEFAULT '{}',
  confidentiality_enabled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (dealership_id, product_id)
);
ALTER TABLE public.dealership_product_pricing ENABLE ROW LEVEL SECURITY;

-- updated_at trigger
DROP TRIGGER IF EXISTS update_dealership_product_pricing_updated_at ON public.dealership_product_pricing;
CREATE TRIGGER update_dealership_product_pricing_updated_at
  BEFORE UPDATE ON public.dealership_product_pricing
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ==========================================================================
-- RLS POLICIES for new tables
-- ==========================================================================

-- ---- user_roles ----
DROP POLICY IF EXISTS "Users can view own roles" ON public.user_roles;
CREATE POLICY "Users can view own roles"
  ON public.user_roles FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Super admins can manage roles" ON public.user_roles;
CREATE POLICY "Super admins can manage roles"
  ON public.user_roles FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'));

-- ---- dealerships ----
DROP POLICY IF EXISTS "Members can view their dealership" ON public.dealerships;
CREATE POLICY "Members can view their dealership"
  ON public.dealerships FOR SELECT
  USING (public.is_dealership_member(auth.uid(), id));

DROP POLICY IF EXISTS "Super admins can view all dealerships" ON public.dealerships;
CREATE POLICY "Super admins can view all dealerships"
  ON public.dealerships FOR SELECT
  USING (public.has_role(auth.uid(), 'super_admin'));

DROP POLICY IF EXISTS "Super admins can manage dealerships" ON public.dealerships;
CREATE POLICY "Super admins can manage dealerships"
  ON public.dealerships FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'));

DROP POLICY IF EXISTS "Authenticated can insert dealerships" ON public.dealerships;
CREATE POLICY "Authenticated can insert dealerships"
  ON public.dealerships FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Dealership admins can update their dealership" ON public.dealerships;
CREATE POLICY "Dealership admins can update their dealership"
  ON public.dealerships FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.dealership_members
      WHERE user_id = auth.uid()
        AND dealership_id = dealerships.id
        AND role = 'admin'
    )
  );

-- ---- dealership_members ----
DROP POLICY IF EXISTS "Members can view their dealership members" ON public.dealership_members;
CREATE POLICY "Members can view their dealership members"
  ON public.dealership_members FOR SELECT
  USING (public.is_dealership_member(auth.uid(), dealership_id));

DROP POLICY IF EXISTS "Authenticated can insert dealership members" ON public.dealership_members;
CREATE POLICY "Authenticated can insert dealership members"
  ON public.dealership_members FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Super admins can manage dealership members" ON public.dealership_members;
CREATE POLICY "Super admins can manage dealership members"
  ON public.dealership_members FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'));

-- ---- providers ----
DROP POLICY IF EXISTS "Public can view approved providers" ON public.providers;
CREATE POLICY "Public can view approved providers"
  ON public.providers FOR SELECT
  USING (status = 'approved');

DROP POLICY IF EXISTS "Provider members can view own" ON public.providers;
CREATE POLICY "Provider members can view own"
  ON public.providers FOR SELECT
  USING (public.is_provider_member(auth.uid(), id));

DROP POLICY IF EXISTS "Super admins can manage providers" ON public.providers;
CREATE POLICY "Super admins can manage providers"
  ON public.providers FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'));

DROP POLICY IF EXISTS "Authenticated can insert providers" ON public.providers;
CREATE POLICY "Authenticated can insert providers"
  ON public.providers FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Provider admins can update own" ON public.providers;
CREATE POLICY "Provider admins can update own"
  ON public.providers FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.provider_members
      WHERE user_id = auth.uid()
        AND provider_id = providers.id
        AND role = 'admin'
    )
  );

-- ---- provider_members ----
DROP POLICY IF EXISTS "Members can view provider members" ON public.provider_members;
CREATE POLICY "Members can view provider members"
  ON public.provider_members FOR SELECT
  USING (public.is_provider_member(auth.uid(), provider_id));

DROP POLICY IF EXISTS "Authenticated can insert provider members" ON public.provider_members;
CREATE POLICY "Authenticated can insert provider members"
  ON public.provider_members FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Super admins can manage provider members" ON public.provider_members;
CREATE POLICY "Super admins can manage provider members"
  ON public.provider_members FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'));

-- ---- contract_remittances ----
DROP POLICY IF EXISTS "Contract parties can view remittances" ON public.contract_remittances;
CREATE POLICY "Contract parties can view remittances"
  ON public.contract_remittances FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.contracts c
      WHERE c.id = contract_id
      AND (
        public.is_dealership_member(auth.uid(), c.dealership_id)
        OR public.is_provider_member(auth.uid(), c.provider_entity_id)
      )
    )
  );

DROP POLICY IF EXISTS "Dealership members can create remittances" ON public.contract_remittances;
CREATE POLICY "Dealership members can create remittances"
  ON public.contract_remittances FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.contracts c
      WHERE c.id = contract_remittances.contract_id
      AND public.is_dealership_member(auth.uid(), c.dealership_id)
    )
  );

DROP POLICY IF EXISTS "Dealership members can update remittances" ON public.contract_remittances;
CREATE POLICY "Dealership members can update remittances"
  ON public.contract_remittances FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.contracts c
      WHERE c.id = contract_remittances.contract_id
      AND public.is_dealership_member(auth.uid(), c.dealership_id)
    )
  );

DROP POLICY IF EXISTS "Super admins can manage contract remittances" ON public.contract_remittances;
CREATE POLICY "Super admins can manage contract remittances"
  ON public.contract_remittances FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'));

-- ---- dealership_product_pricing ----
DROP POLICY IF EXISTS "Dealership members can view pricing" ON public.dealership_product_pricing;
CREATE POLICY "Dealership members can view pricing"
  ON public.dealership_product_pricing FOR SELECT
  USING (public.is_dealership_member(auth.uid(), dealership_id));

DROP POLICY IF EXISTS "Dealership admins can insert pricing" ON public.dealership_product_pricing;
CREATE POLICY "Dealership admins can insert pricing"
  ON public.dealership_product_pricing FOR INSERT
  WITH CHECK (
    public.is_dealership_member(auth.uid(), dealership_id)
    AND EXISTS (
      SELECT 1 FROM public.dealership_members
      WHERE user_id = auth.uid()
        AND dealership_id = dealership_product_pricing.dealership_id
        AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Dealership admins can update pricing" ON public.dealership_product_pricing;
CREATE POLICY "Dealership admins can update pricing"
  ON public.dealership_product_pricing FOR UPDATE
  USING (
    public.is_dealership_member(auth.uid(), dealership_id)
    AND EXISTS (
      SELECT 1 FROM public.dealership_members
      WHERE user_id = auth.uid()
        AND dealership_id = dealership_product_pricing.dealership_id
        AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Super admins can manage pricing" ON public.dealership_product_pricing;
CREATE POLICY "Super admins can manage pricing"
  ON public.dealership_product_pricing FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'));

COMMIT;
