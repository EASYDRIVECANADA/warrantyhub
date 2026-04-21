-- =============================================================================
-- Migration: 20260414120000_products_v2_fixes.sql  (v3 — self-contained)
-- Purpose:   Bootstrap all V2 tables, helper functions, columns, and RLS so
--            the app works end-to-end without requiring the earlier
--            bridge_rebuild migration to have been applied first.
-- Safe to re-run: every statement uses IF NOT EXISTS / OR REPLACE / DROP IF EXISTS.
-- =============================================================================

-- ── A. V2 role infrastructure ─────────────────────────────────────────────────

-- Role enum (create once; ignore if already exists)
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM (
    'super_admin', 'dealership_admin', 'dealership_employee', 'provider'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- user_roles table (maps auth users → V2 roles)
CREATE TABLE IF NOT EXISTS public.user_roles (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role       public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_roles_self_read" ON public.user_roles;
CREATE POLICY "user_roles_self_read" ON public.user_roles
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- ── B. V2 entity tables ───────────────────────────────────────────────────────

-- dealerships
CREATE TABLE IF NOT EXISTS public.dealerships (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT NOT NULL,
  phone            TEXT,
  address          TEXT,
  province         TEXT,
  license_number   TEXT,
  admin_code       TEXT NOT NULL DEFAULT substr(md5(random()::text), 1, 8),
  compliance_info  JSONB DEFAULT '{}',
  status           TEXT NOT NULL DEFAULT 'approved'
                   CHECK (status IN ('pending', 'approved', 'suspended')),
  legacy_dealer_id UUID UNIQUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.dealerships ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "dealerships_read_authenticated" ON public.dealerships;
CREATE POLICY "dealerships_read_authenticated" ON public.dealerships
  FOR SELECT TO authenticated USING (true);

-- dealership_members
CREATE TABLE IF NOT EXISTS public.dealership_members (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  dealership_id  UUID NOT NULL REFERENCES public.dealerships(id) ON DELETE CASCADE,
  role           TEXT NOT NULL DEFAULT 'employee' CHECK (role IN ('admin', 'employee')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, dealership_id)
);
ALTER TABLE public.dealership_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "dealership_members_self_read" ON public.dealership_members;
CREATE POLICY "dealership_members_self_read" ON public.dealership_members
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- providers
CREATE TABLE IF NOT EXISTS public.providers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name    TEXT NOT NULL,
  contact_email   TEXT,
  contact_phone   TEXT,
  address         TEXT,
  regions_served  TEXT[] DEFAULT '{"Ontario"}',
  description     TEXT,
  logo_url        TEXT,
  status          TEXT NOT NULL DEFAULT 'approved'
                  CHECK (status IN ('pending', 'approved', 'suspended')),
  legacy_profile_id UUID UNIQUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.providers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "providers_read_authenticated" ON public.providers;
CREATE POLICY "providers_read_authenticated" ON public.providers
  FOR SELECT TO authenticated USING (true);

-- provider_members
CREATE TABLE IF NOT EXISTS public.provider_members (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider_id UUID NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  role        TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider_id)
);
ALTER TABLE public.provider_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "provider_members_self_read" ON public.provider_members;
CREATE POLICY "provider_members_self_read" ON public.provider_members
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- ── C. Helper functions ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
  RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public
  AS $$
    SELECT EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = _user_id AND role = _role
    );
  $$;

CREATE OR REPLACE FUNCTION public.is_dealership_member(_user_id UUID, _dealership_id UUID)
  RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public
  AS $$
    SELECT EXISTS (
      SELECT 1 FROM public.dealership_members
      WHERE user_id = _user_id AND dealership_id = _dealership_id
    );
  $$;

CREATE OR REPLACE FUNCTION public.is_provider_member(_user_id UUID, _provider_id UUID)
  RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public
  AS $$
    SELECT CASE
      WHEN _provider_id IS NULL THEN FALSE
      ELSE EXISTS (
        SELECT 1 FROM public.provider_members
        WHERE user_id = _user_id AND provider_id = _provider_id
      )
    END;
  $$;

-- ── D. Backfill user_roles from profiles.role (existing users) ───────────────
-- Only runs if profiles table has a role column (legacy schema).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'role'
  ) THEN
    INSERT INTO public.user_roles (user_id, role)
    SELECT id,
      CASE lower(role)
        WHEN 'super_admin'    THEN 'super_admin'::public.app_role
        WHEN 'admin'          THEN 'super_admin'::public.app_role
        WHEN 'dealer_admin'   THEN 'dealership_admin'::public.app_role
        WHEN 'dealer'         THEN 'dealership_admin'::public.app_role
        WHEN 'dealer_employee'THEN 'dealership_employee'::public.app_role
        WHEN 'provider'       THEN 'provider'::public.app_role
        ELSE NULL
      END
    FROM public.profiles
    WHERE lower(role) IN (
      'super_admin','admin','dealer_admin','dealer','dealer_employee','provider'
    )
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- ── E. Backfill dealerships from dealers (existing dealers) ──────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'dealers'
  ) THEN
    INSERT INTO public.dealerships (name, legacy_dealer_id, status, created_at)
    SELECT name, id, 'approved', created_at
    FROM public.dealers
    ON CONFLICT (legacy_dealer_id) DO NOTHING;
  END IF;
END $$;

-- Backfill dealership_members from dealer_members
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'dealer_members'
  ) THEN
    INSERT INTO public.dealership_members (user_id, dealership_id, role, created_at)
    SELECT dm.user_id, d.id,
      CASE WHEN upper(dm.role::text) LIKE '%ADMIN%' THEN 'admin' ELSE 'employee' END,
      dm.created_at
    FROM public.dealer_members dm
    JOIN public.dealerships d ON d.legacy_dealer_id = dm.dealer_id
    ON CONFLICT (user_id, dealership_id) DO NOTHING;
  END IF;
END $$;

-- ── F. Backfill providers from profiles WHERE role = 'PROVIDER' ──────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'role'
  ) THEN
    INSERT INTO public.providers (company_name, contact_email, logo_url, legacy_profile_id, status, created_at)
    SELECT
      COALESCE(company_name, display_name, email, 'Unknown Provider'),
      email,
      CASE WHEN EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='profiles' AND column_name='provider_logo_url'
      ) THEN provider_logo_url ELSE NULL END,
      id,
      'approved',
      created_at
    FROM public.profiles
    WHERE lower(role) = 'provider'
    ON CONFLICT (legacy_profile_id) DO NOTHING;

    INSERT INTO public.provider_members (user_id, provider_id, role, created_at)
    SELECT p.id, pr.id, 'admin', p.created_at
    FROM public.profiles p
    JOIN public.providers pr ON pr.legacy_profile_id = p.id
    WHERE lower(p.role) = 'provider'
    ON CONFLICT (user_id, provider_id) DO NOTHING;
  END IF;
END $$;

-- ── G. Add missing V2 columns to products ────────────────────────────────────

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS provider_entity_id    UUID,
  ADD COLUMN IF NOT EXISTS pricing_json          JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS eligibility_rules     JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS coverage_details_json JSONB DEFAULT '{}';

-- Wire provider_entity_id FK now that providers table exists
DO $$
BEGIN
  ALTER TABLE public.products
    ADD CONSTRAINT products_provider_entity_id_fkey
    FOREIGN KEY (provider_entity_id) REFERENCES public.providers(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Backfill provider_entity_id from legacy provider_id via providers.legacy_profile_id
UPDATE public.products p
  SET provider_entity_id = pr.id
  FROM public.providers pr
  WHERE pr.legacy_profile_id = p.provider_id
    AND p.provider_entity_id IS NULL;

-- ── H. Widen product_type constraint ─────────────────────────────────────────

DO $$
BEGIN
  ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_product_type_check;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

ALTER TABLE public.products
  ADD CONSTRAINT products_product_type_check
  CHECK (product_type IN (
    'EXTENDED_WARRANTY', 'GAP', 'TIRE_RIM', 'APPEARANCE', 'OTHER',
    'VSC', 'Tire & Rim', 'PPF', 'Ceramic Coating',
    'Undercoating', 'Key Replacement', 'Dent Repair'
  ));

-- Normalise legacy types for V2 products
UPDATE public.products
  SET product_type = 'VSC'
  WHERE product_type = 'EXTENDED_WARRANTY' AND provider_entity_id IS NOT NULL;

UPDATE public.products
  SET product_type = 'Tire & Rim'
  WHERE product_type = 'TIRE_RIM' AND provider_entity_id IS NOT NULL;

-- ── I. Products RLS ───────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "products_provider_v2_own"       ON public.products;
DROP POLICY IF EXISTS "products_super_admin"            ON public.products;
DROP POLICY IF EXISTS "products_select_published_any"  ON public.products;

CREATE POLICY "products_provider_v2_own" ON public.products
  FOR ALL TO authenticated
  USING  (public.is_provider_member(auth.uid(), provider_entity_id))
  WITH CHECK (public.is_provider_member(auth.uid(), provider_entity_id));

CREATE POLICY "products_super_admin" ON public.products
  FOR ALL TO authenticated
  USING  (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "products_select_published_any" ON public.products
  FOR SELECT TO authenticated
  USING (published = true);

-- ── J. Add missing V2 columns to contracts ───────────────────────────────────

ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS dealership_id       UUID,
  ADD COLUMN IF NOT EXISTS provider_entity_id  UUID,
  ADD COLUMN IF NOT EXISTS contract_price      NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS dealer_cost_dollars NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS customer_first_name TEXT,
  ADD COLUMN IF NOT EXISTS customer_last_name  TEXT,
  ADD COLUMN IF NOT EXISTS vehicle_year        INTEGER,
  ADD COLUMN IF NOT EXISTS vehicle_make        TEXT,
  ADD COLUMN IF NOT EXISTS vehicle_model       TEXT,
  ADD COLUMN IF NOT EXISTS vin                 TEXT,
  ADD COLUMN IF NOT EXISTS product_id          UUID,
  ADD COLUMN IF NOT EXISTS status_new          TEXT;

-- Add status_new CHECK constraint (safe if already exists)
DO $$
BEGIN
  ALTER TABLE public.contracts
    ADD CONSTRAINT contracts_status_new_check
    CHECK (status_new IN ('draft','submitted','active','cancelled','expired'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Backfill dealership_id from dealer_id (only if dealer_id column exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'contracts' AND column_name = 'dealer_id'
  ) THEN
    UPDATE public.contracts c
      SET dealership_id = d.id
      FROM public.dealerships d
      WHERE d.legacy_dealer_id = c.dealer_id
        AND c.dealership_id IS NULL;
  END IF;
END $$;

-- Backfill status_new from legacy status (only if status column exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'contracts' AND column_name = 'status'
  ) THEN
    UPDATE public.contracts
      SET status_new = CASE status
        WHEN 'DRAFT'    THEN 'draft'
        WHEN 'SOLD'     THEN 'submitted'
        WHEN 'REMITTED' THEN 'active'
        WHEN 'PAID'     THEN 'active'
        ELSE 'draft'
      END
      WHERE status_new IS NULL AND status IS NOT NULL;
  END IF;
END $$;

-- ── K. Contracts RLS ──────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "contracts_dealership_member_v2" ON public.contracts;
DROP POLICY IF EXISTS "contracts_provider_member_v2"   ON public.contracts;
DROP POLICY IF EXISTS "contracts_super_admin_v2"       ON public.contracts;

CREATE POLICY "contracts_dealership_member_v2" ON public.contracts
  FOR ALL TO authenticated
  USING  (public.is_dealership_member(auth.uid(), dealership_id))
  WITH CHECK (public.is_dealership_member(auth.uid(), dealership_id));

CREATE POLICY "contracts_provider_member_v2" ON public.contracts
  FOR SELECT TO authenticated
  USING (public.is_provider_member(auth.uid(), provider_entity_id));

CREATE POLICY "contracts_super_admin_v2" ON public.contracts
  FOR ALL TO authenticated
  USING  (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- ── L. Remittances table + RLS ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.remittances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid()
);

-- Patch any columns that may be missing (handles partial prior creates)
ALTER TABLE public.remittances
  ADD COLUMN IF NOT EXISTS contract_id UUID,
  ADD COLUMN IF NOT EXISTS amount      NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS status      TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS due_date    DATE,
  ADD COLUMN IF NOT EXISTS paid_date   DATE,
  ADD COLUMN IF NOT EXISTS created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at  TIMESTAMPTZ NOT NULL DEFAULT now();

-- Add FK on contract_id if not already present
DO $$
BEGIN
  ALTER TABLE public.remittances
    ADD CONSTRAINT remittances_contract_id_fkey
    FOREIGN KEY (contract_id) REFERENCES public.contracts(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Add status CHECK if not already present
DO $$
BEGIN
  ALTER TABLE public.remittances
    ADD CONSTRAINT remittances_status_check
    CHECK (status IN ('pending','submitted','paid','overdue'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.remittances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "remittances_dealership_view"   ON public.remittances;
DROP POLICY IF EXISTS "remittances_dealership_insert" ON public.remittances;
DROP POLICY IF EXISTS "remittances_provider_view"     ON public.remittances;
DROP POLICY IF EXISTS "remittances_super_admin"       ON public.remittances;

CREATE POLICY "remittances_dealership_view" ON public.remittances
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.contracts c
    WHERE c.id = contract_id
      AND public.is_dealership_member(auth.uid(), c.dealership_id)
  ));

CREATE POLICY "remittances_dealership_insert" ON public.remittances
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.contracts c
    WHERE c.id = contract_id
      AND public.is_dealership_member(auth.uid(), c.dealership_id)
  ));

CREATE POLICY "remittances_provider_view" ON public.remittances
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.contracts c
    WHERE c.id = contract_id
      AND public.is_provider_member(auth.uid(), c.provider_entity_id)
  ));

CREATE POLICY "remittances_super_admin" ON public.remittances
  FOR ALL TO authenticated
  USING  (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- ── M. dealership_product_pricing table ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.dealership_product_pricing (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dealership_id           UUID NOT NULL REFERENCES public.dealerships(id) ON DELETE CASCADE,
  product_id              UUID NOT NULL REFERENCES public.products(id)    ON DELETE CASCADE,
  retail_price            JSONB NOT NULL DEFAULT '{}',
  confidentiality_enabled BOOLEAN NOT NULL DEFAULT false,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (dealership_id, product_id)
);

ALTER TABLE public.dealership_product_pricing ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dpp_dealership_own"  ON public.dealership_product_pricing;
DROP POLICY IF EXISTS "dpp_super_admin"     ON public.dealership_product_pricing;

CREATE POLICY "dpp_dealership_own" ON public.dealership_product_pricing
  FOR ALL TO authenticated
  USING  (public.is_dealership_member(auth.uid(), dealership_id))
  WITH CHECK (public.is_dealership_member(auth.uid(), dealership_id));

CREATE POLICY "dpp_super_admin" ON public.dealership_product_pricing
  FOR ALL TO authenticated
  USING  (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
