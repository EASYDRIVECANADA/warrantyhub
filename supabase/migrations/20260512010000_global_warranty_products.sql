-- Global Warranty Protection Corporation - provider and product seed.
-- Source documents supplied May 2026:
--   Global Auto Brochure.pdf, Global Auto T&C.pdf,
--   Global Tire & Rim Brochure.pdf, Tire & Rim T&C.pdf,
--   Base Pricing Global Warranty.pdf (Confidential Dealer Price List, effective April 2022).
--
-- Safe to re-run: the provider rows are upserted and Global products are refreshed.

DO $$
DECLARE
  v_eid CONSTANT uuid := '9ca091d9-9f15-426e-88ea-d034a85d3114';
  v_company_id CONSTANT uuid := '30b8431a-879e-49a7-9b9c-889a836f0fec';
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
    address,
    notes
  )
  VALUES (
    v_company_id,
    'Global Warranty',
    'Global Warranty Protection Corporation',
    'WARRANTY_PROVIDER',
    'info@globalwarranty.com',
    'ACTIVE',
    '1-800-265-1519',
    '471 Waterloo St., London, ON N6B 2P4',
    'Seeded from Global Warranty product brochures and base dealer pricing.'
  )
  ON CONFLICT (id) DO UPDATE SET
    provider_company_name = excluded.provider_company_name,
    legal_business_name = excluded.legal_business_name,
    business_type = excluded.business_type,
    contact_email = excluded.contact_email,
    status = excluded.status,
    phone = excluded.phone,
    address = excluded.address,
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
    RAISE EXCEPTION 'No profiles found - cannot insert Global Warranty products';
  END IF;

  INSERT INTO public.providers (
    id,
    company_name,
    contact_email,
    contact_phone,
    address,
    regions_served,
    description,
    status
  )
  VALUES (
    v_eid,
    'Global Warranty',
    'info@globalwarranty.com',
    '1-800-265-1519',
    '471 Waterloo St., London, ON N6B 2P4',
    ARRAY['Canada'],
    'Canadian vehicle protection provider offering Ultimate Automotive Protection, Tire & Rim Protection, Global Glass Protection, GAP and related protection products.',
    'approved'
  )
  ON CONFLICT (id) DO UPDATE SET
    company_name = excluded.company_name,
    contact_email = excluded.contact_email,
    contact_phone = excluded.contact_phone,
    address = excluded.address,
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
    'Ultimate Automotive Protection',
    'VSC',
    $json$
    {
      "description": "Global Warranty vehicle service contract coverage for any year, any make and any model. Programs include Wear and Tear on all programs, Seals and Gaskets on covered parts, and Car Rental on all program levels.",
      "categories": [
        {
          "name": "Engine",
          "parts": ["Internally lubricated engine parts", "Engine block", "Cylinder heads", "Intake manifolds and plenums", "Exhaust manifolds", "Timing belt and cover", "Oil pan", "Valve covers", "Harmonic balancer and pulley", "Water pump", "Starter and solenoid", "Alternator and regulator", "Engine wiring harness"]
        },
        {
          "name": "Transmission",
          "parts": ["Automatic internally lubricated parts", "Transmission case", "Torque converter", "Oil pan", "Flex plate", "Transmission mounts", "Transmission cooler and lines", "Shift lever sub-assembly", "Transmission wiring harness", "Standard transmission internally lubricated parts"]
        },
        {
          "name": "Differential / Transfer Case",
          "parts": ["Front and rear differential internally lubricated parts", "Transfer case internally lubricated parts", "4x4 and AWD engagement components", "Auxiliary differential internally lubricated parts", "Viscous coupler"]
        },
        {
          "name": "Turbocharger / Supercharger",
          "parts": ["Turbocharger internal parts", "Housing", "Wastegate controller", "Intercooler", "Control module", "Hard lines", "Bearings", "Supercharger housing", "Compressor", "Clutch", "Pulley", "By-pass valve", "Coolant pump"]
        },
        {
          "name": "Seals and Gaskets",
          "parts": ["Seals and gaskets used within listed covered parts"]
        },
        {
          "name": "Wear and Tear",
          "parts": ["Listed part failures caused by wear and tear within the selected program level"]
        },
        {
          "name": "Silver Additions",
          "parts": ["Diagnostics at Global discretion, excluding the first hour", "Driveline", "Braking system", "Electrical system", "Power accessories", "Emissions"]
        },
        {
          "name": "Gold Additions",
          "parts": ["Air Conditioning", "Fuel and injection systems", "Steering systems", "Electronic Hi-Tech", "Advanced Driver Assistance Systems", "Air bags", "Optional Hybrid/Electric components", "Optional Diesel components"]
        },
        {
          "name": "Titanium Additions",
          "parts": ["Heating and cooling", "Suspension system", "Electronic modules and controls", "Sensors and switches"]
        },
        {
          "name": "Platinum Coverage",
          "parts": ["Bumper-to-bumper style coverage designed to match the vehicle original comprehensive warranty", "Includes the listed Bronze, Silver, Gold and Titanium systems plus additional factory-installed high-tech and luxury components"]
        },
        {
          "name": "Trip Interruption",
          "parts": ["Up to $1,000 maximum for the agreement coverage period", "Up to $250 per day for lodging, meals, bus or taxi when more than 150 km from home and same-day emergency repair service is unavailable"]
        },
        {
          "name": "Car Rental",
          "parts": ["Up to $350 maximum for the term", "Up to $70 per day while the covered vehicle is unavailable due to a covered repair exceeding 8 labour hours"]
        }
      ],
      "exclusions": [
        "Parts or services not specifically listed in the selected program level",
        "Maintenance services and normal maintenance parts",
        "Repairs made without Global authorization",
        "Failures caused by lack of maintenance, collision, fire, theft, vandalism, overheating, rust, corrosion, contamination, water, acts of God, salt or environmental damage",
        "Commercial use unless the Commercial Purposes option is selected"
      ],
      "termsSections": [
        {
          "title": "Deductible",
          "content": "$150 deductible on all programs unless the Zero Deductible option is selected."
        },
        {
          "title": "Limit of Liability",
          "content": "The individual claim limit is the lesser of the retail value of the covered vehicle or the amount listed on the registration page. The total claims limit is the retail value of the covered vehicle."
        },
        {
          "title": "Eligibility",
          "content": "Prices apply to passenger vehicles up to 1 ton, including branded/rebuilt vehicles. Class-based prices apply to Gold, Titanium and Platinum plans."
        },
        {
          "title": "Class 1 Makes",
          "content": "Buick, Chevrolet, Chrysler, Dodge, Fiat, Ford, GMC, Honda, Hyundai, Jeep, Kia, Mazda, Mitsubishi, Nissan, Ram, Subaru, Toyota and Volkswagen."
        },
        {
          "title": "Class 2 Makes",
          "content": "Acura, Cadillac, Genesis, Infiniti, Lexus, Lincoln, Mini and Volvo."
        },
        {
          "title": "Class 3 Makes",
          "content": "Alfa Romeo, Audi, BMW, Jaguar, Land Rover, Maserati, Mercedes-Benz, Porsche and Tesla. Limited production or exotic models require Global approval."
        },
        {
          "title": "Optional Coverage",
          "content": "Options include Ultimate Test Drive, 24/7 Global Roadside, Hybrid/Electric Vehicle, Diesel Components, Electronic Hi-Tech, Air Conditioning, Lift Kit, Commercial Purposes, Deferred start and Zero Deductible."
        }
      ]
    }
    $json$::jsonb,
    $json$
    {
      "deductible": "150",
      "source": "Global Warranty Confidential Dealer Price List, effective April 2022. No separate retail/MSRP sheet was supplied, so suggestedRetail initially matches dealerCost.",
      "rows": [
        { "label": "3 Months / 3,000 km", "vehicleClass": "Bronze - $1,000 Per Claim", "dealerCost": 149, "suggestedRetail": 149 },
        { "label": "6 Months / 6,000 km", "vehicleClass": "Bronze - $1,000 Per Claim", "dealerCost": 159, "suggestedRetail": 159 },
        { "label": "6 Months / Unlimited km", "vehicleClass": "Bronze - $1,000 Per Claim", "dealerCost": 199, "suggestedRetail": 199 },
        { "label": "12 Months / Unlimited km", "vehicleClass": "Bronze - $3,000 Per Claim", "dealerCost": 399, "suggestedRetail": 399 },
        { "label": "24 Months / Unlimited km", "vehicleClass": "Bronze - $3,000 Per Claim", "dealerCost": 529, "suggestedRetail": 529 },
        { "label": "36 Months / 60,000 km", "vehicleClass": "Bronze - $3,000 Per Claim", "dealerCost": 689, "suggestedRetail": 689 },

        { "label": "12 Months / Unlimited km", "vehicleClass": "Silver - $3,000 Per Claim", "dealerCost": 509, "suggestedRetail": 509 },
        { "label": "24 Months / 40,000 km", "vehicleClass": "Silver - $3,000 Per Claim", "dealerCost": 689, "suggestedRetail": 689 },
        { "label": "36 Months / 60,000 km", "vehicleClass": "Silver - $3,000 Per Claim", "dealerCost": 899, "suggestedRetail": 899 },

        { "label": "12 Months / 20,000 km", "vehicleClass": "Class 1 \u00b7 Gold - $4,000 Per Claim", "dealerCost": 699, "suggestedRetail": 699 },
        { "label": "12 Months / 20,000 km", "vehicleClass": "Class 2 \u00b7 Gold - $4,000 Per Claim", "dealerCost": 769, "suggestedRetail": 769 },
        { "label": "12 Months / 20,000 km", "vehicleClass": "Class 3 \u00b7 Gold - $4,000 Per Claim", "dealerCost": 839, "suggestedRetail": 839 },
        { "label": "24 Months / 40,000 km", "vehicleClass": "Class 1 \u00b7 Gold - $4,000 Per Claim", "dealerCost": 849, "suggestedRetail": 849 },
        { "label": "24 Months / 40,000 km", "vehicleClass": "Class 2 \u00b7 Gold - $4,000 Per Claim", "dealerCost": 929, "suggestedRetail": 929 },
        { "label": "24 Months / 40,000 km", "vehicleClass": "Class 3 \u00b7 Gold - $4,000 Per Claim", "dealerCost": 1019, "suggestedRetail": 1019 },
        { "label": "36 Months / 60,000 km", "vehicleClass": "Class 1 \u00b7 Gold - $4,000 Per Claim", "dealerCost": 1059, "suggestedRetail": 1059 },
        { "label": "36 Months / 60,000 km", "vehicleClass": "Class 2 \u00b7 Gold - $4,000 Per Claim", "dealerCost": 1169, "suggestedRetail": 1169 },
        { "label": "36 Months / 60,000 km", "vehicleClass": "Class 3 \u00b7 Gold - $4,000 Per Claim", "dealerCost": 1269, "suggestedRetail": 1269 },
        { "label": "48 Months / 80,000 km", "vehicleClass": "Class 1 \u00b7 Gold - $4,000 Per Claim", "dealerCost": 1319, "suggestedRetail": 1319 },
        { "label": "48 Months / 80,000 km", "vehicleClass": "Class 2 \u00b7 Gold - $4,000 Per Claim", "dealerCost": 1459, "suggestedRetail": 1459 },
        { "label": "48 Months / 80,000 km", "vehicleClass": "Class 3 \u00b7 Gold - $4,000 Per Claim", "dealerCost": 1589, "suggestedRetail": 1589 },

        { "label": "12 Months / 20,000 km", "vehicleClass": "Class 1 \u00b7 Titanium - $5,000 Per Claim", "dealerCost": 1099, "suggestedRetail": 1099 },
        { "label": "12 Months / 20,000 km", "vehicleClass": "Class 2 \u00b7 Titanium - $5,000 Per Claim", "dealerCost": 1209, "suggestedRetail": 1209 },
        { "label": "12 Months / 20,000 km", "vehicleClass": "Class 3 \u00b7 Titanium - $5,000 Per Claim", "dealerCost": 1319, "suggestedRetail": 1319 },
        { "label": "24 Months / 40,000 km", "vehicleClass": "Class 1 \u00b7 Titanium - $5,000 Per Claim", "dealerCost": 1499, "suggestedRetail": 1499 },
        { "label": "24 Months / 40,000 km", "vehicleClass": "Class 2 \u00b7 Titanium - $5,000 Per Claim", "dealerCost": 1649, "suggestedRetail": 1649 },
        { "label": "24 Months / 40,000 km", "vehicleClass": "Class 3 \u00b7 Titanium - $5,000 Per Claim", "dealerCost": 1799, "suggestedRetail": 1799 },
        { "label": "36 Months / 60,000 km", "vehicleClass": "Class 1 \u00b7 Titanium - $5,000 Per Claim", "dealerCost": 1899, "suggestedRetail": 1899 },
        { "label": "36 Months / 60,000 km", "vehicleClass": "Class 2 \u00b7 Titanium - $5,000 Per Claim", "dealerCost": 2089, "suggestedRetail": 2089 },
        { "label": "36 Months / 60,000 km", "vehicleClass": "Class 3 \u00b7 Titanium - $5,000 Per Claim", "dealerCost": 2279, "suggestedRetail": 2279 },
        { "label": "48 Months / 80,000 km", "vehicleClass": "Class 1 \u00b7 Titanium - $5,000 Per Claim", "dealerCost": 2119, "suggestedRetail": 2119 },
        { "label": "48 Months / 80,000 km", "vehicleClass": "Class 2 \u00b7 Titanium - $5,000 Per Claim", "dealerCost": 2329, "suggestedRetail": 2329 },
        { "label": "48 Months / 80,000 km", "vehicleClass": "Class 3 \u00b7 Titanium - $5,000 Per Claim", "dealerCost": 2539, "suggestedRetail": 2539 },

        { "label": "12 Months / 20,000 km", "vehicleClass": "Class 1 \u00b7 Platinum - $5,000 Per Claim", "dealerCost": 2099, "suggestedRetail": 2099 },
        { "label": "12 Months / 20,000 km", "vehicleClass": "Class 2 \u00b7 Platinum - $5,000 Per Claim", "dealerCost": 2459, "suggestedRetail": 2459 },
        { "label": "12 Months / 20,000 km", "vehicleClass": "Class 3 \u00b7 Platinum - $5,000 Per Claim", "dealerCost": 2669, "suggestedRetail": 2669 },
        { "label": "24 Months / 40,000 km", "vehicleClass": "Class 1 \u00b7 Platinum - $5,000 Per Claim", "dealerCost": 2499, "suggestedRetail": 2499 },
        { "label": "24 Months / 40,000 km", "vehicleClass": "Class 2 \u00b7 Platinum - $5,000 Per Claim", "dealerCost": 2929, "suggestedRetail": 2929 },
        { "label": "24 Months / 40,000 km", "vehicleClass": "Class 3 \u00b7 Platinum - $5,000 Per Claim", "dealerCost": 3179, "suggestedRetail": 3179 },
        { "label": "36 Months / 60,000 km", "vehicleClass": "Class 1 \u00b7 Platinum - $5,000 Per Claim", "dealerCost": 2899, "suggestedRetail": 2899 },
        { "label": "36 Months / 60,000 km", "vehicleClass": "Class 2 \u00b7 Platinum - $5,000 Per Claim", "dealerCost": 3399, "suggestedRetail": 3399 },
        { "label": "36 Months / 60,000 km", "vehicleClass": "Class 3 \u00b7 Platinum - $5,000 Per Claim", "dealerCost": 3679, "suggestedRetail": 3679 },
        { "label": "48 Months / 80,000 km", "vehicleClass": "Class 1 \u00b7 Platinum - $5,000 Per Claim", "dealerCost": 3299, "suggestedRetail": 3299 },
        { "label": "48 Months / 80,000 km", "vehicleClass": "Class 2 \u00b7 Platinum - $5,000 Per Claim", "dealerCost": 3859, "suggestedRetail": 3859 },
        { "label": "48 Months / 80,000 km", "vehicleClass": "Class 3 \u00b7 Platinum - $5,000 Per Claim", "dealerCost": 4189, "suggestedRetail": 4189 }
      ],
      "benefits": [
        { "name": "Wear and Tear", "description": "Wear and Tear covered on all programs.", "limit": "Included" },
        { "name": "Seals and Gaskets", "description": "Seals and gaskets covered on all covered parts.", "limit": "Included" },
        { "name": "Car Rental", "description": "Rental reimbursement while a covered repair exceeds 8 labour hours.", "limit": "$70/day, $350 max" },
        { "name": "Trip Interruption", "description": "Lodging, meals, bus or taxi when more than 150 km from home and emergency repair service is unavailable.", "limit": "$250/day, $1,000 max" },
        { "name": "Optional Roadside", "description": "24/7 Global Roadside is available throughout Canada and the USA.", "limit": "Optional" }
      ]
    }
    $json$::jsonb,
    '{"vehicleClasses":["Class 1","Class 2","Class 3"]}'::jsonb,
    true
  ),
  (
    v_eid,
    v_pid,
    'Ultimate Tire & Rim Protection',
    'Tire & Rim',
    $json$
    {
      "description": "Global Tire & Rim protection with Bronze, Silver, Gold, Platinum and Appearance Protection levels. Coverage can include tire and wheel road hazard protection, cosmetic rim repair, key/remote replacement, car rental, glass and lens repair, paintless dent repair, and upholstered seat protection.",
      "categories": [
        {
          "name": "Bronze Tire & Rim",
          "parts": ["Flat tire repair up to $80 per occurrence", "Tire replacement including snow tires up to $2,000 for the coverage period", "Additional run-flat tire reimbursement up to $3,000 for the coverage period", "Wheel replacement up to four alloy wheels for the coverage period", "Mounting, balancing, valve stems and tire disposal for covered tire replacement"]
        },
        {
          "name": "Silver Tire & Rim",
          "parts": ["Bronze coverage", "Cosmetic alloy wheel repair for covered scratches, scuffs and curb rash"]
        },
        {
          "name": "Gold Tire & Rim",
          "parts": ["Silver coverage", "Key and remote replacement up to $800 per year and $1,600 for the coverage period", "Car rental up to $70 per occurrence when covered repair labour exceeds 8 hours"]
        },
        {
          "name": "Platinum Tire & Rim",
          "parts": ["Gold coverage", "Windshield repair up to $300 per occurrence and $1,000 for the coverage period", "Headlight, taillight, fog light and driving light lens repair", "Paintless dent and scratch repair up to $300 per occurrence and $1,000 for the coverage period", "Rip, tear, burn and puncture repair up to $150 per occurrence and $600 for the coverage period"]
        },
        {
          "name": "Appearance Protection",
          "parts": ["Glass and plexiglass repair", "Windshield repair or replacement deductible", "Paintless dent repair", "Key/remote replacement", "Upholstered seat protection"]
        }
      ],
      "exclusions": [
        "Damage outside Canada or the United States",
        "Damage caused by improper tire inflation or tire tread depth of 3/32 inch or less",
        "Damage not caused by a covered road hazard",
        "Commercial use unless the applicable commercial use option is selected",
        "Off-road use, racing, collision, fire, theft, vandalism, rust, corrosion, contamination, water, acts of God or environmental damage"
      ],
      "termsSections": [
        {
          "title": "Eligible Vehicles",
          "content": "The covered vehicle must be within the current model year up to a maximum of ten prior model years at the time of purchase or lease."
        },
        {
          "title": "Available Terms",
          "content": "Plan durations shown in the brochure are 12, 24, 36, 48, 60, 72 and 84 months."
        },
        {
          "title": "Road Hazard",
          "content": "A condition on a public roadway or parking lot that should not normally exist there, such as potholes, nails, glass or other road debris."
        },
        {
          "title": "Commercial Use Option",
          "content": "Commercial purpose options are available for light, medium and heavy duty uses as described by Global."
        }
      ]
    }
    $json$::jsonb,
    $json$
    {
      "deductible": "0",
      "source": "Global Tire & Rim brochure and terms. No Tire & Rim price table was supplied.",
      "rows": [
        { "label": "12 Months", "vehicleClass": "Bronze", "dealerCost": "n/a", "suggestedRetail": "n/a", "priceStatus": "Pricing not supplied" },
        { "label": "24 Months", "vehicleClass": "Bronze", "dealerCost": "n/a", "suggestedRetail": "n/a", "priceStatus": "Pricing not supplied" },
        { "label": "36 Months", "vehicleClass": "Bronze", "dealerCost": "n/a", "suggestedRetail": "n/a", "priceStatus": "Pricing not supplied" },
        { "label": "48 Months", "vehicleClass": "Bronze", "dealerCost": "n/a", "suggestedRetail": "n/a", "priceStatus": "Pricing not supplied" },
        { "label": "60 Months", "vehicleClass": "Bronze", "dealerCost": "n/a", "suggestedRetail": "n/a", "priceStatus": "Pricing not supplied" },
        { "label": "72 Months", "vehicleClass": "Bronze", "dealerCost": "n/a", "suggestedRetail": "n/a", "priceStatus": "Pricing not supplied" },
        { "label": "84 Months", "vehicleClass": "Bronze", "dealerCost": "n/a", "suggestedRetail": "n/a", "priceStatus": "Pricing not supplied" },

        { "label": "12 Months", "vehicleClass": "Silver", "dealerCost": "n/a", "suggestedRetail": "n/a", "priceStatus": "Pricing not supplied" },
        { "label": "24 Months", "vehicleClass": "Silver", "dealerCost": "n/a", "suggestedRetail": "n/a", "priceStatus": "Pricing not supplied" },
        { "label": "36 Months", "vehicleClass": "Silver", "dealerCost": "n/a", "suggestedRetail": "n/a", "priceStatus": "Pricing not supplied" },
        { "label": "48 Months", "vehicleClass": "Silver", "dealerCost": "n/a", "suggestedRetail": "n/a", "priceStatus": "Pricing not supplied" },
        { "label": "60 Months", "vehicleClass": "Silver", "dealerCost": "n/a", "suggestedRetail": "n/a", "priceStatus": "Pricing not supplied" },
        { "label": "72 Months", "vehicleClass": "Silver", "dealerCost": "n/a", "suggestedRetail": "n/a", "priceStatus": "Pricing not supplied" },
        { "label": "84 Months", "vehicleClass": "Silver", "dealerCost": "n/a", "suggestedRetail": "n/a", "priceStatus": "Pricing not supplied" },

        { "label": "12 Months", "vehicleClass": "Gold", "dealerCost": "n/a", "suggestedRetail": "n/a", "priceStatus": "Pricing not supplied" },
        { "label": "24 Months", "vehicleClass": "Gold", "dealerCost": "n/a", "suggestedRetail": "n/a", "priceStatus": "Pricing not supplied" },
        { "label": "36 Months", "vehicleClass": "Gold", "dealerCost": "n/a", "suggestedRetail": "n/a", "priceStatus": "Pricing not supplied" },
        { "label": "48 Months", "vehicleClass": "Gold", "dealerCost": "n/a", "suggestedRetail": "n/a", "priceStatus": "Pricing not supplied" },
        { "label": "60 Months", "vehicleClass": "Gold", "dealerCost": "n/a", "suggestedRetail": "n/a", "priceStatus": "Pricing not supplied" },
        { "label": "72 Months", "vehicleClass": "Gold", "dealerCost": "n/a", "suggestedRetail": "n/a", "priceStatus": "Pricing not supplied" },
        { "label": "84 Months", "vehicleClass": "Gold", "dealerCost": "n/a", "suggestedRetail": "n/a", "priceStatus": "Pricing not supplied" },

        { "label": "12 Months", "vehicleClass": "Platinum", "dealerCost": "n/a", "suggestedRetail": "n/a", "priceStatus": "Pricing not supplied" },
        { "label": "24 Months", "vehicleClass": "Platinum", "dealerCost": "n/a", "suggestedRetail": "n/a", "priceStatus": "Pricing not supplied" },
        { "label": "36 Months", "vehicleClass": "Platinum", "dealerCost": "n/a", "suggestedRetail": "n/a", "priceStatus": "Pricing not supplied" },
        { "label": "48 Months", "vehicleClass": "Platinum", "dealerCost": "n/a", "suggestedRetail": "n/a", "priceStatus": "Pricing not supplied" },
        { "label": "60 Months", "vehicleClass": "Platinum", "dealerCost": "n/a", "suggestedRetail": "n/a", "priceStatus": "Pricing not supplied" },
        { "label": "72 Months", "vehicleClass": "Platinum", "dealerCost": "n/a", "suggestedRetail": "n/a", "priceStatus": "Pricing not supplied" },
        { "label": "84 Months", "vehicleClass": "Platinum", "dealerCost": "n/a", "suggestedRetail": "n/a", "priceStatus": "Pricing not supplied" },

        { "label": "12 Months", "vehicleClass": "Appearance Protection", "dealerCost": "n/a", "suggestedRetail": "n/a", "priceStatus": "Pricing not supplied" },
        { "label": "24 Months", "vehicleClass": "Appearance Protection", "dealerCost": "n/a", "suggestedRetail": "n/a", "priceStatus": "Pricing not supplied" },
        { "label": "36 Months", "vehicleClass": "Appearance Protection", "dealerCost": "n/a", "suggestedRetail": "n/a", "priceStatus": "Pricing not supplied" },
        { "label": "48 Months", "vehicleClass": "Appearance Protection", "dealerCost": "n/a", "suggestedRetail": "n/a", "priceStatus": "Pricing not supplied" },
        { "label": "60 Months", "vehicleClass": "Appearance Protection", "dealerCost": "n/a", "suggestedRetail": "n/a", "priceStatus": "Pricing not supplied" },
        { "label": "72 Months", "vehicleClass": "Appearance Protection", "dealerCost": "n/a", "suggestedRetail": "n/a", "priceStatus": "Pricing not supplied" },
        { "label": "84 Months", "vehicleClass": "Appearance Protection", "dealerCost": "n/a", "suggestedRetail": "n/a", "priceStatus": "Pricing not supplied" }
      ],
      "benefits": [
        { "name": "Tire Replacement", "description": "Tire replacement including snow tires for unrepairable road hazard damage.", "limit": "$2,000 term max" },
        { "name": "Run Flat Tires", "description": "Additional reimbursement when the covered vehicle is equipped with run-flat tires.", "limit": "$3,000 term max" },
        { "name": "Key/Remote Replacement", "description": "Included on Gold and Platinum levels.", "limit": "$800/year, $1,600 term max" },
        { "name": "Car Rental", "description": "Included on Gold and Platinum levels when covered repair labour exceeds 8 hours.", "limit": "$70/occurrence" },
        { "name": "Windshield Repair", "description": "Included on Platinum level.", "limit": "$300/occurrence, $1,000 term max" },
        { "name": "Paintless Dent Repair", "description": "Included on Platinum and Appearance Protection levels.", "limit": "$300/occurrence, $1,000 term max" }
      ]
    }
    $json$::jsonb,
    '{"maxAge":"10"}'::jsonb,
    true
  );
END $$;
