-- Infinite Auto Care - PPF provider and product seed.
-- Source: BridgeWarranty PPF product screenshot supplied May 2026.
--
-- Safe to re-run: provider rows are upserted and Infinite Auto Care products are refreshed.

DO $$
DECLARE
  v_eid CONSTANT uuid := 'a046b4d6-e40b-450b-922e-827b963b0dd2';
  v_company_id CONSTANT uuid := '1aabd3ec-a373-4cfd-be47-ccb69132fccf';
  v_pid uuid;
BEGIN
  INSERT INTO public.provider_companies (
    id,
    provider_company_name,
    legal_business_name,
    business_type,
    contact_email,
    status,
    notes
  )
  VALUES (
    v_company_id,
    'Infinite Auto Care',
    'Infinite Auto Care',
    'WARRANTY_PROVIDER',
    'not-provided@infiniteautocare.local',
    'ACTIVE',
    'Seeded from BridgeWarranty PPF product screenshot. Email was not provided; local fallback email used to satisfy provider_companies.contact_email.'
  )
  ON CONFLICT (id) DO UPDATE SET
    provider_company_name = excluded.provider_company_name,
    legal_business_name = excluded.legal_business_name,
    business_type = excluded.business_type,
    contact_email = excluded.contact_email,
    status = excluded.status,
    notes = excluded.notes,
    updated_at = now();

  SELECT user_id INTO v_pid
  FROM public.provider_members
  WHERE provider_id = v_eid
  LIMIT 1;

  IF v_pid IS NULL THEN
    SELECT legacy_profile_id INTO v_pid
    FROM public.providers
    WHERE id = v_eid
    LIMIT 1;
  END IF;

  IF v_pid IS NULL THEN
    SELECT id INTO v_pid
    FROM public.profiles
    WHERE upper(role) = 'PROVIDER'
    ORDER BY created_at
    LIMIT 1;
  END IF;

  IF v_pid IS NULL THEN
    SELECT id INTO v_pid
    FROM public.profiles
    ORDER BY created_at
    LIMIT 1;
  END IF;

  IF v_pid IS NULL THEN
    RAISE EXCEPTION 'No profiles found - cannot insert Infinite Auto Care products';
  END IF;

  INSERT INTO public.providers (
    id,
    company_name,
    regions_served,
    description,
    status
  )
  VALUES (
    v_eid,
    'Infinite Auto Care',
    ARRAY['Canada'],
    'Service provider offering Paint Protection Film packages including partial front, full front, and full body coverage.',
    'approved'
  )
  ON CONFLICT (id) DO UPDATE SET
    company_name = excluded.company_name,
    regions_served = excluded.regions_served,
    description = excluded.description,
    status = excluded.status,
    updated_at = now();

  DELETE FROM public.products
  WHERE id IN (
    '219e737e-f7d0-4362-a8ea-c1d3aedf3aeb',
    'c8f4b556-8d68-4c8e-87dd-e3940edc6836',
    '6d8f5c3d-0b37-46a5-b582-8d7b0d8072bb'
  );

  INSERT INTO public.products (
    id,
    provider_entity_id,
    provider_id,
    name,
    product_type,
    coverage_details_json,
    pricing_json,
    eligibility_rules,
    published
  )
  VALUES
  (
    '219e737e-f7d0-4362-a8ea-c1d3aedf3aeb',
    v_eid,
    v_pid,
    'PPF - Partial Front',
    'PPF',
    $json$
    {
      "description": "Infinite Auto Care Paint Protection Film partial front package.",
      "categories": [
        { "name": "Coverage", "parts": ["Bumper", "Partial hood", "Partial fenders"] }
      ],
      "termsSections": [
        { "title": "Package", "content": "Bumper, partial hood, partial fenders." }
      ]
    }
    $json$::jsonb,
    $json$
    {
      "source": "BridgeWarranty PPF product screenshot supplied May 2026.",
      "rows": [
        { "label": "PPF Package", "vehicleClass": "Standard", "dealerCost": 540, "suggestedRetail": 899 }
      ]
    }
    $json$::jsonb,
    '{}'::jsonb,
    true
  ),
  (
    'c8f4b556-8d68-4c8e-87dd-e3940edc6836',
    v_eid,
    v_pid,
    'PPF - Full Front',
    'PPF',
    $json$
    {
      "description": "Infinite Auto Care Paint Protection Film full front package.",
      "categories": [
        { "name": "Coverage", "parts": ["Full bumper", "Full hood", "Full fenders", "Mirrors"] }
      ],
      "termsSections": [
        { "title": "Package", "content": "Full bumper, full hood, full fenders, mirrors." }
      ]
    }
    $json$::jsonb,
    $json$
    {
      "source": "BridgeWarranty PPF product screenshot supplied May 2026.",
      "rows": [
        { "label": "PPF Package", "vehicleClass": "Standard", "dealerCost": 1080, "suggestedRetail": 1799 }
      ]
    }
    $json$::jsonb,
    '{}'::jsonb,
    true
  ),
  (
    '6d8f5c3d-0b37-46a5-b582-8d7b0d8072bb',
    v_eid,
    v_pid,
    'PPF - Full Body',
    'PPF',
    $json$
    {
      "description": "Infinite Auto Care Paint Protection Film full body package.",
      "categories": [
        { "name": "Coverage", "parts": ["Self-healing film over the entire painted body"] }
      ],
      "termsSections": [
        { "title": "Package", "content": "Self-healing film over the entire painted body." }
      ]
    }
    $json$::jsonb,
    $json$
    {
      "source": "BridgeWarranty PPF product screenshot supplied May 2026.",
      "rows": [
        { "label": "PPF Package", "vehicleClass": "Standard", "dealerCost": 2997, "suggestedRetail": 4995 }
      ]
    }
    $json$::jsonb,
    '{}'::jsonb,
    true
  );
END $$;
