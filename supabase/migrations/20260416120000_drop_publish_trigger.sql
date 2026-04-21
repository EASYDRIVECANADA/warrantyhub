-- Migration: 20260416120000_drop_publish_trigger.sql
-- Purpose: Remove the legacy trigger that blocks V2 products from being published.
--
-- The trigger checks the OLD product_pricing table for rows, which is empty for
-- all V2 products (which use pricing_json instead). This causes every publish
-- attempt to fail with "no pricing rows exist".
--
-- Safe to run: DROP IF EXISTS will not error if already removed.

DROP TRIGGER IF EXISTS trg_products_require_default_pricing_on_publish ON public.products;
DROP FUNCTION IF EXISTS public.products_require_default_pricing_on_publish();
