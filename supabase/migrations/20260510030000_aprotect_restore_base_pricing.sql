-- Restore A-Protect base pricing rows while preserving add-on rows.
-- The add-on migration intentionally filters add-ons from base pricing consumers;
-- these VSC products need their original base rows present before add-ons.

DO $$
DECLARE
  v_eid CONSTANT uuid := '01c7fc25-cc8a-4814-b4e0-ae80f66d865b';
BEGIN
  CREATE TEMP TABLE tmp_aprotect_base_pricing (
    seq integer NOT NULL,
    product_name text NOT NULL,
    tier text NOT NULL,
    term_label text NOT NULL,
    dealer_cost numeric NOT NULL,
    suggested_retail numeric NOT NULL
  ) ON COMMIT DROP;

  INSERT INTO tmp_aprotect_base_pricing(seq, product_name, tier, term_label, dealer_cost, suggested_retail)
  VALUES
    (1, 'Powertrain Warranty', 'Bronze - $750 Per Claim', '3 Months / 3,000 km', 59, 559),
    (2, 'Powertrain Warranty', 'Bronze - $750 Per Claim', '6 Months / 6,000 km', 69, 569),
    (3, 'Powertrain Warranty', 'Bronze - $750 Per Claim', '12 Months / 12,000 km', 89, 589),
    (4, 'Powertrain Warranty', 'Bronze - $750 Per Claim', '24 Months / 24,000 km', 109, 609),
    (5, 'Powertrain Warranty', 'Bronze - $750 Per Claim', '36 Months / 36,000 km', 129, 629),
    (6, 'Powertrain Warranty', 'Silver - $1,000 Per Claim', '3 Months / 3,000 km', 79, 579),
    (7, 'Powertrain Warranty', 'Silver - $1,000 Per Claim', '6 Months / 6,000 km', 89, 589),
    (8, 'Powertrain Warranty', 'Silver - $1,000 Per Claim', '12 Months / 12,000 km', 129, 629),
    (9, 'Powertrain Warranty', 'Silver - $1,000 Per Claim', '24 Months / 24,000 km', 159, 659),
    (10, 'Powertrain Warranty', 'Silver - $1,000 Per Claim', '36 Months / 36,000 km', 189, 689),
    (11, 'Powertrain Warranty', 'Gold - $1,500 Per Claim', '3 Months / Unlimited km', 99, 599),
    (12, 'Powertrain Warranty', 'Gold - $1,500 Per Claim', '6 Months / Unlimited km', 149, 649),
    (13, 'Powertrain Warranty', 'Gold - $1,500 Per Claim', '12 Months / 20,000 km', 189, 689),
    (14, 'Powertrain Warranty', 'Gold - $1,500 Per Claim', '24 Months / 40,000 km', 249, 749),
    (15, 'Powertrain Warranty', 'Gold - $1,500 Per Claim', '36 Months / 60,000 km', 279, 779),
    (16, 'Powertrain Warranty', 'Platinum - $2,500 Per Claim', '6 Months / Unlimited km', 189, 689),
    (17, 'Powertrain Warranty', 'Platinum - $2,500 Per Claim', '12 Months / 20,000 km', 249, 749),
    (18, 'Powertrain Warranty', 'Platinum - $2,500 Per Claim', '24 Months / 40,000 km', 319, 819),
    (19, 'Powertrain Warranty', 'Platinum - $2,500 Per Claim', '36 Months / 60,000 km', 389, 889),
    (20, 'Powertrain Warranty', 'Platinum - $2,500 Per Claim', '48 Months / 80,000 km', 489, 989),
    (21, 'Powertrain Warranty', '$3,000 Per Claim', '12 Months / 20,000 km', 299, 999),
    (22, 'Powertrain Warranty', '$3,000 Per Claim', '24 Months / 40,000 km', 399, 1099),
    (23, 'Powertrain Warranty', '$3,000 Per Claim', '36 Months / 60,000 km', 549, 1249),
    (24, 'Powertrain Warranty', '$3,000 Per Claim', '48 Months / 80,000 km', 609, 1309),
    (25, 'Essential Warranty', '$1,000 Per Claim', '12 Months / 20,000 km', 189, 889),
    (26, 'Essential Warranty', '$1,000 Per Claim', '24 Months / 40,000 km', 219, 919),
    (27, 'Essential Warranty', '$1,000 Per Claim', '36 Months / 60,000 km', 259, 959),
    (28, 'Essential Warranty', '$1,000 Per Claim', '48 Months / 80,000 km', 369, 1069),
    (29, 'Essential Warranty', '$1,500 Per Claim', '12 Months / 20,000 km', 219, 919),
    (30, 'Essential Warranty', '$1,500 Per Claim', '24 Months / 40,000 km', 309, 1009),
    (31, 'Essential Warranty', '$1,500 Per Claim', '36 Months / 60,000 km', 379, 1079),
    (32, 'Essential Warranty', '$1,500 Per Claim', '48 Months / 80,000 km', 489, 1189),
    (33, 'Essential Warranty', '$3,000 Per Claim', '12 Months / 20,000 km', 369, 1369),
    (34, 'Essential Warranty', '$3,000 Per Claim', '24 Months / 40,000 km', 479, 1479),
    (35, 'Essential Warranty', '$3,000 Per Claim', '36 Months / 60,000 km', 659, 1659),
    (36, 'Essential Warranty', '$3,000 Per Claim', '48 Months / 80,000 km', 769, 1769),
    (37, 'Essential Warranty', '$5,000 Per Claim (up to 220k km)', '12 Months / 20,000 km', 529, 1729),
    (38, 'Essential Warranty', '$5,000 Per Claim (up to 220k km)', '24 Months / 40,000 km', 649, 1849),
    (39, 'Essential Warranty', '$5,000 Per Claim (up to 220k km)', '36 Months / 60,000 km', 759, 1959),
    (40, 'Essential Warranty', '$5,000 Per Claim (up to 220k km)', '48 Months / 80,000 km', 959, 2159),
    (41, 'Essential Warranty', '$7,500 Per Claim (up to 220k km)', '24 Months / 40,000 km', 779, 2279),
    (42, 'Essential Warranty', '$7,500 Per Claim (up to 220k km)', '36 Months / 60,000 km', 909, 2409),
    (43, 'Essential Warranty', '$7,500 Per Claim (up to 220k km)', '48 Months / 80,000 km', 1139, 2639),
    (44, 'Essential Warranty', '$10,000 Per Claim (up to 220k km)', '24 Months / 40,000 km', 899, 2399),
    (45, 'Essential Warranty', '$10,000 Per Claim (up to 220k km)', '36 Months / 60,000 km', 1059, 2559),
    (46, 'Essential Warranty', '$10,000 Per Claim (up to 220k km)', '48 Months / 80,000 km', 1309, 2809),
    (47, 'Premium Special Warranty', '$3,000 Per Claim', '3 Months / Unlimited km', 189, 1389),
    (48, 'Premium Special Warranty', '$3,000 Per Claim', '6 Months / Unlimited km', 339, 1539),
    (49, 'Premium Special Warranty', '$3,000 Per Claim', '12 Months / 20,000 km', 479, 1679),
    (50, 'Premium Special Warranty', '$3,000 Per Claim', '24 Months / 40,000 km', 619, 1819),
    (51, 'Premium Special Warranty', '$3,000 Per Claim', '36 Months / 60,000 km', 739, 1939),
    (52, 'Premium Special Warranty', '$3,000 Per Claim', '48 Months / 80,000 km', 899, 2099),
    (53, 'Premium Special Warranty', '$4,000 Per Claim (up to 220k km)', '12 Months / 20,000 km', 639, 2139),
    (54, 'Premium Special Warranty', '$4,000 Per Claim (up to 220k km)', '24 Months / 40,000 km', 739, 2239),
    (55, 'Premium Special Warranty', '$4,000 Per Claim (up to 220k km)', '36 Months / 70,000 km', 889, 2389),
    (56, 'Premium Special Warranty', '$4,000 Per Claim (up to 220k km)', '48 Months / 90,000 km', 1129, 2589),
    (57, 'Premium Special Warranty', '$5,000 Per Claim (up to 220k km)', '12 Months / 20,000 km', 699, 2199),
    (58, 'Premium Special Warranty', '$5,000 Per Claim (up to 220k km)', '24 Months / 40,000 km', 789, 2289),
    (59, 'Premium Special Warranty', '$5,000 Per Claim (up to 220k km)', '36 Months / 70,000 km', 939, 2439),
    (60, 'Premium Special Warranty', '$5,000 Per Claim (up to 220k km)', '48 Months / 90,000 km', 1249, 2749),
    (61, 'Luxury Warranty', '$1,000 Per Claim', '3 Months / 3,000 km', 119, 819),
    (62, 'Luxury Warranty', '$1,000 Per Claim', '6 Months / 6,000 km', 209, 909),
    (63, 'Luxury Warranty', '$1,000 Per Claim', '12 Months / 12,000 km', 279, 1279),
    (64, 'Luxury Warranty', '$1,000 Per Claim', '24 Months / 24,000 km', 329, 1329),
    (65, 'Luxury Warranty', '$1,000 Per Claim', '36 Months / 36,000 km', 399, 1399),
    (66, 'Luxury Warranty', '$1,500 Per Claim', '3 Months / 3,000 km', 189, 889),
    (67, 'Luxury Warranty', '$1,500 Per Claim', '6 Months / 6,000 km', 289, 989),
    (68, 'Luxury Warranty', '$1,500 Per Claim', '12 Months / 12,000 km', 319, 1319),
    (69, 'Luxury Warranty', '$1,500 Per Claim', '24 Months / 24,000 km', 379, 1379),
    (70, 'Luxury Warranty', '$1,500 Per Claim', '36 Months / 36,000 km', 459, 1459),
    (71, 'Luxury Warranty', '$2,500 Per Claim', '6 Months / Unlimited km', 349, 1049),
    (72, 'Luxury Warranty', '$2,500 Per Claim', '12 Months / 20,000 km', 479, 1479),
    (73, 'Luxury Warranty', '$2,500 Per Claim', '24 Months / 40,000 km', 629, 1629),
    (74, 'Luxury Warranty', '$2,500 Per Claim', '36 Months / 60,000 km', 779, 1779),
    (75, 'Luxury Warranty', '$3,000 Per Claim', '12 Months / 20,000 km', 789, 1989),
    (76, 'Luxury Warranty', '$3,000 Per Claim', '24 Months / 40,000 km', 849, 2349),
    (77, 'Luxury Warranty', '$3,000 Per Claim', '36 Months / 60,000 km', 1189, 2689),
    (78, 'Diamond Plus Warranty', '0–60,000 km · $5,000/claim', '12 Months / Unlimited km', 819, 3279),
    (79, 'Diamond Plus Warranty', '0–60,000 km · $5,000/claim', '24 Months / Unlimited km', 919, 3379),
    (80, 'Diamond Plus Warranty', '0–60,000 km · $5,000/claim', '36 Months / 70,000 km', 1029, 3479),
    (81, 'Diamond Plus Warranty', '0–60,000 km · $5,000/claim', '48 Months / 90,000 km', 1149, 3599),
    (82, 'Diamond Plus Warranty', '60,001–100,000 km · $5,000/claim', '12 Months / Unlimited km', 1129, 3579),
    (83, 'Diamond Plus Warranty', '60,001–100,000 km · $5,000/claim', '24 Months / Unlimited km', 1299, 3739),
    (84, 'Diamond Plus Warranty', '60,001–100,000 km · $5,000/claim', '36 Months / 70,000 km', 1409, 3839),
    (85, 'Diamond Plus Warranty', '60,001–100,000 km · $5,000/claim', '48 Months / 90,000 km', 1629, 4049),
    (86, 'Diamond Plus Warranty', '100,001–160,000 km · $5,000/claim', '12 Months / Unlimited km', 1279, 3719),
    (87, 'Diamond Plus Warranty', '100,001–160,000 km · $5,000/claim', '24 Months / Unlimited km', 1549, 3979),
    (88, 'Diamond Plus Warranty', '100,001–160,000 km · $5,000/claim', '36 Months / 70,000 km', 1659, 4079),
    (89, 'Diamond Plus Warranty', '100,001–160,000 km · $5,000/claim', '48 Months / 90,000 km', 1969, 4379),
    (90, 'Diamond Plus Warranty', '0–60,000 km · $7,500/claim', '24 Months / 40,000 km', 989, 3489),
    (91, 'Diamond Plus Warranty', '0–60,000 km · $7,500/claim', '36 Months / 70,000 km', 1089, 3589),
    (92, 'Diamond Plus Warranty', '0–60,000 km · $7,500/claim', '48 Months / 90,000 km', 1299, 3799),
    (93, 'Diamond Plus Warranty', '60,001–100,000 km · $7,500/claim', '24 Months / 40,000 km', 1349, 3849),
    (94, 'Diamond Plus Warranty', '60,001–100,000 km · $7,500/claim', '36 Months / 70,000 km', 1509, 4009),
    (95, 'Diamond Plus Warranty', '60,001–100,000 km · $7,500/claim', '48 Months / 90,000 km', 1749, 4249),
    (96, 'Diamond Plus Warranty', '100,001–160,000 km · $7,500/claim', '24 Months / 40,000 km', 1639, 4139),
    (97, 'Diamond Plus Warranty', '100,001–160,000 km · $7,500/claim', '36 Months / 70,000 km', 1764, 4264),
    (98, 'Diamond Plus Warranty', '100,001–160,000 km · $7,500/claim', '48 Months / 90,000 km', 2264, 4764),
    (99, 'Diamond Plus Warranty', '0–60,000 km · $10,000/claim', '24 Months / 40,000 km', 1099, 4099),
    (100, 'Diamond Plus Warranty', '0–60,000 km · $10,000/claim', '36 Months / 70,000 km', 1199, 4199),
    (101, 'Diamond Plus Warranty', '0–60,000 km · $10,000/claim', '48 Months / 90,000 km', 1499, 4499),
    (102, 'Diamond Plus Warranty', '60,001–100,000 km · $10,000/claim', '24 Months / 40,000 km', 1459, 4459),
    (103, 'Diamond Plus Warranty', '60,001–100,000 km · $10,000/claim', '36 Months / 70,000 km', 1679, 4679),
    (104, 'Diamond Plus Warranty', '60,001–100,000 km · $10,000/claim', '48 Months / 90,000 km', 1949, 4949),
    (105, 'Diamond Plus Warranty', '100,001–160,000 km · $10,000/claim', '24 Months / 40,000 km', 1799, 4799),
    (106, 'Diamond Plus Warranty', '100,001–160,000 km · $10,000/claim', '36 Months / 70,000 km', 1949, 4949),
    (107, 'Diamond Plus Warranty', '100,001–160,000 km · $10,000/claim', '48 Months / 90,000 km', 2649, 5649),
    (108, 'Diamond Plus Warranty', '0–60,000 km · $20,000/claim', '24 Months / 40,000 km', 1679, 4679),
    (109, 'Diamond Plus Warranty', '0–60,000 km · $20,000/claim', '36 Months / 70,000 km', 1789, 4789),
    (110, 'Diamond Plus Warranty', '0–60,000 km · $20,000/claim', '48 Months / 90,000 km', 2179, 5179),
    (111, 'Diamond Plus Warranty', '60,001–100,000 km · $20,000/claim', '24 Months / 40,000 km', 2059, 5059),
    (112, 'Diamond Plus Warranty', '60,001–100,000 km · $20,000/claim', '36 Months / 70,000 km', 2289, 5289),
    (113, 'Diamond Plus Warranty', '60,001–100,000 km · $20,000/claim', '48 Months / 90,000 km', 2659, 5659),
    (114, 'Diamond Plus Warranty', '100,001–160,000 km · $20,000/claim', '24 Months / 40,000 km', 2409, 5409),
    (115, 'Diamond Plus Warranty', '100,001–160,000 km · $20,000/claim', '36 Months / 70,000 km', 2559, 5559),
    (116, 'Diamond Plus Warranty', '100,001–160,000 km · $20,000/claim', '48 Months / 90,000 km', 3399, 6399),
    (117, 'Driver Program', '$1,500 Per Claim', '12 Months / Unlimited km', 399, 1399),
    (118, 'Driver Program', '$1,500 Per Claim', '24 Months / 60,000 km', 499, 1499),
    (119, 'Driver Program', '$1,500 Per Claim', '36 Months / 90,000 km', 599, 1599),
    (120, 'Driver Program', '$3,000 Per Claim', '12 Months / Unlimited km', 599, 1599),
    (121, 'Driver Program', '$3,000 Per Claim', '24 Months / 60,000 km', 799, 1799),
    (122, 'Driver Program', '$3,000 Per Claim', '36 Months / 90,000 km', 999, 1999),
    (123, 'Pro Warranty', '$5,000 Per Claim (up to 200k km)', '12 Months / Unlimited km', 1499, 3799),
    (124, 'Pro Warranty', '$5,000 Per Claim (up to 200k km)', '24 Months / Unlimited km', 1849, 4099),
    (125, 'Pro Warranty', '$5,000 Per Claim (up to 200k km)', '36 Months / 90,000 km', 2199, 4399),
    (126, 'Pro Warranty', '$10,000 Per Claim (up to 160k km)', '12 Months / Unlimited km', 1879, 4129),
    (127, 'Pro Warranty', '$10,000 Per Claim (up to 160k km)', '24 Months / 60,000 km', 2249, 4449),
    (128, 'Pro Warranty', '$10,000 Per Claim (up to 160k km)', '36 Months / 90,000 km', 2699, 4849);

  WITH base_rows AS (
    SELECT
      product_name,
      jsonb_agg(
        jsonb_build_object(
          'label', term_label,
          'term', term_label,
          'vehicleClass', tier,
          'dealerCost', dealer_cost,
          'suggestedRetail', suggested_retail
        )
        ORDER BY seq
      ) AS rows
    FROM tmp_aprotect_base_pricing
    GROUP BY product_name
  ),
  addon_rows AS (
    SELECT
      p.id,
      coalesce(
        jsonb_agg(e.elem ORDER BY e.ord)
          FILTER (
            WHERE e.elem IS NOT NULL
              AND (
                e.elem ? 'addonName'
                OR e.elem->>'kind' = 'addon'
                OR e.elem->>'type' = 'addon'
              )
          ),
        '[]'::jsonb
      ) AS rows
    FROM public.products p
    LEFT JOIN LATERAL jsonb_array_elements(coalesce(p.pricing_json->'rows', '[]'::jsonb))
      WITH ORDINALITY AS e(elem, ord) ON true
    WHERE p.provider_entity_id = v_eid
    GROUP BY p.id
  )
  UPDATE public.products p
  SET pricing_json = jsonb_set(
    coalesce(p.pricing_json, '{}'::jsonb),
    '{rows}',
    base_rows.rows || coalesce(addon_rows.rows, '[]'::jsonb),
    true
  )
  FROM base_rows
  LEFT JOIN addon_rows ON addon_rows.id = p.id
  WHERE p.provider_entity_id = v_eid
    AND p.name = base_rows.product_name;
END $$;
