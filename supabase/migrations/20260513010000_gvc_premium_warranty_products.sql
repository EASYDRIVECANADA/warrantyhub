-- GVC Premium Warranty - provider and product seed.
-- Source documents supplied May 2026:
--   WhatsApp image scans of GVC Premium Warranty / Xperigo confidential dealer price sheets.
--
-- Safe to re-run: the provider row is upserted and GVC products are refreshed.

DO $$
DECLARE
  v_eid CONSTANT uuid := 'a2b7619d-d1bb-4317-9680-30756e330634';
  v_company_id CONSTANT uuid := '96e0172a-c366-4f7d-bf20-621e87de67a1';
  v_pid uuid;
BEGIN
  INSERT INTO public.provider_companies (
    id,
    provider_company_name,
    legal_business_name,
    business_type,
    contact_email,
    status,
    phone,
    notes
  )
  VALUES (
    v_company_id,
    'GVC Premium Warranty',
    'Guarantee VC',
    'WARRANTY_PROVIDER',
    'not-provided@gvcpremiumwarranty.local',
    'ACTIVE',
    '1-800-268-3284',
    'Seeded from GVC Premium Warranty confidential dealer price sheets. Email was not provided in the supplied scans; local placeholder used to satisfy provider_companies.contact_email.'
  )
  ON CONFLICT (id) DO UPDATE SET
    provider_company_name = excluded.provider_company_name,
    legal_business_name = excluded.legal_business_name,
    business_type = excluded.business_type,
    contact_email = excluded.contact_email,
    status = excluded.status,
    phone = excluded.phone,
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
    RAISE EXCEPTION 'No profiles found - cannot insert GVC Premium Warranty products';
  END IF;

  INSERT INTO public.providers (
    id,
    company_name,
    contact_phone,
    regions_served,
    description,
    status
  )
  VALUES (
    v_eid,
    'GVC Premium Warranty',
    '1-800-268-3284',
    ARRAY['Canada'],
    'Vehicle service contract programs branded Essential Bronze, Essential Silver, Essential Gold, Essential Platinum and Diamond, with roadside assistance provided by Xperigo.',
    'approved'
  )
  ON CONFLICT (id) DO UPDATE SET
    company_name = excluded.company_name,
    contact_phone = excluded.contact_phone,
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
    'Essential Bronze',
    'VSC',
    $json$
    {
      "description": "GVC Essential Bronze service contract coverage for any year, make or model with less than 500,000 km on the odometer.",
      "categories": [
        {"name": "Program Notes", "parts": ["Any year, any make and any model up to 500,000 km", "Car rental included", "Trip interruption included", "Optional roadside assistance available through Xperigo"]},
        {"name": "Maintenance Requirements", "parts": ["Follow all manufacturer scheduled maintenance requirements", "If oil, filter or fluid interval is greater than every 10,000 km or 6 months, service every 10,000 km or 6 months, whichever occurs first", "Maintenance must be completed by a repair or service facility; do-it-yourself maintenance is not accepted", "Proof of payment by credit card or debit card only"]}
      ],
      "termsSections": [
        {"title": "Deductible", "content": "$100 deductible included. $0 deductible can be added for $150."},
        {"title": "Ineligible Vehicles", "content": "Excludes selected exotic, ultra-luxury and limited-production vehicles including Acura NSX, Audi R8, Ferrari, Pagani, SSC, Hennessey, Koenigsegg, Arrinera Hussarya, Aston Martin, Bentley, Bugatti, Lamborghini, Lexus LF4, Maybach, Maserati MC20/MC20 Cielo, Mercedes SLR/SLS, Nissan GTR, Panoz, Rolls-Royce, Fisker Karma, McLaren and Dodge Viper."}
      ]
    }
    $json$::jsonb,
    $json$
    {
      "source": "GVC confidential dealer price sheet",
      "deductibleOptions": [
        {"label": "$100", "price": "Included"},
        {"label": "$0", "price": 150}
      ],
      "benefits": ["Car Rental", "Trip Interruption"],
      "rows": [
        {"label": "6 Months / 6,000 KM", "vehicleClass": "$1,000 Per Claim", "dealerCost": 149, "suggestedRetail": 149},
        {"label": "12 Months / 20,000 KM", "vehicleClass": "$1,000 Per Claim", "dealerCost": 175, "suggestedRetail": 175},
        {"label": "24 Months / 40,000 KM", "vehicleClass": "$1,000 Per Claim", "dealerCost": 299, "suggestedRetail": 299},
        {"label": "36 Months / 60,000 KM", "vehicleClass": "$1,000 Per Claim", "dealerCost": 449, "suggestedRetail": 449}
      ]
    }
    $json$::jsonb,
    $json$
    {
      "maxOdometerKm": 500000,
      "eligibleYears": "Any year",
      "eligibleMakes": "Any make or model unless excluded by GVC",
      "maintenanceRequired": true
    }
    $json$::jsonb,
    true
  ),
  (
    v_eid,
    v_pid,
    'Essential Silver',
    'VSC',
    $json$
    {
      "description": "GVC Essential Silver service contract coverage for vehicles 10 model years or newer with less than 250,000 km.",
      "categories": [
        {"name": "Program Notes", "parts": ["10 model years or newer and less than 250,000 km", "Older vehicles may be purchased with a $100 surcharge per additional model year up to 15 years", "Car rental included", "Trip interruption included", "Optional roadside assistance available through Xperigo"]},
        {"name": "Maintenance Requirements", "parts": ["Follow all manufacturer scheduled maintenance requirements", "If oil, filter or fluid interval is greater than every 10,000 km or 6 months, service every 10,000 km or 6 months, whichever occurs first", "Maintenance must be completed by a repair or service facility", "Proof of payment by credit card or debit card only"]}
      ],
      "termsSections": [
        {"title": "Deductible", "content": "$100 deductible included. $0 deductible can be added for $150."},
        {"title": "Kilometre Option", "content": "Unlimited kilometres can be added for $100 on the listed 12-month and 24-month terms."}
      ]
    }
    $json$::jsonb,
    $json$
    {
      "source": "GVC confidential dealer price sheet",
      "deductibleOptions": [
        {"label": "$100", "price": "Included"},
        {"label": "$0", "price": 150}
      ],
      "optionalFees": [
        {"label": "Unlimited KM option", "price": 100, "appliesTo": ["12 Months / 20,000 KM", "24 Months / 40,000 KM"]}
      ],
      "benefits": ["Car Rental", "Trip Interruption"],
      "rows": [
        {"label": "12 Months / 20,000 KM", "vehicleClass": "$3,000 Per Claim", "dealerCost": 349, "suggestedRetail": 349},
        {"label": "24 Months / 40,000 KM", "vehicleClass": "$3,000 Per Claim", "dealerCost": 399, "suggestedRetail": 399},
        {"label": "36 Months / 60,000 KM", "vehicleClass": "$3,000 Per Claim", "dealerCost": 549, "suggestedRetail": 549}
      ]
    }
    $json$::jsonb,
    $json$
    {
      "maxVehicleAgeYears": 10,
      "maxOdometerKm": 250000,
      "olderVehicleSurcharge": "$100 per additional model year up to 15 years",
      "maintenanceRequired": true
    }
    $json$::jsonb,
    true
  ),
  (
    v_eid,
    v_pid,
    'Essential Gold',
    'VSC',
    $json$
    {
      "description": "GVC Essential Gold service contract coverage for vehicles 10 model years or newer with less than 250,000 km.",
      "categories": [
        {"name": "Program Notes", "parts": ["10 model years or newer and less than 250,000 km", "Older vehicles may be purchased with a $100 surcharge per additional model year up to 15 years", "Car rental included", "Trip interruption included", "Optional roadside assistance available through Xperigo"]},
        {"name": "Maintenance Requirements", "parts": ["Follow all manufacturer scheduled maintenance requirements", "Maintenance must be completed by a repair or service facility", "Proof of payment by credit card or debit card only"]}
      ],
      "termsSections": [
        {"title": "Deductible", "content": "$100 deductible included. $0 deductible can be added for $150."},
        {"title": "Optional Fees", "content": "Hi-Tech Coverage Fee $150. Hybrid/EV Coverage Fee $299. Premium Vehicle Fee applies to Audi, Alfa Romeo, BMW, Chevrolet Corvette, Hummer, Jaguar, Land Rover, Lucid, Maserati, Mercedes, Mini, Porsche, Subaru WRX, Tesla and Volvo."},
        {"title": "Use Restrictions", "content": "Available for vehicles with payload capacity of one ton or less. Not available for taxis, emergency vehicles, snow plow, towing, school vehicles or short-term rentals."}
      ]
    }
    $json$::jsonb,
    $json$
    {
      "source": "GVC confidential dealer price sheet",
      "deductibleOptions": [
        {"label": "$100", "price": "Included"},
        {"label": "$0", "price": 150}
      ],
      "optionalFees": [
        {"label": "Unlimited KM option", "price": 100, "appliesTo": ["12 Months / 20,000 KM", "24 Months / 40,000 KM"]},
        {"label": "Hi-Tech Coverage Fee", "price": 150},
        {"label": "Hybrid/EV Coverage Fee", "price": 299},
        {"label": "Premium Vehicle Fee", "price": "Varies by claim limit"}
      ],
      "benefits": ["Car Rental", "Trip Interruption"],
      "rows": [
        {"label": "12 Months / 20,000 KM", "vehicleClass": "$3,000 Per Claim", "dealerCost": 375, "suggestedRetail": 375},
        {"label": "12 Months / 20,000 KM", "vehicleClass": "$5,000 Per Claim", "dealerCost": 675, "suggestedRetail": 675},
        {"label": "24 Months / 40,000 KM", "vehicleClass": "$3,000 Per Claim", "dealerCost": 575, "suggestedRetail": 575},
        {"label": "24 Months / 40,000 KM", "vehicleClass": "$5,000 Per Claim", "dealerCost": 775, "suggestedRetail": 775},
        {"label": "24 Months / 40,000 KM", "vehicleClass": "$10,000 Per Claim", "dealerCost": 1099, "suggestedRetail": 1099},
        {"label": "36 Months / 60,000 KM", "vehicleClass": "$3,000 Per Claim", "dealerCost": 675, "suggestedRetail": 675},
        {"label": "36 Months / 60,000 KM", "vehicleClass": "$5,000 Per Claim", "dealerCost": 875, "suggestedRetail": 875},
        {"label": "36 Months / 60,000 KM", "vehicleClass": "$10,000 Per Claim", "dealerCost": 1199, "suggestedRetail": 1199},
        {"label": "48 Months / 80,000 KM", "vehicleClass": "$3,000 Per Claim", "dealerCost": 1049, "suggestedRetail": 1049},
        {"label": "48 Months / 80,000 KM", "vehicleClass": "$5,000 Per Claim", "dealerCost": 1225, "suggestedRetail": 1225},
        {"label": "48 Months / 80,000 KM", "vehicleClass": "$10,000 Per Claim", "dealerCost": 1499, "suggestedRetail": 1499}
      ]
    }
    $json$::jsonb,
    $json$
    {
      "maxVehicleAgeYears": 10,
      "maxOdometerKm": 250000,
      "olderVehicleSurcharge": "$100 per additional model year up to 15 years",
      "maintenanceRequired": true
    }
    $json$::jsonb,
    true
  ),
  (
    v_eid,
    v_pid,
    'Essential Platinum',
    'VSC',
    $json$
    {
      "description": "GVC Essential Platinum service contract coverage for vehicles 8 model years or newer with less than 160,000 km.",
      "categories": [
        {"name": "Program Notes", "parts": ["8 model years or newer and less than 160,000 km", "Car rental included", "Trip interruption included", "Optional roadside assistance available through Xperigo"]},
        {"name": "Maintenance Requirements", "parts": ["Follow all manufacturer scheduled maintenance requirements", "Maintenance must be completed by a repair or service facility", "Proof of payment by credit card or debit card only"]}
      ],
      "termsSections": [
        {"title": "Deductible", "content": "$100 deductible included. $0 deductible can be added for $150."},
        {"title": "Optional Fees", "content": "Hi-Tech Coverage Fee $150. Hybrid/EV Coverage Fee $299. Premium Vehicle Fee applies to Audi, Alfa Romeo, BMW, Chevrolet Corvette, Hummer, Jaguar, Land Rover, Lucid, Maserati, Mercedes, Mini, Porsche, Subaru WRX, Tesla and Volvo."},
        {"title": "Use Restrictions", "content": "Available for vehicles with payload capacity of one ton or less. Not available for taxis, emergency vehicles, snow plow, towing, school vehicles or short-term rentals."}
      ]
    }
    $json$::jsonb,
    $json$
    {
      "source": "GVC confidential dealer price sheet",
      "deductibleOptions": [
        {"label": "$100", "price": "Included"},
        {"label": "$0", "price": 150}
      ],
      "optionalFees": [
        {"label": "Hi-Tech Coverage Fee", "price": 150},
        {"label": "Hybrid/EV Coverage Fee", "price": 299},
        {"label": "Premium Vehicle Fee", "price": "Varies by claim limit"}
      ],
      "benefits": ["Car Rental", "Trip Interruption"],
      "rows": [
        {"label": "12 Months / 20,000 KM", "vehicleClass": "$3,000 Per Claim", "dealerCost": 725, "suggestedRetail": 725},
        {"label": "12 Months / 20,000 KM", "vehicleClass": "$5,000 Per Claim", "dealerCost": 825, "suggestedRetail": 825},
        {"label": "24 Months / 40,000 KM", "vehicleClass": "$3,000 Per Claim", "dealerCost": 975, "suggestedRetail": 975},
        {"label": "24 Months / 40,000 KM", "vehicleClass": "$5,000 Per Claim", "dealerCost": 1075, "suggestedRetail": 1075},
        {"label": "24 Months / 40,000 KM", "vehicleClass": "$10,000 Per Claim", "dealerCost": 1525, "suggestedRetail": 1525},
        {"label": "36 Months / 60,000 KM", "vehicleClass": "$3,000 Per Claim", "dealerCost": 1349, "suggestedRetail": 1349},
        {"label": "36 Months / 60,000 KM", "vehicleClass": "$5,000 Per Claim", "dealerCost": 1525, "suggestedRetail": 1525},
        {"label": "36 Months / 60,000 KM", "vehicleClass": "$10,000 Per Claim", "dealerCost": 1875, "suggestedRetail": 1875}
      ]
    }
    $json$::jsonb,
    $json$
    {
      "maxVehicleAgeYears": 8,
      "maxOdometerKm": 160000,
      "maintenanceRequired": true
    }
    $json$::jsonb,
    true
  ),
  (
    v_eid,
    v_pid,
    'Diamond',
    'VSC',
    $json$
    {
      "description": "GVC Diamond service contract coverage with policy maximum tiers of $5,000, $10,000 and $20,000.",
      "categories": [
        {"name": "Program Notes", "parts": ["Eligibility varies by term from 5 to 6 model years and less than 120,000 km to 160,000 km", "Car rental included", "Trip interruption included", "Optional roadside assistance available through Xperigo"]},
        {"name": "Maintenance Requirements", "parts": ["Follow all manufacturer scheduled maintenance requirements", "Maintenance must be completed by a repair or service facility", "Proof of payment by credit card or debit card only"]}
      ],
      "termsSections": [
        {"title": "Deductible", "content": "$200 deductible included. $100 deductible can be added for $150. $0 deductible can be added for $300."},
        {"title": "Eligibility by Term", "content": "12, 24 and 36 month terms: 6 model years and less than 160,000 km. 48 month term: 6 model years and less than 140,000 km. 60 month term: 5 model years and less than 120,000 km."},
        {"title": "Optional Fees", "content": "Hi-Tech Coverage Fee $150. Hybrid/EV Coverage Fee $299. Premium Vehicle Fee applies to Audi, Alfa Romeo, BMW, Chevrolet Corvette, Hummer, Jaguar, Land Rover, Lucid, Maserati, Mercedes, Mini, Porsche, Subaru WRX, Tesla and Volvo."}
      ]
    }
    $json$::jsonb,
    $json$
    {
      "source": "GVC confidential dealer price sheet",
      "deductibleOptions": [
        {"label": "$200", "price": "Included"},
        {"label": "$100", "price": 150},
        {"label": "$0", "price": 300}
      ],
      "optionalFees": [
        {"label": "Hi-Tech Coverage Fee", "price": 150},
        {"label": "Hybrid/EV Coverage Fee", "price": 299},
        {"label": "Premium Vehicle Fee", "price": "Varies by policy maximum"}
      ],
      "benefits": ["Car Rental", "Trip Interruption"],
      "rows": [
        {"label": "12 Months / 20,000 KM", "vehicleClass": "$5,000 Policy Max", "dealerCost": 1049, "suggestedRetail": 1049},
        {"label": "12 Months / 20,000 KM", "vehicleClass": "$10,000 Policy Max", "dealerCost": 1325, "suggestedRetail": 1325},
        {"label": "12 Months / 20,000 KM", "vehicleClass": "$20,000 Policy Max", "dealerCost": 1325, "suggestedRetail": 1325},
        {"label": "24 Months / 40,000 KM", "vehicleClass": "$5,000 Policy Max", "dealerCost": 1299, "suggestedRetail": 1299},
        {"label": "24 Months / 40,000 KM", "vehicleClass": "$10,000 Policy Max", "dealerCost": 1575, "suggestedRetail": 1575},
        {"label": "24 Months / 40,000 KM", "vehicleClass": "$20,000 Policy Max", "dealerCost": 1575, "suggestedRetail": 1575},
        {"label": "36 Months / 60,000 KM", "vehicleClass": "$5,000 Policy Max", "dealerCost": 1749, "suggestedRetail": 1749},
        {"label": "36 Months / 60,000 KM", "vehicleClass": "$10,000 Policy Max", "dealerCost": 2025, "suggestedRetail": 2025},
        {"label": "36 Months / 60,000 KM", "vehicleClass": "$20,000 Policy Max", "dealerCost": 2025, "suggestedRetail": 2025},
        {"label": "48 Months / 80,000 KM", "vehicleClass": "$5,000 Policy Max", "dealerCost": 2199, "suggestedRetail": 2199},
        {"label": "48 Months / 80,000 KM", "vehicleClass": "$10,000 Policy Max", "dealerCost": 2475, "suggestedRetail": 2475},
        {"label": "48 Months / 80,000 KM", "vehicleClass": "$20,000 Policy Max", "dealerCost": 2475, "suggestedRetail": 2475},
        {"label": "60 Months / 100,000 KM", "vehicleClass": "$5,000 Policy Max", "dealerCost": 2649, "suggestedRetail": 2649},
        {"label": "60 Months / 100,000 KM", "vehicleClass": "$10,000 Policy Max", "dealerCost": 2925, "suggestedRetail": 2925},
        {"label": "60 Months / 100,000 KM", "vehicleClass": "$20,000 Policy Max", "dealerCost": 2925, "suggestedRetail": 2925}
      ]
    }
    $json$::jsonb,
    $json$
    {
      "termEligibility": [
        {"term": "12 Months / 20,000 KM", "maxVehicleAgeYears": 6, "maxOdometerKm": 160000},
        {"term": "24 Months / 40,000 KM", "maxVehicleAgeYears": 6, "maxOdometerKm": 160000},
        {"term": "36 Months / 60,000 KM", "maxVehicleAgeYears": 6, "maxOdometerKm": 160000},
        {"term": "48 Months / 80,000 KM", "maxVehicleAgeYears": 6, "maxOdometerKm": 140000},
        {"term": "60 Months / 100,000 KM", "maxVehicleAgeYears": 5, "maxOdometerKm": 120000}
      ],
      "maintenanceRequired": true
    }
    $json$::jsonb,
    true
  ),
  (
    v_eid,
    v_pid,
    'Roadside Assistance',
    'OTHER',
    $json$
    {
      "description": "Roadside Assistance provided by Xperigo and powered by Guarantee VC.",
      "categories": [
        {"name": "Services", "parts": ["Tire change", "Fuel delivery up to 5 litres", "Battery recharge", "Winching", "Towing to the nearest authorized service facility within 40 km", "Key lockout"]},
        {"name": "Coverage Rules", "parts": ["Available on all makes and models with less than 500,000 km", "Maximum of four services per year combined", "Policy covers the named vehicle only"]}
      ],
      "termsSections": [
        {"title": "Towing", "content": "Towing is to the nearest authorized service facility within 40 km of the service location. Longer towing may be billed to the customer."},
        {"title": "Exclusive Zones", "content": "If the vehicle breaks down in an exclusive zone, the customer obtains towing and submits receipts for possible reimbursement up to $100."},
        {"title": "Service Presence", "content": "The vehicle operator must be present for services to be rendered."}
      ]
    }
    $json$::jsonb,
    $json$
    {
      "source": "GVC Roadside Assistance dealer price sheet",
      "benefits": ["Towing 40 KM Radius", "Gas Delivery", "Key Lockout", "Winching Service", "Flat Tire"],
      "rows": [
        {"label": "12 Months", "vehicleClass": "Roadside Assistance", "dealerCost": 65, "suggestedRetail": 65},
        {"label": "24 Months", "vehicleClass": "Roadside Assistance", "dealerCost": 130, "suggestedRetail": 130},
        {"label": "36 Months", "vehicleClass": "Roadside Assistance", "dealerCost": 195, "suggestedRetail": 195},
        {"label": "48 Months", "vehicleClass": "Roadside Assistance", "dealerCost": 260, "suggestedRetail": 260},
        {"label": "60 Months", "vehicleClass": "Roadside Assistance", "dealerCost": 325, "suggestedRetail": 325}
      ]
    }
    $json$::jsonb,
    $json$
    {
      "maxOdometerKm": 500000,
      "maxServicesPerYear": 4,
      "coversNamedVehicleOnly": true
    }
    $json$::jsonb,
    true
  );

  RAISE NOTICE 'Done - 6 GVC Premium Warranty products inserted successfully';
END $$;
