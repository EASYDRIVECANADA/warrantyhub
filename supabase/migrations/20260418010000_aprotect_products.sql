-- A-Protect Warranty Corporation — seed products
-- Provider entity ID: 01c7fc25-cc8a-4814-b4e0-ae80f66d865b (Aprotect Warranty)

DO $$
DECLARE
  v_uid  uuid;
  v_pid  uuid := '01c7fc25-cc8a-4814-b4e0-ae80f66d865b';
BEGIN
  -- Get the auth user linked to this provider entity via provider_members
  SELECT user_id INTO v_uid FROM public.provider_members WHERE provider_id = v_pid LIMIT 1;

  -- Fallback: look up by contact_email in providers table → auth.users
  IF v_uid IS NULL THEN
    SELECT u.id INTO v_uid
    FROM auth.users u
    JOIN public.providers p ON lower(u.email) = lower(p.contact_email)
    WHERE p.id = v_pid
    LIMIT 1;
  END IF;

  IF v_uid IS NULL THEN RAISE EXCEPTION 'Could not find auth user for provider %', v_pid; END IF;

  RAISE NOTICE 'Inserting A-Protect products — provider_entity_id=%, user_id=%', v_pid, v_uid;

  -- ─────────────────────────────────────────────────────────────
  -- 1. Assured Warranty — $2,000 Per Claim
  -- ─────────────────────────────────────────────────────────────
  INSERT INTO public.products
    (provider_entity_id, provider_id, name, product_type,
     coverage_details_json, pricing_json, eligibility_rules, published)
  VALUES (v_pid, v_uid,
    'Assured Warranty — $2,000 Per Claim', 'VSC',
    $j${
      "description": "Entry-level powertrain protection available on any year, make, model or mileage. Includes light duty commercial/business use and branded/rebuild vehicles. Applies to passenger vehicles and pick up trucks/vans up to 1 ton.",
      "categories": [
        {"name": "Engine", "parts": ["Engine block","Crankshaft","Pistons and piston rings","Connecting rods and bearings","Cylinder head(s)","Valves (intake and exhaust)","Camshaft and engine main bearings","Valve lifters","Valve springs and retainers","Pushrods","Rocker arm assemblies","Wrist pins","Oil pump","Sprockets","Timing chain and guides","Timing chain tensioner","Internal variable timing components"]},
        {"name": "Transmission", "parts": ["Transmission case (Auto/Manual)","Gear sets","Input and output shaft","Torque converter","Solenoid packs","Valve body","Accumulator","Fluid pump","Countershaft","Bearings","Bands","Parking pawl"]},
        {"name": "Transfer Case / 4x4", "parts": ["Auxiliary differential housing","Transfer case housing","Gears","Sprockets","Internal bearings"]},
        {"name": "Differential", "parts": ["Housing","Bearings","Crown and pinion (FWD)","Carrier gear and case (RWD)","Ring gear","Differential cover","Viscous couplers"]},
        {"name": "Turbo / Supercharger", "parts": ["Turbo/supercharger assembly","Supercharger compressor","Turbo internal bearings","Clutch and pulley","Wastegate and actuator","Wastegate controller","Blow off valve","Diverter valve","Bypass valve","Intercooler","Turbo water pump"]}
      ],
      "exclusions": ["Axle seals","Freon and recharge","ABS components"],
      "termsSections": [
        {"title": "Coverage Limit", "content": "$2,000 per claim maximum. $100 deductible applies."},
        {"title": "Eligibility", "content": "Available on any year, make, model or mileage. Includes light duty commercial/business use, branded/rebuild vehicles. Applies to passenger vehicles and pick up trucks/vans up to 1 ton."},
        {"title": "Towing", "content": "A-Protect will reimburse up to $60.00 per day for towing expenses due to a contract-covered breakdown. Valid receipts required."},
        {"title": "Trip Interruption", "content": "Up to $150.00 for lodging, meals, bus, taxi if the repair facility cannot provide same-day service and is further than 200 km from the customer home. Receipts required within 7 days."},
        {"title": "Free Diagnostics", "content": "A free 30-minute diagnostic (visual, scan and road test) is available exclusively at an A-Protect Authorized Repair Centre. Pre-approval required."}
      ]
    }$j$::jsonb,
    $j${
      "deductible": "100",
      "rows": [
        {"label": "3 Months / 3,000 km",  "dealerCost": 69,  "suggestedRetail": 89},
        {"label": "7 Months / 11,000 km", "dealerCost": 99,  "suggestedRetail": 129},
        {"label": "12 Months / 12,000 km","dealerCost": 179, "suggestedRetail": 229}
      ],
      "benefits": [
        {"name": "Towing Reimbursement",  "description": "Up to $60/day for towing due to a covered breakdown", "limit": "$60/day"},
        {"name": "Trip Interruption",     "description": "Up to $150 for lodging/meals/taxi if repair is 200+ km away", "limit": "$150 max"},
        {"name": "Free Diagnostics",      "description": "Free 30-min diagnostic at an A-Protect Authorized Repair Centre", "limit": "Pre-approval required"}
      ]
    }$j$::jsonb,
    '{}'::jsonb, true);

  -- ─────────────────────────────────────────────────────────────
  -- 2. Assured Warranty — $3,000 Per Claim  (Seals & Gaskets included)
  -- ─────────────────────────────────────────────────────────────
  INSERT INTO public.products
    (provider_entity_id, provider_id, name, product_type,
     coverage_details_json, pricing_json, eligibility_rules, published)
  VALUES (v_pid, v_uid,
    'Assured Warranty — $3,000 Per Claim', 'VSC',
    $j${
      "description": "Mid-level powertrain protection with Seals and Gaskets included at no extra charge. Available on any year, make, model or mileage.",
      "categories": [
        {"name": "Engine", "parts": ["Engine block","Crankshaft","Pistons and piston rings","Connecting rods and bearings","Cylinder head(s)","Valves (intake and exhaust)","Camshaft and engine main bearings","Valve lifters","Valve springs and retainers","Pushrods","Rocker arm assemblies","Wrist pins","Oil pump","Sprockets","Timing chain and guides","Timing chain tensioner","Internal variable timing components"]},
        {"name": "Transmission", "parts": ["Transmission case (Auto/Manual)","Gear sets","Input and output shaft","Torque converter","Solenoid packs","Valve body","Accumulator","Fluid pump","Countershaft","Bearings","Bands","Parking pawl"]},
        {"name": "Transfer Case / 4x4", "parts": ["Auxiliary differential housing","Transfer case housing","Gears","Sprockets","Internal bearings"]},
        {"name": "Differential", "parts": ["Housing","Bearings","Crown and pinion (FWD)","Carrier gear and case (RWD)","Ring gear","Differential cover","Viscous couplers"]},
        {"name": "Turbo / Supercharger", "parts": ["Turbo/supercharger assembly","Supercharger compressor","Turbo internal bearings","Clutch and pulley","Wastegate and actuator","Blow off valve","Diverter valve","Bypass valve","Intercooler","Turbo water pump"]},
        {"name": "Seals & Gaskets", "parts": ["Crankshaft seal (front and rear)","Camshaft seals","Cylinder head gaskets","Oil pan gasket","Timing cover gasket","Valve cover gasket","Intake manifold gaskets","Valve guide seals","Transmission/transaxle seals and gaskets","Transfer case seals and gaskets","Differential seals and gaskets"]}
      ],
      "exclusions": ["Axle seals","Freon and recharge"],
      "termsSections": [
        {"title": "Coverage Limit", "content": "$3,000 per claim maximum. $100 deductible applies."},
        {"title": "Seals and Gaskets", "content": "Internal seals and gaskets used to contain fluids/lubricants within covered parts are included at no extra charge."},
        {"title": "Eligibility", "content": "Available on any year, make, model or mileage. Includes commercial/business use and branded/rebuild vehicles up to 1 ton."},
        {"title": "Towing", "content": "Up to $60.00/day reimbursement for towing due to a contract-covered breakdown."},
        {"title": "Trip Interruption", "content": "Up to $150.00 for lodging, meals, bus, taxi if repair facility is 200+ km from home."}
      ]
    }$j$::jsonb,
    $j${
      "deductible": "100",
      "rows": [
        {"label": "6 Months / 6,000 km",   "dealerCost": 139, "suggestedRetail": 179},
        {"label": "12 Months / 12,000 km",  "dealerCost": 299, "suggestedRetail": 389},
        {"label": "24 Months / 24,000 km",  "dealerCost": 399, "suggestedRetail": 519}
      ],
      "benefits": [
        {"name": "Seals and Gaskets Included", "description": "Internal seals and gaskets for all covered components included", "limit": "Included"},
        {"name": "Towing Reimbursement",       "description": "Up to $60/day for towing due to a covered breakdown", "limit": "$60/day"},
        {"name": "Trip Interruption",          "description": "Up to $150 for lodging/meals/taxi if repair is 200+ km away", "limit": "$150 max"},
        {"name": "Free Diagnostics",           "description": "Free 30-min diagnostic at an A-Protect Authorized Repair Centre", "limit": "Pre-approval required"}
      ]
    }$j$::jsonb,
    '{}'::jsonb, true);

  -- ─────────────────────────────────────────────────────────────
  -- 3. Assured Warranty — $5,000 Per Claim  (longer terms, up to 200k km)
  -- ─────────────────────────────────────────────────────────────
  INSERT INTO public.products
    (provider_entity_id, provider_id, name, product_type,
     coverage_details_json, pricing_json, eligibility_rules, published)
  VALUES (v_pid, v_uid,
    'Assured Warranty — $5,000 Per Claim', 'VSC',
    $j${
      "description": "Higher-limit powertrain protection with longer terms and unlimited KM options. Available on any year, make, model or mileage up to 200,000 km.",
      "categories": [
        {"name": "Engine", "parts": ["Engine block","Crankshaft","Pistons and piston rings","Connecting rods and bearings","Cylinder head(s)","Valves (intake and exhaust)","Camshaft and engine main bearings","Valve lifters","Valve springs and retainers","Pushrods","Rocker arm assemblies","Wrist pins","Oil pump","Sprockets","Timing chain and guides","Timing chain tensioner","Internal variable timing components"]},
        {"name": "Transmission", "parts": ["Transmission case (Auto/Manual)","Gear sets","Input and output shaft","Torque converter","Solenoid packs","Valve body","Accumulator","Fluid pump","Countershaft","Bearings","Bands","Parking pawl"]},
        {"name": "Transfer Case / 4x4", "parts": ["Auxiliary differential housing","Transfer case housing","Gears","Sprockets","Internal bearings"]},
        {"name": "Differential", "parts": ["Housing","Bearings","Crown and pinion (FWD)","Carrier gear and case (RWD)","Ring gear","Differential cover","Viscous couplers"]},
        {"name": "Turbo / Supercharger", "parts": ["Turbo/supercharger assembly","Supercharger compressor","Turbo internal bearings","Clutch and pulley","Wastegate and actuator","Blow off valve","Diverter valve","Bypass valve","Intercooler","Turbo water pump"]}
      ],
      "exclusions": ["Axle seals","Freon and recharge (if A/C option added)","ABS components"],
      "termsSections": [
        {"title": "Coverage Limit", "content": "$5,000 per claim maximum. $100 deductible applies."},
        {"title": "Eligibility", "content": "Available on any year, make, model or mileage up to 200,000 km. Includes commercial/business use and branded/rebuild vehicles up to 1 ton."},
        {"title": "Towing", "content": "Up to $60.00/day reimbursement for towing due to a contract-covered breakdown."},
        {"title": "Trip Interruption", "content": "Up to $150.00 for lodging, meals, bus, taxi if repair facility is 200+ km from home."}
      ]
    }$j$::jsonb,
    $j${
      "deductible": "100",
      "rows": [
        {"label": "12 Months / Unlimited km", "dealerCost": 289, "suggestedRetail": 379},
        {"label": "24 Months / Unlimited km", "dealerCost": 449, "suggestedRetail": 579},
        {"label": "36 Months / 60,000 km",   "dealerCost": 539, "suggestedRetail": 699},
        {"label": "48 Months / 80,000 km",   "dealerCost": 709, "suggestedRetail": 919}
      ],
      "benefits": [
        {"name": "Towing Reimbursement", "description": "Up to $60/day for towing due to a covered breakdown", "limit": "$60/day"},
        {"name": "Trip Interruption",    "description": "Up to $150 for lodging/meals/taxi if repair is 200+ km away", "limit": "$150 max"},
        {"name": "Free Diagnostics",     "description": "Free 30-min diagnostic at an A-Protect Authorized Repair Centre", "limit": "Pre-approval required"}
      ]
    }$j$::jsonb,
    '{"maxMileage": 200000}'::jsonb, true);

  -- ─────────────────────────────────────────────────────────────
  -- 4. Elite Warranty  ($6,000 per claim, any mileage)
  -- ─────────────────────────────────────────────────────────────
  INSERT INTO public.products
    (provider_entity_id, provider_id, name, product_type,
     coverage_details_json, pricing_json, eligibility_rules, published)
  VALUES (v_pid, v_uid,
    'Elite Warranty', 'VSC',
    $j${
      "description": "Comprehensive $6,000 per claim coverage on any year, make, model or mileage. Includes Seals and Gaskets, Roadside Assistance, and Trip Interruption.",
      "categories": [
        {"name": "Engine", "parts": ["Engine block","Crankshaft","Pistons and piston rings","Connecting rods and bearings","Cylinder head(s)","Valves (intake and exhaust)","Camshaft and engine main bearings","Valve lifters","Valve springs and retainers","Pushrods","Rocker arm assemblies","Wrist pins","Oil pump","Sprockets","Timing chain and guides","Timing chain tensioner","Internal variable timing components"]},
        {"name": "Transmission", "parts": ["Transmission case (Auto/Manual)","Gear sets","Input and output shaft","Torque converter","Solenoid packs","Valve body","Accumulator","Fluid pump","Countershaft","Bearings","Bands","Parking pawl"]},
        {"name": "Transfer Case / 4x4", "parts": ["Auxiliary differential housing","Transfer case housing","Gears","Sprockets","Internal bearings"]},
        {"name": "Differential", "parts": ["Housing","Bearings","Crown and pinion (FWD)","Carrier gear and case (RWD)","Ring gear","Differential cover","Viscous couplers"]},
        {"name": "Turbo / Supercharger", "parts": ["Turbo/supercharger assembly","Supercharger compressor","Turbo internal bearings","Clutch and pulley","Wastegate and actuator","Blow off valve","Diverter valve","Bypass valve","Intercooler","Turbo water pump"]},
        {"name": "Seals & Gaskets", "parts": ["Crankshaft seal (front and rear)","Camshaft seals","Cylinder head gaskets","Oil pan gasket","Timing cover gasket","Valve cover gasket","Intake manifold gaskets","Valve guide seals","Transmission/transaxle seals and gaskets","Transfer case seals and gaskets","Differential seals and gaskets"]},
        {"name": "Roadside Assistance", "parts": ["Towing","Fuel delivery (excluding fuel cost)","Battery boost","Lockout services (excluding locksmith)","Tire change with spare","Winching service"]}
      ],
      "exclusions": ["Axle seals","Freon and recharge","Hybrid components (available as add-on)"],
      "termsSections": [
        {"title": "Coverage Limit", "content": "$6,000 per claim maximum. $100 deductible applies."},
        {"title": "Eligibility", "content": "Available on any year, make, model or mileage. Includes light duty commercial/business use vehicle, branded/rebuild vehicles. Applies to passenger vehicles and pick up/vans up to 1 ton."},
        {"title": "Roadside Coverage", "content": "Up to $75.00 per occurrence (Maximum Limit: $225.00) for towing, fuel delivery, battery boost, lockout, tire change and winching."},
        {"title": "Trip Interruption", "content": "Up to $150.00 for lodging, meals, bus, taxi if repair facility is 200+ km from home. Receipts required within 7 days."},
        {"title": "Towing", "content": "Up to $60.00/day reimbursement for towing due to a contract-covered breakdown."},
        {"title": "Free Diagnostics", "content": "Free 30-minute diagnostic at an A-Protect Authorized Repair Centre. Pre-approval required."}
      ]
    }$j$::jsonb,
    $j${
      "deductible": "100",
      "rows": [
        {"label": "6 Months / 12,000 km",    "dealerCost": 199, "suggestedRetail": 259},
        {"label": "12 Months / Unlimited km", "dealerCost": 389, "suggestedRetail": 499},
        {"label": "24 Months / Unlimited km", "dealerCost": 559, "suggestedRetail": 729},
        {"label": "36 Months / 60,000 km",   "dealerCost": 709, "suggestedRetail": 919},
        {"label": "48 Months / 80,000 km",   "dealerCost": 869, "suggestedRetail": 1129}
      ],
      "benefits": [
        {"name": "Roadside Assistance",      "description": "Up to $75/occurrence (max $225) — towing, fuel delivery, battery boost, lockout, tire change, winching", "limit": "$75/occurrence, $225 max"},
        {"name": "Towing Reimbursement",     "description": "Up to $60/day for towing due to a covered breakdown", "limit": "$60/day"},
        {"name": "Trip Interruption",        "description": "Up to $150 for lodging/meals/taxi if repair is 200+ km away", "limit": "$150 max"},
        {"name": "Seals and Gaskets",        "description": "All internal seals and gaskets for covered components included", "limit": "Included"},
        {"name": "Free Diagnostics",         "description": "Free 30-min diagnostic at an A-Protect Authorized Repair Centre", "limit": "Pre-approval required"}
      ]
    }$j$::jsonb,
    '{}'::jsonb, true);

  -- ─────────────────────────────────────────────────────────────
  -- 5. Premium Special Warranty  ($6,000 / $150 deductible, adds A/C + Electrical)
  -- ─────────────────────────────────────────────────────────────
  INSERT INTO public.products
    (provider_entity_id, provider_id, name, product_type,
     coverage_details_json, pricing_json, eligibility_rules, published)
  VALUES (v_pid, v_uid,
    'Premium Special Warranty', 'VSC',
    $j${
      "description": "Premium plan covering engine, drivetrain, A/C, electrical, alternator, starter, and water pump. Available on any year, make, model or mileage. $6,000 per claim, $150 deductible.",
      "categories": [
        {"name": "Engine", "parts": ["Engine block","Crankshaft","Pistons and piston rings","Connecting rods and bearings","Cylinder head(s)","Valves (intake and exhaust)","Camshaft and engine main bearings","Valve lifters","Valve springs and retainers","Pushrods","Rocker arm assemblies","Wrist pins","Oil pump","Sprockets","Timing chain and guides","Timing chain tensioner","Internal variable timing components"]},
        {"name": "Transmission", "parts": ["Transmission case (Auto/Manual)","Gear sets","Input and output shaft","Torque converter","Solenoid packs","Valve body","Accumulator","Fluid pump","Countershaft","Bearings","Bands","Parking pawl"]},
        {"name": "Transfer Case / 4x4", "parts": ["Auxiliary differential housing","Transfer case housing","Gears","Sprockets","Internal bearings"]},
        {"name": "Differential", "parts": ["Housing","Bearings","Crown and pinion (FWD)","Carrier gear and case (RWD)","Ring gear","Differential cover","Viscous couplers"]},
        {"name": "Turbo / Supercharger", "parts": ["Turbo/supercharger assembly","Supercharger compressor","Turbo internal bearings","Clutch and pulley","Wastegate and actuator","Blow off valve","Diverter valve","Bypass valve","Intercooler","Turbo water pump"]},
        {"name": "Alternator / Starter / Water Pump", "parts": ["Alternator and voltage regulator","Starter and ignition solenoid","Solenoid switch","Water pump"]},
        {"name": "Air Conditioning", "parts": ["A/C compressor","A/C condenser","Evaporator core","Expansion valve","Receiver/dryer","Accumulator","A/C compressor clutch assembly","Orifice tube","A/C seals and gaskets","Schrader valves"]},
        {"name": "Electrical", "parts": ["Blower motor","Windshield wiper motors","Windshield washer pump","Horn assembly"]},
        {"name": "Seals & Gaskets", "parts": ["Crankshaft seal (front and rear)","Camshaft seals","Cylinder head gaskets","Oil pan gasket","Timing cover gasket","Valve cover gasket","Intake manifold gaskets","Valve guide seals","Transmission/transaxle seals and gaskets","Transfer case seals and gaskets","Differential seals and gaskets"]}
      ],
      "exclusions": ["Axle seals","Freon and recharge","ABS components"],
      "termsSections": [
        {"title": "Coverage Limit", "content": "$6,000 per claim maximum. $150 deductible applies."},
        {"title": "Eligibility", "content": "Available on any year, make, model or mileage. Includes commercial/business use vehicle, branded/rebuild vehicles. Applies to passenger vehicles and pick up/vans up to 1 ton."},
        {"title": "Air Conditioning Exclusions", "content": "Freon and recharge are excluded from A/C coverage."},
        {"title": "Roadside Coverage", "content": "Up to $75.00 per occurrence (Maximum Limit: $225.00) for towing, fuel delivery, battery boost, lockout, tire change and winching."},
        {"title": "Towing", "content": "Up to $60.00/day reimbursement for towing due to a contract-covered breakdown."},
        {"title": "Trip Interruption", "content": "Up to $150.00 for lodging, meals, bus, taxi if repair facility is 200+ km from home."}
      ]
    }$j$::jsonb,
    $j${
      "deductible": "150",
      "rows": [
        {"label": "6 Months / 10,000 km",  "dealerCost": 259, "suggestedRetail": 339},
        {"label": "12 Months / 20,000 km", "dealerCost": 429, "suggestedRetail": 559},
        {"label": "24 Months / 40,000 km", "dealerCost": 709, "suggestedRetail": 919},
        {"label": "36 Months / 60,000 km", "dealerCost": 875, "suggestedRetail": 1139}
      ],
      "benefits": [
        {"name": "Air Conditioning Included", "description": "Full A/C system coverage — compressor, condenser, evaporator core, expansion valve and more", "limit": "Included"},
        {"name": "Electrical Included",       "description": "Blower motor, wiper motors, washer pump, horn included", "limit": "Included"},
        {"name": "Roadside Assistance",       "description": "Up to $75/occurrence (max $225) — towing, fuel delivery, battery boost, lockout, tire change", "limit": "$75/occurrence, $225 max"},
        {"name": "Towing Reimbursement",      "description": "Up to $60/day for towing due to a covered breakdown", "limit": "$60/day"},
        {"name": "Trip Interruption",         "description": "Up to $150 for lodging/meals/taxi if repair is 200+ km away", "limit": "$150 max"},
        {"name": "Free Diagnostics",          "description": "Free 30-min diagnostic at an A-Protect Authorized Repair Centre", "limit": "Pre-approval required"}
      ]
    }$j$::jsonb,
    '{}'::jsonb, true);

  -- ─────────────────────────────────────────────────────────────
  -- 6. Superior Elite Warranty  (adds Brakes, Suspension, Fuel, Power Steering — up to 160k km)
  -- ─────────────────────────────────────────────────────────────
  INSERT INTO public.products
    (provider_entity_id, provider_id, name, product_type,
     coverage_details_json, pricing_json, eligibility_rules, published)
  VALUES (v_pid, v_uid,
    'Superior Elite Warranty', 'VSC',
    $j${
      "description": "Top-tier mechanical warranty adding brakes, front suspension, fuel system, and power steering. Available up to 160,000 km. $6,000 per claim, $150 deductible.",
      "categories": [
        {"name": "Engine", "parts": ["Engine block","Crankshaft","Pistons and piston rings","Connecting rods and bearings","Cylinder head(s)","Valves (intake and exhaust)","Camshaft and engine main bearings","Valve lifters","Valve springs and retainers","Pushrods","Rocker arm assemblies","Wrist pins","Oil pump","Sprockets","Timing chain and guides","Timing chain tensioner","Internal variable timing components"]},
        {"name": "Transmission", "parts": ["Transmission case (Auto/Manual)","Gear sets","Input and output shaft","Torque converter","Solenoid packs","Valve body","Accumulator","Fluid pump","Countershaft","Bearings","Bands","Parking pawl"]},
        {"name": "Transfer Case / 4x4", "parts": ["Auxiliary differential housing","Transfer case housing","Gears","Sprockets","Internal bearings"]},
        {"name": "Differential", "parts": ["Housing","Bearings","Crown and pinion (FWD)","Carrier gear and case (RWD)","Ring gear","Differential cover","Viscous couplers"]},
        {"name": "Turbo / Supercharger", "parts": ["Turbo/supercharger assembly","Supercharger compressor","Turbo internal bearings","Clutch and pulley","Wastegate and actuator","Blow off valve","Diverter valve","Bypass valve","Intercooler","Turbo water pump"]},
        {"name": "Alternator / Starter / Water Pump", "parts": ["Alternator and voltage regulator","Starter and ignition solenoid","Solenoid switch","Water pump"]},
        {"name": "Air Conditioning", "parts": ["A/C compressor","A/C condenser","Evaporator core","Expansion valve","Receiver/dryer","Accumulator","Orifice tube","A/C seals and gaskets","Schrader valves"]},
        {"name": "Brakes", "parts": ["Master cylinder","Brake calipers","Brake vacuum booster","Wheel cylinders","Brake flex hoses","Hydraulic steel lines and fittings","Proportioning valve"]},
        {"name": "Front Suspension", "parts": ["Control arms (upper and lower)","Control arm bushings","Ball joints (upper and lower)","Steering knuckles"]},
        {"name": "Fuel System", "parts": ["Fuel injectors","Fuel pressure regulator","Fuel pump","Fuel rails","Fuel injector lines"]},
        {"name": "Power Steering", "parts": ["Power steering pump","Rack and pinion","Manual and power steering box","Electric power assist motor"]},
        {"name": "Electrical", "parts": ["Blower motor","Windshield wiper motors","Windshield washer pump","Horn assembly"]},
        {"name": "Seals & Gaskets", "parts": ["Crankshaft seal (front and rear)","Camshaft seals","Cylinder head gaskets","Oil pan gasket","Timing cover gasket","Valve cover gasket","Intake manifold gaskets","Valve guide seals","Transmission/transaxle seals and gaskets","Transfer case seals and gaskets","Differential seals and gaskets"]}
      ],
      "exclusions": ["Axle seals","ABS brakes (available via Hi-Tech add-on)","Freon and recharge"],
      "termsSections": [
        {"title": "Coverage Limit", "content": "$6,000 per claim maximum. $150 deductible applies."},
        {"title": "Eligibility", "content": "Available on any year, make, model or mileage up to 160,000 km. Includes commercial/business use vehicle, branded/rebuild vehicles. Applies to passenger vehicles and pick up/vans up to 1 ton."},
        {"title": "Premium Vehicle Fee", "content": "Additional charges apply for BMW, Mercedes, Audi, Tesla, Porsche, Jaguar, Lamborghini, Ferrari, Aston Martin, Bentley, McLaren, Bugatti, Maserati, Alfa Romeo, Land Rover, Subaru WRX, Chevrolet Corvette, Hummer, Volvo, MINI, Rolls Royce, and Diesel Trucks."},
        {"title": "Roadside Coverage", "content": "Up to $75.00 per occurrence (Maximum Limit: $225.00) for towing, fuel delivery, battery boost, lockout, tire change and winching."},
        {"title": "Trip Interruption", "content": "Up to $150.00 for lodging, meals, bus, taxi if repair facility is 200+ km from home."}
      ]
    }$j$::jsonb,
    $j${
      "deductible": "150",
      "rows": [
        {"label": "12 Months / 20,000 km",         "vehicleClass": "0 – 60,000 km",        "dealerCost": 485,  "suggestedRetail": 629},
        {"label": "24 Months / 40,000 km",         "vehicleClass": "0 – 60,000 km",        "dealerCost": 629,  "suggestedRetail": 819},
        {"label": "36 Months / 60,000 km",         "vehicleClass": "0 – 60,000 km",        "dealerCost": 849,  "suggestedRetail": 1099},
        {"label": "24 Months / Unlimited km",      "vehicleClass": "0 – 60,000 km",        "dealerCost": 749,  "suggestedRetail": 979},
        {"label": "36 Months / Unlimited km",      "vehicleClass": "0 – 60,000 km",        "dealerCost": 1049, "suggestedRetail": 1359},
        {"label": "48 Months / 80,000 km",         "vehicleClass": "0 – 60,000 km",        "dealerCost": 1049, "suggestedRetail": 1359},
        {"label": "12 Months / 20,000 km",         "vehicleClass": "60,001 – 120,000 km",  "dealerCost": 749,  "suggestedRetail": 979},
        {"label": "24 Months / 40,000 km",         "vehicleClass": "60,001 – 120,000 km",  "dealerCost": 899,  "suggestedRetail": 1169},
        {"label": "36 Months / 60,000 km",         "vehicleClass": "60,001 – 120,000 km",  "dealerCost": 1299, "suggestedRetail": 1689},
        {"label": "24 Months / Unlimited km",      "vehicleClass": "60,001 – 120,000 km",  "dealerCost": 999,  "suggestedRetail": 1299},
        {"label": "36 Months / Unlimited km",      "vehicleClass": "60,001 – 120,000 km",  "dealerCost": 1649, "suggestedRetail": 2149},
        {"label": "48 Months / 80,000 km",         "vehicleClass": "60,001 – 120,000 km",  "dealerCost": 1449, "suggestedRetail": 1889},
        {"label": "12 Months / 20,000 km",         "vehicleClass": "120,001 – 160,000 km", "dealerCost": 849,  "suggestedRetail": 1099},
        {"label": "24 Months / 40,000 km",         "vehicleClass": "120,001 – 160,000 km", "dealerCost": 1149, "suggestedRetail": 1499},
        {"label": "24 Months / Unlimited km",      "vehicleClass": "120,001 – 160,000 km", "dealerCost": 1249, "suggestedRetail": 1629},
        {"label": "36 Months / Unlimited km",      "vehicleClass": "120,001 – 160,000 km", "dealerCost": 1659, "suggestedRetail": 2149},
        {"label": "48 Months / 80,000 km",         "vehicleClass": "120,001 – 160,000 km", "dealerCost": 1489, "suggestedRetail": 1939}
      ],
      "benefits": [
        {"name": "Roadside Assistance",  "description": "Up to $75/occurrence (max $225) — towing, fuel delivery, battery boost, lockout, tire change", "limit": "$75/occurrence, $225 max"},
        {"name": "Towing Reimbursement", "description": "Up to $60/day for towing due to a covered breakdown", "limit": "$60/day"},
        {"name": "Trip Interruption",    "description": "Up to $150 for lodging/meals/taxi if repair is 200+ km away", "limit": "$150 max"},
        {"name": "Free Diagnostics",     "description": "Free 30-min diagnostic at an A-Protect Authorized Repair Centre", "limit": "Pre-approval required"}
      ]
    }$j$::jsonb,
    '{"maxMileage": 160000}'::jsonb, true);

  -- ─────────────────────────────────────────────────────────────
  -- 7. Timeless Warranty — Luxury Plan  (near bumper-to-bumper, up to 225k km, 7 yrs or newer)
  -- ─────────────────────────────────────────────────────────────
  INSERT INTO public.products
    (provider_entity_id, provider_id, name, product_type,
     coverage_details_json, pricing_json, eligibility_rules, published)
  VALUES (v_pid, v_uid,
    'Timeless Warranty — Luxury Plan', 'VSC',
    $j${
      "description": "Near bumper-to-bumper protection including Wear and Tear coverage. Available for vehicles 7 years or newer and up to 225,000 km. Three per-claim levels: $5,000 / $10,000 / $20,000.",
      "categories": [
        {"name": "Engine", "parts": ["Engine block","Crankshaft","Pistons and piston rings","Connecting rods and bearings","Cylinder head(s)","Valves (intake and exhaust)","Camshaft and engine main bearings","Valve lifters","Oil pump","Timing chain and guides","Internal variable timing components","Intake and exhaust manifold","Timing belt tensioner and cover","Harmonic balancer and pulley"]},
        {"name": "Transmission", "parts": ["Transmission case","Gear sets","Torque converter","Solenoid packs","Valve body","Accumulator","Fluid pump","Bearings","Bands","Powertrain control module","Transmission cooler","Mounts","Oil pan"]},
        {"name": "Transfer Case / 4x4", "parts": ["Transfer case housing","Gears","Sprockets","Internal bearings","Transfer case actuator","Seals and gaskets"]},
        {"name": "Differential", "parts": ["Housing","Bearings","Crown and pinion","Carrier gear and case","Ring gear","Differential cover","Viscous couplers","Front/rear wheel bearings"]},
        {"name": "Turbo / Supercharger", "parts": ["Turbo/supercharger assembly","Supercharger compressor","Turbo internal bearings","Clutch and pulley","Wastegate and actuator","Blow off valve","Bypass valve","Intercooler","Turbo water pump"]},
        {"name": "Air Conditioning", "parts": ["A/C compressor","A/C condenser","Evaporator core","Expansion valve","Receiver/dryer","Accumulator","Orifice tube","A/C seals and gaskets","Refrigerant lines","Idler pulley with bearing","Condenser clutch assembly","High/low pressure cycling switch","Oil and refrigerant"]},
        {"name": "Brakes", "parts": ["Master cylinder","Brake calipers","Brake vacuum booster","Wheel cylinders","Brake flex hoses","Hydraulic steel lines","Proportioning valve","Backing plates","Return springs","Emergency brake cables","ABS electronic control processor","Isolation/dump valve","Wheel speed sensors"]},
        {"name": "Cooling System", "parts": ["Water pump","Radiator cooling fan (electric/mechanical)","Coolant reservoir","Heater control valve","Cooling fan clutch","Thermostat","Serpentine belt","Hot water valve"]},
        {"name": "Electrical", "parts": ["Blower motor","Windshield wiper motors","Horn assembly","Starter motor and solenoid","Alternator and voltage regulator","Electronic ignition module","Engine wiring harness","Transmission wiring harness","Crankshaft angle sensor","Camshaft sensor","Knock sensor","Ignition switch and lock cylinder"]},
        {"name": "Front Suspension", "parts": ["Control arms (upper and lower)","Control arm bushings","Ball joints (upper and lower)","Steering knuckles","Tension struts","Variable damping suspension components","Front wheel bearings"]},
        {"name": "Rear Suspension", "parts": ["Control arms (upper and lower)","Control arm bushings","Ball joints","Torsion bar","Stabiliser bar","Spindles","Rear wheel bearings"]},
        {"name": "Fuel System", "parts": ["Fuel injectors","Fuel pressure regulator","Fuel pump","Fuel rails","Fuel injector lines","Vacuum pump","Fuel tank"]},
        {"name": "Power Steering", "parts": ["Power steering pump","Rack and pinion","Manual and power steering box","Electric power assist motor","Reservoir and pulley","Power steering hoses","Pitman arm","Idler arm","Inner and outer tie rod ends","Electronic control unit"]},
        {"name": "Fluids & Filters", "parts": ["Coolants","Refrigerants","Transmission fluid and filter","Engine oil and filter","Hydraulic fluid","Lubricants (included with every covered repair)"]},
        {"name": "Seals & Gaskets", "parts": ["Crankshaft seal (front and rear)","Camshaft seals","Cylinder head gaskets","Oil pan gasket","Timing cover gasket","Valve cover gasket","Intake manifold gaskets","Valve guide seals","Transmission/transaxle seals","Transfer case seals","Differential seals"]},
        {"name": "Wear & Tear", "parts": ["Covered parts within the powertrain"]}
      ],
      "exclusions": ["Axle seals","External linkages and shifters"],
      "termsSections": [
        {"title": "Coverage Limit", "content": "$5,000, $10,000, or $20,000 per claim. $150 deductible applies to all levels."},
        {"title": "Eligibility", "content": "Available for vehicles 7 years or newer and up to 225,000 km."},
        {"title": "Wear and Tear", "content": "Covered parts within the powertrain system are protected against normal wear and tear."},
        {"title": "Fluids and Filters", "content": "Every covered repair includes replacement of necessary lubricants including coolants, refrigerants, transmission fluid, engine oil, hydraulic fluid, and lubricants."},
        {"title": "Hi-Tech PLUS Option", "content": "Adds adaptive cruise control, blind spot monitoring, lane assist, collision avoidance, cameras, GPS modules, screens, heated seat/steering, TPMS, Wi-Fi, body/power control module, ECM/PCM, air ride suspension, airbag module, and emission controls."},
        {"title": "Premium Vehicle Fee ($20,000 plan)", "content": "Additional $999 fee for: Audi, BMW, Mini, Smart, Cadillac, Corvette, Jaguar, Mercedes, Saab, Volvo, Hummer, Tesla, Alfa Romeo, Dodge Viper, Range Rover/Land Rover, Maserati, Nissan GT-R and Porsche."},
        {"title": "Roadside Coverage", "content": "Up to $75.00 per occurrence (Maximum Limit: $225.00) for towing, fuel delivery, battery boost, lockout, tire change and winching."},
        {"title": "Trip Interruption", "content": "Up to $150.00 for lodging, meals, bus, taxi if repair facility is 200+ km from home."}
      ]
    }$j$::jsonb,
    $j${
      "deductible": "150",
      "rows": [
        {"label": "Drive to 105,000 km — 0-60k current",        "vehicleClass": "0 – 60,000 km",         "dealerCost": 549,  "suggestedRetail": 759},
        {"label": "Drive to 105,000 km — 60-85k current",       "vehicleClass": "60,001 – 85,000 km",    "dealerCost": 659,  "suggestedRetail": 909},
        {"label": "Drive to 125,000 km — 0-60k current",        "vehicleClass": "0 – 60,000 km",         "dealerCost": 669,  "suggestedRetail": 909},
        {"label": "Drive to 125,000 km — 60-105k current",      "vehicleClass": "60,001 – 105,000 km",   "dealerCost": 759,  "suggestedRetail": 1059},
        {"label": "Drive to 145,000 km — 0-60k current",        "vehicleClass": "0 – 60,000 km",         "dealerCost": 749,  "suggestedRetail": 1039},
        {"label": "Drive to 145,000 km — 60-125k current",      "vehicleClass": "60,001 – 125,000 km",   "dealerCost": 869,  "suggestedRetail": 1219},
        {"label": "Drive to 165,000 km — 0-60k current",        "vehicleClass": "0 – 60,000 km",         "dealerCost": 849,  "suggestedRetail": 1179},
        {"label": "Drive to 165,000 km — 60-105k current",      "vehicleClass": "60,001 – 105,000 km",   "dealerCost": 949,  "suggestedRetail": 1319},
        {"label": "Drive to 165,000 km — 105-145k current",     "vehicleClass": "105,001 – 145,000 km",  "dealerCost": 979,  "suggestedRetail": 1359},
        {"label": "Drive to 185,000 km — 0-60k current",        "vehicleClass": "0 – 60,000 km",         "dealerCost": 979,  "suggestedRetail": 1369},
        {"label": "Drive to 185,000 km — 60-105k current",      "vehicleClass": "60,001 – 105,000 km",   "dealerCost": 1109, "suggestedRetail": 1549},
        {"label": "Drive to 185,000 km — 105-165k current",     "vehicleClass": "105,001 – 165,000 km",  "dealerCost": 1149, "suggestedRetail": 1599},
        {"label": "Drive to 205,000 km — 0-60k current",        "vehicleClass": "0 – 60,000 km",         "dealerCost": 1269, "suggestedRetail": 1629},
        {"label": "Drive to 205,000 km — 60-105k current",      "vehicleClass": "60,001 – 105,000 km",   "dealerCost": 1299, "suggestedRetail": 1809},
        {"label": "Drive to 205,000 km — 105-145k current",     "vehicleClass": "105,001 – 145,000 km",  "dealerCost": 1359, "suggestedRetail": 1899},
        {"label": "Drive to 205,000 km — 145-185k current",     "vehicleClass": "145,001 – 185,000 km",  "dealerCost": 1439, "suggestedRetail": 2019},
        {"label": "Drive to 225,000 km — 0-60k current",        "vehicleClass": "0 – 60,000 km",         "dealerCost": 1199, "suggestedRetail": 1679},
        {"label": "Drive to 225,000 km — 60-105k current",      "vehicleClass": "60,001 – 105,000 km",   "dealerCost": 1359, "suggestedRetail": 1899},
        {"label": "Drive to 225,000 km — 105-165k current",     "vehicleClass": "105,001 – 165,000 km",  "dealerCost": 1479, "suggestedRetail": 2069},
        {"label": "Drive to 225,000 km — 165-205k current",     "vehicleClass": "165,001 – 205,000 km",  "dealerCost": 1599, "suggestedRetail": 2239},
        {"label": "Drive to 245,000 km — 0-60k current",        "vehicleClass": "0 – 60,000 km",         "dealerCost": 1319, "suggestedRetail": 1849},
        {"label": "Drive to 245,000 km — 60-105k current",      "vehicleClass": "60,001 – 105,000 km",   "dealerCost": 1479, "suggestedRetail": 2069},
        {"label": "Drive to 245,000 km — 105-165k current",     "vehicleClass": "105,001 – 165,000 km",  "dealerCost": 1599, "suggestedRetail": 2239},
        {"label": "Drive to 245,000 km — 165-225k current",     "vehicleClass": "165,001 – 225,000 km",  "dealerCost": 1849, "suggestedRetail": 3029}
      ],
      "benefits": [
        {"name": "Wear and Tear Coverage",    "description": "Covered powertrain parts protected against normal wear and tear", "limit": "Included"},
        {"name": "Fluids and Filters",        "description": "Every covered repair includes necessary lubricants, coolants, refrigerants, transmission fluid, and engine oil", "limit": "Included"},
        {"name": "Roadside Assistance",       "description": "Up to $75/occurrence (max $225) — towing, fuel delivery, battery boost, lockout, tire change", "limit": "$75/occurrence, $225 max"},
        {"name": "Towing Reimbursement",      "description": "Up to $60/day for towing due to a covered breakdown", "limit": "$60/day"},
        {"name": "Trip Interruption",         "description": "Up to $150 for lodging/meals/taxi if repair is 200+ km away", "limit": "$150 max"},
        {"name": "Free Diagnostics",          "description": "Free 30-min diagnostic at an A-Protect Authorized Repair Centre", "limit": "Pre-approval required"}
      ]
    }$j$::jsonb,
    '{"maxAge": "7", "maxMileage": 225000}'::jsonb, true);

  RAISE NOTICE 'Done — 7 A-Protect products inserted successfully';
END $$;
