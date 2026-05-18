-- Lions Auto Protection - provider and product seed.
-- Source: Dealer Price List PDF supplied May 2026.
--
-- Safe to re-run: the provider rows are upserted and Lions products are refreshed.
-- Dealer costs are sourced from the dealer price list. Suggested retail pricing was not supplied.

DO $$
DECLARE
  v_eid CONSTANT uuid := '66654576-3669-463e-bf93-7da79de325c6';
  v_company_id CONSTANT uuid := '07a20230-f783-425c-a710-984e346b429b';
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
    'Lions Auto Protection',
    'Lions Auto Protection',
    'WARRANTY_PROVIDER',
    'not-provided@lionsautoprotection.local',
    'ACTIVE',
    'Seeded from Lions Auto Protection warranty list. Email was not provided; local placeholder used to satisfy provider_companies.contact_email.'
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
    RAISE EXCEPTION 'No profiles found - cannot insert Lions Auto Protection products';
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
    'Lions Auto Protection',
    ARRAY['Canada'],
    'Vehicle service contract provider offering 1 Star through 5 Star Auto, Electric Auto, Hybrid Auto and Top Up Auto warranty plans.',
    'approved'
  )
  ON CONFLICT (id) DO UPDATE SET
    company_name = excluded.company_name,
    regions_served = excluded.regions_served,
    description = excluded.description,
    status = excluded.status,
    updated_at = now();

  DELETE FROM public.products WHERE provider_entity_id = v_eid;

  INSERT INTO public.products (
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
    v_eid,
    v_pid,
    '1 Star Auto',
    'VSC',
    $json$
    {
      "description": "Lions Auto Protection 1 Star Auto warranty plans.",
      "categories": [
        {
          "name": "Program Summary",
          "parts": ["1 Star Auto warranty terms supplied by Lions Auto Protection.", "$1,000 claim maximum options."]
        }
      ],
      "termsSections": [
        {
          "title": "Pricing",
          "content": "Dealer costs are sourced from the supplied dealer price list. Suggested retail pricing was not supplied."
        }
      ]
    }
    $json$::jsonb,
    $json$
    {
      "source": "Dealer Price List PDF supplied May 2026. Suggested retail not supplied.",
      "rows": [
        {"label": "3 Months / 3,000 km", "vehicleClass": "$1,000 Claim Max", "claimMax": 1000, "dealerCost": 70, "suggestedRetail": "n/a", "priceStatus": "Retail not supplied"},
        {"label": "7 Months / 11,000 km", "vehicleClass": "$1,000 Claim Max", "claimMax": 1000, "dealerCost": 100, "suggestedRetail": "n/a", "priceStatus": "Retail not supplied"},
        {"label": "12 Months / 12,000 km", "vehicleClass": "$1,000 Claim Max", "claimMax": 1000, "dealerCost": 170, "suggestedRetail": "n/a", "priceStatus": "Retail not supplied"}
      ]
    }
    $json$::jsonb,
    '{}'::jsonb,
    true
  ),
  (
    v_eid,
    v_pid,
    '2 Star Auto',
    'VSC',
    $json$
    {
      "description": "Lions Auto Protection 2 Star Auto warranty plans.",
      "categories": [
        {
          "name": "Program Summary",
          "parts": ["2 Star Auto warranty terms supplied by Lions Auto Protection.", "$3,000 claim maximum options."]
        }
      ],
      "termsSections": [
        {
          "title": "Pricing",
          "content": "Dealer costs are sourced from the supplied dealer price list. Suggested retail pricing was not supplied."
        }
      ]
    }
    $json$::jsonb,
    $json$
    {
      "source": "Dealer Price List PDF supplied May 2026. Suggested retail not supplied.",
      "rows": [
        {"label": "12 Months / 20,000 km", "vehicleClass": "$3,000 Claim Max - Class 1/2/3", "claimMax": 3000, "dealerCost": 325, "suggestedRetail": "n/a", "priceStatus": "Retail not supplied"},
        {"label": "12 Months / 20,000 km", "vehicleClass": "$3,000 Claim Max - Class 4", "claimMax": 3000, "dealerCost": 725, "suggestedRetail": "n/a", "priceStatus": "Retail not supplied"},
        {"label": "24 Months / 40,000 km", "vehicleClass": "$3,000 Claim Max - Class 1/2/3", "claimMax": 3000, "dealerCost": 435, "suggestedRetail": "n/a", "priceStatus": "Retail not supplied"},
        {"label": "24 Months / 40,000 km", "vehicleClass": "$3,000 Claim Max - Class 4", "claimMax": 3000, "dealerCost": 835, "suggestedRetail": "n/a", "priceStatus": "Retail not supplied"},
        {"label": "36 Months / 60,000 km", "vehicleClass": "$3,000 Claim Max - Class 1/2/3", "claimMax": 3000, "dealerCost": 675, "suggestedRetail": "n/a", "priceStatus": "Retail not supplied"},
        {"label": "36 Months / 60,000 km", "vehicleClass": "$3,000 Claim Max - Class 4", "claimMax": 3000, "dealerCost": 1075, "suggestedRetail": "n/a", "priceStatus": "Retail not supplied"},
        {"label": "48 Months / 80,000 km", "vehicleClass": "$3,000 Claim Max - Class 1/2/3", "claimMax": 3000, "dealerCost": 800, "suggestedRetail": "n/a", "priceStatus": "Retail not supplied"},
        {"label": "48 Months / 80,000 km", "vehicleClass": "$3,000 Claim Max - Class 4", "claimMax": 3000, "dealerCost": 1200, "suggestedRetail": "n/a", "priceStatus": "Retail not supplied"},
        {"label": "Unlimited Time / 20,000 km", "vehicleClass": "$3,000 Claim Max - Class 1/2/3", "claimMax": 3000, "dealerCost": 375, "suggestedRetail": "n/a", "priceStatus": "Retail not supplied"},
        {"label": "Unlimited Time / 20,000 km", "vehicleClass": "$3,000 Claim Max - Class 4", "claimMax": 3000, "dealerCost": 775, "suggestedRetail": "n/a", "priceStatus": "Retail not supplied"},
        {"label": "Unlimited Time / 40,000 km", "vehicleClass": "$3,000 Claim Max - Class 1/2/3", "claimMax": 3000, "dealerCost": 520, "suggestedRetail": "n/a", "priceStatus": "Retail not supplied"},
        {"label": "Unlimited Time / 40,000 km", "vehicleClass": "$3,000 Claim Max - Class 4", "claimMax": 3000, "dealerCost": 920, "suggestedRetail": "n/a", "priceStatus": "Retail not supplied"},
        {"label": "12 Months / Unlimited km", "vehicleClass": "$3,000 Claim Max - Class 1/2/3", "claimMax": 3000, "dealerCost": 380, "suggestedRetail": "n/a", "priceStatus": "Retail not supplied"},
        {"label": "12 Months / Unlimited km", "vehicleClass": "$3,000 Claim Max - Class 4", "claimMax": 3000, "dealerCost": 780, "suggestedRetail": "n/a", "priceStatus": "Retail not supplied"},
        {"label": "24 Months / Unlimited km", "vehicleClass": "$3,000 Claim Max - Class 1/2/3", "claimMax": 3000, "dealerCost": 520, "suggestedRetail": "n/a", "priceStatus": "Retail not supplied"},
        {"label": "24 Months / Unlimited km", "vehicleClass": "$3,000 Claim Max - Class 4", "claimMax": 3000, "dealerCost": 920, "suggestedRetail": "n/a", "priceStatus": "Retail not supplied"}
      ]
    }
    $json$::jsonb,
    '{}'::jsonb,
    true
  ),
  (
    v_eid,
    v_pid,
    '2 Star Electric Auto',
    'VSC',
    $json$
    {
      "description": "Lions Auto Protection 2 Star Electric Auto warranty plans.",
      "categories": [
        {
          "name": "Program Summary",
          "parts": ["2 Star Electric Auto warranty terms supplied by Lions Auto Protection.", "$3,000 claim maximum options."]
        }
      ],
      "termsSections": [
        {
          "title": "Pricing",
          "content": "Dealer costs are sourced from the supplied dealer price list. Suggested retail pricing was not supplied."
        }
      ]
    }
    $json$::jsonb,
    $json$
    {
      "source": "Dealer Price List PDF supplied May 2026. Suggested retail not supplied.",
      "rows": [
        {"label": "12 Months / 20,000 km", "vehicleClass": "$3,000 Claim Max - Electric Option", "claimMax": 3000, "dealerCost": 325, "suggestedRetail": "n/a", "priceStatus": "Retail not supplied"},
        {"label": "24 Months / 40,000 km", "vehicleClass": "$3,000 Claim Max - Electric Option", "claimMax": 3000, "dealerCost": 435, "suggestedRetail": "n/a", "priceStatus": "Retail not supplied"},
        {"label": "36 Months / 60,000 km", "vehicleClass": "$3,000 Claim Max - Electric Option", "claimMax": 3000, "dealerCost": 675, "suggestedRetail": "n/a", "priceStatus": "Retail not supplied"}
      ]
    }
    $json$::jsonb,
    '{"vehicleType":"Electric"}'::jsonb,
    true
  ),
  (
    v_eid,
    v_pid,
    '3 Star Auto',
    'VSC',
    $json$
    {
      "description": "Lions Auto Protection 3 Star Auto warranty plans.",
      "categories": [
        {
          "name": "Program Summary",
          "parts": ["3 Star Auto warranty terms supplied by Lions Auto Protection.", "$3,000 claim maximum options."]
        }
      ],
      "termsSections": [
        {
          "title": "Pricing",
          "content": "Dealer costs are sourced from the supplied dealer price list. Suggested retail pricing was not supplied."
        }
      ]
    }
    $json$::jsonb,
    $json$
    {
      "source": "Dealer Price List PDF supplied May 2026. Suggested retail not supplied.",
      "rows": [
        {"label": "12 Months / 20,000 km", "vehicleClass": "$3,000 Claim Max - Class 1/2/3", "claimMax": 3000, "dealerCost": 425, "suggestedRetail": "n/a", "priceStatus": "Retail not supplied"},
        {"label": "24 Months / 40,000 km", "vehicleClass": "$3,000 Claim Max - Class 1/2/3", "claimMax": 3000, "dealerCost": 650, "suggestedRetail": "n/a", "priceStatus": "Retail not supplied"},
        {"label": "36 Months / 60,000 km", "vehicleClass": "$3,000 Claim Max - Class 1/2/3", "claimMax": 3000, "dealerCost": 785, "suggestedRetail": "n/a", "priceStatus": "Retail not supplied"}
      ]
    }
    $json$::jsonb,
    '{}'::jsonb,
    true
  ),
  (
    v_eid,
    v_pid,
    '4 Star Top Up Auto',
    'VSC',
    $json$
    {
      "description": "Lions Auto Protection 4 Star Top Up Auto warranty plans.",
      "categories": [
        {
          "name": "Program Summary",
          "parts": ["4 Star Top Up Auto warranty terms supplied by Lions Auto Protection.", "$5,000 claim maximum options."]
        }
      ],
      "termsSections": [
        {
          "title": "Pricing",
          "content": "Dealer costs are sourced from the supplied dealer price list. Suggested retail pricing was not supplied."
        }
      ]
    }
    $json$::jsonb,
    $json$
    {
      "source": "Dealer Price List PDF supplied May 2026. Suggested retail not supplied.",
      "rows": [
        {"label": "60 Months / Up to 100,000 km", "vehicleClass": "$5,000 Claim Max - Class 1", "claimMax": 5000, "dealerCost": 840, "suggestedRetail": "n/a", "priceStatus": "Retail not supplied"},
        {"label": "60 Months / Up to 100,000 km", "vehicleClass": "$5,000 Claim Max - Class 2", "claimMax": 5000, "dealerCost": 1084, "suggestedRetail": "n/a", "priceStatus": "Retail not supplied"},
        {"label": "60 Months / Up to 160,000 km", "vehicleClass": "$5,000 Claim Max - Class 1", "claimMax": 5000, "dealerCost": 1290, "suggestedRetail": "n/a", "priceStatus": "Retail not supplied"},
        {"label": "60 Months / Up to 160,000 km", "vehicleClass": "$5,000 Claim Max - Class 2", "claimMax": 5000, "dealerCost": 1804, "suggestedRetail": "n/a", "priceStatus": "Retail not supplied"}
      ]
    }
    $json$::jsonb,
    '{"maxMileage":"160000"}'::jsonb,
    true
  ),
  (
    v_eid,
    v_pid,
    '5 Star Auto',
    'VSC',
    $json$
    {
      "description": "Lions Auto Protection 5 Star Auto warranty plans.",
      "categories": [
        {
          "name": "Program Summary",
          "parts": ["5 Star Auto warranty terms supplied by Lions Auto Protection.", "$20,000 claim maximum options."]
        }
      ],
      "termsSections": [
        {
          "title": "Pricing",
          "content": "Dealer costs are sourced from the supplied dealer price list. Suggested retail pricing was not supplied."
        }
      ]
    }
    $json$::jsonb,
    $json$
    {
      "source": "Dealer Price List PDF supplied May 2026. Suggested retail not supplied.",
      "rows": [
        {"label": "12 Months / 20,000 km", "vehicleClass": "$20,000 Claim Max - Class 1", "claimMax": 20000, "dealerCost": 789, "suggestedRetail": "n/a", "priceStatus": "Retail not supplied"},
        {"label": "12 Months / 20,000 km", "vehicleClass": "$20,000 Claim Max - Class 2", "claimMax": 20000, "dealerCost": 919, "suggestedRetail": "n/a", "priceStatus": "Retail not supplied"},
        {"label": "12 Months / 20,000 km", "vehicleClass": "$20,000 Claim Max - Class 3", "claimMax": 20000, "dealerCost": 1909, "suggestedRetail": "n/a", "priceStatus": "Retail not supplied"},
        {"label": "12 Months / 20,000 km", "vehicleClass": "$20,000 Claim Max - Class 4", "claimMax": 20000, "dealerCost": 2475, "suggestedRetail": "n/a", "priceStatus": "Retail not supplied"},
        {"label": "24 Months / 40,000 km", "vehicleClass": "$20,000 Claim Max - Class 1", "claimMax": 20000, "dealerCost": 1240, "suggestedRetail": "n/a", "priceStatus": "Retail not supplied"},
        {"label": "24 Months / 40,000 km", "vehicleClass": "$20,000 Claim Max - Class 2", "claimMax": 20000, "dealerCost": 1299, "suggestedRetail": "n/a", "priceStatus": "Retail not supplied"},
        {"label": "24 Months / 40,000 km", "vehicleClass": "$20,000 Claim Max - Class 3", "claimMax": 20000, "dealerCost": 2359, "suggestedRetail": "n/a", "priceStatus": "Retail not supplied"},
        {"label": "24 Months / 40,000 km", "vehicleClass": "$20,000 Claim Max - Class 4", "claimMax": 20000, "dealerCost": 2925, "suggestedRetail": "n/a", "priceStatus": "Retail not supplied"},
        {"label": "36 Months / 60,000 km", "vehicleClass": "$20,000 Claim Max - Class 1", "claimMax": 20000, "dealerCost": 1690, "suggestedRetail": "n/a", "priceStatus": "Retail not supplied"},
        {"label": "36 Months / 60,000 km", "vehicleClass": "$20,000 Claim Max - Class 2", "claimMax": 20000, "dealerCost": 1729, "suggestedRetail": "n/a", "priceStatus": "Retail not supplied"},
        {"label": "36 Months / 60,000 km", "vehicleClass": "$20,000 Claim Max - Class 3", "claimMax": 20000, "dealerCost": 2809, "suggestedRetail": "n/a", "priceStatus": "Retail not supplied"},
        {"label": "36 Months / 60,000 km", "vehicleClass": "$20,000 Claim Max - Class 4", "claimMax": 20000, "dealerCost": 3375, "suggestedRetail": "n/a", "priceStatus": "Retail not supplied"},
        {"label": "Unlimited Time / Up to 110,000 km", "vehicleClass": "$20,000 Claim Max - Class 1", "claimMax": 20000, "dealerCost": 1099, "suggestedRetail": "n/a", "priceStatus": "Retail not supplied"},
        {"label": "Unlimited Time / Up to 110,000 km", "vehicleClass": "$20,000 Claim Max - Class 2", "claimMax": 20000, "dealerCost": 1299, "suggestedRetail": "n/a", "priceStatus": "Retail not supplied"},
        {"label": "Unlimited Time / Up to 110,000 km", "vehicleClass": "$20,000 Claim Max - Class 3", "claimMax": 20000, "dealerCost": 2399, "suggestedRetail": "n/a", "priceStatus": "Retail not supplied"},
        {"label": "Unlimited Time / Up to 150,000 km", "vehicleClass": "$20,000 Claim Max - Class 1", "claimMax": 20000, "dealerCost": 1599, "suggestedRetail": "n/a", "priceStatus": "Retail not supplied"},
        {"label": "Unlimited Time / Up to 150,000 km", "vehicleClass": "$20,000 Claim Max - Class 2", "claimMax": 20000, "dealerCost": 1899, "suggestedRetail": "n/a", "priceStatus": "Retail not supplied"},
        {"label": "Unlimited Time / Up to 150,000 km", "vehicleClass": "$20,000 Claim Max - Class 3", "claimMax": 20000, "dealerCost": 2699, "suggestedRetail": "n/a", "priceStatus": "Retail not supplied"},
        {"label": "Unlimited Time / Up to 200,000 km", "vehicleClass": "$20,000 Claim Max - Class 1", "claimMax": 20000, "dealerCost": 2399, "suggestedRetail": "n/a", "priceStatus": "Retail not supplied"},
        {"label": "Unlimited Time / Up to 200,000 km", "vehicleClass": "$20,000 Claim Max - Class 2", "claimMax": 20000, "dealerCost": 2599, "suggestedRetail": "n/a", "priceStatus": "Retail not supplied"},
        {"label": "Unlimited Time / Up to 200,000 km", "vehicleClass": "$20,000 Claim Max - Class 3", "claimMax": 20000, "dealerCost": 3599, "suggestedRetail": "n/a", "priceStatus": "Retail not supplied"}
      ]
    }
    $json$::jsonb,
    '{"maxMileage":"200000"}'::jsonb,
    true
  ),
  (
    v_eid,
    v_pid,
    'Electric Auto',
    'VSC',
    $json$
    {
      "description": "Lions Auto Protection Electric Auto warranty plan.",
      "categories": [
        {
          "name": "Program Summary",
          "parts": ["Electric Auto warranty term supplied by Lions Auto Protection.", "$5,000 claim maximum option."]
        }
      ],
      "termsSections": [
        {
          "title": "Pricing",
          "content": "Dealer costs are sourced from the supplied dealer price list. Suggested retail pricing was not supplied."
        }
      ]
    }
    $json$::jsonb,
    $json$
    {
      "source": "Dealer Price List PDF supplied May 2026. Suggested retail not supplied.",
      "rows": [
        {"label": "Unlimited Time / Up to 150,000 km", "vehicleClass": "$5,000 Claim Max - Electric Class 1", "claimMax": 5000, "dealerCost": 1525, "suggestedRetail": "n/a", "priceStatus": "Retail not supplied"},
        {"label": "Unlimited Time / Up to 150,000 km", "vehicleClass": "$5,000 Claim Max - Electric Class 2", "claimMax": 5000, "dealerCost": 2039, "suggestedRetail": "n/a", "priceStatus": "Retail not supplied"},
        {"label": "Unlimited Time / Up to 150,000 km", "vehicleClass": "$5,000 Claim Max - Electric Class 3", "claimMax": 5000, "dealerCost": 2653, "suggestedRetail": "n/a", "priceStatus": "Retail not supplied"}
      ]
    }
    $json$::jsonb,
    '{"vehicleType":"Electric","maxMileage":"150000"}'::jsonb,
    true
  ),
  (
    v_eid,
    v_pid,
    'Hybrid Auto',
    'VSC',
    $json$
    {
      "description": "Lions Auto Protection Hybrid Auto warranty plan.",
      "categories": [
        {
          "name": "Program Summary",
          "parts": ["Hybrid Auto warranty term supplied by Lions Auto Protection.", "$5,000 claim maximum option."]
        }
      ],
      "termsSections": [
        {
          "title": "Pricing",
          "content": "Dealer costs are sourced from the supplied dealer price list. Suggested retail pricing was not supplied."
        }
      ]
    }
    $json$::jsonb,
    $json$
    {
      "source": "Dealer Price List PDF supplied May 2026. Suggested retail not supplied.",
      "rows": [
        {"label": "Unlimited Time / Up to 150,000 km", "vehicleClass": "$5,000 Claim Max - Hybrid Class 1", "claimMax": 5000, "dealerCost": 1690, "suggestedRetail": "n/a", "priceStatus": "Retail not supplied"},
        {"label": "Unlimited Time / Up to 150,000 km", "vehicleClass": "$5,000 Claim Max - Hybrid Class 2", "claimMax": 5000, "dealerCost": 2110, "suggestedRetail": "n/a", "priceStatus": "Retail not supplied"},
        {"label": "Unlimited Time / Up to 150,000 km", "vehicleClass": "$5,000 Claim Max - Hybrid Class 3", "claimMax": 5000, "dealerCost": 3065, "suggestedRetail": "n/a", "priceStatus": "Retail not supplied"}
      ]
    }
    $json$::jsonb,
    '{"vehicleType":"Hybrid","maxMileage":"150000"}'::jsonb,
    true
  );

  RAISE NOTICE 'Done - 8 Lions Auto Protection products inserted successfully';
END $$;

