-- A-Protect Warranty Corporation - add-on pricing from V25 R3 dealer/retail books.
-- This appends add-on rows into products.pricing_json.rows with kind = "addon".
-- Base price consumers filter these rows out; dealer configuration and customer options render them.

DO $$
DECLARE
  v_eid CONSTANT uuid := '01c7fc25-cc8a-4814-b4e0-ae80f66d865b';
BEGIN
  CREATE TEMP TABLE tmp_aprotect_addons (
    seq integer GENERATED ALWAYS AS IDENTITY,
    product_name text NOT NULL,
    tier text NOT NULL,
    term_label text NOT NULL,
    addon_name text NOT NULL,
    dealer_value text NOT NULL,
    retail_value text NOT NULL
  ) ON COMMIT DROP;

  CREATE OR REPLACE FUNCTION pg_temp.append_aprotect_addon(
    p_product text,
    p_tier text,
    p_addon text,
    p_terms text[],
    p_dealer text[],
    p_retail text[]
  ) RETURNS void
  LANGUAGE plpgsql
  AS $fn$
  DECLARE
    i integer;
  BEGIN
    IF array_length(p_terms, 1) IS DISTINCT FROM array_length(p_dealer, 1)
       OR array_length(p_terms, 1) IS DISTINCT FROM array_length(p_retail, 1) THEN
      RAISE EXCEPTION 'Mismatched add-on arrays for %.% %', p_product, p_tier, p_addon;
    END IF;

    FOR i IN 1..array_length(p_terms, 1) LOOP
      IF lower(coalesce(p_dealer[i], 'n/a')) NOT IN ('n/a', 'na', '-') THEN
        INSERT INTO tmp_aprotect_addons(product_name, tier, term_label, addon_name, dealer_value, retail_value)
        VALUES (p_product, p_tier, p_terms[i], p_addon, p_dealer[i], p_retail[i]);
      END IF;
    END LOOP;
  END
  $fn$;

  -- POWERTRAIN WARRANTY
  PERFORM pg_temp.append_aprotect_addon('Powertrain Warranty','Bronze - $750 Per Claim','Unlimited km',
    ARRAY['3 Months / 3,000 km','6 Months / 6,000 km','12 Months / 12,000 km','24 Months / 24,000 km','36 Months / 36,000 km'],
    ARRAY['0','0','0','0','0'], ARRAY['50','50','50','50','50']);
  PERFORM pg_temp.append_aprotect_addon('Powertrain Warranty','Silver - $1,000 Per Claim','Unlimited km',
    ARRAY['3 Months / 3,000 km','6 Months / 6,000 km','12 Months / 12,000 km','24 Months / 24,000 km','36 Months / 36,000 km'],
    ARRAY['n/a','25','35','45','65'], ARRAY['n/a','125','135','145','165']);
  PERFORM pg_temp.append_aprotect_addon('Powertrain Warranty','Silver - $1,000 Per Claim','Zero Deductible',
    ARRAY['3 Months / 3,000 km','6 Months / 6,000 km','12 Months / 12,000 km','24 Months / 24,000 km','36 Months / 36,000 km'],
    ARRAY['25','30','35','45','55'], ARRAY['125','130','135','145','155']);
  PERFORM pg_temp.append_aprotect_addon('Powertrain Warranty','Silver - $1,000 Per Claim','Differential Seals & Gaskets',
    ARRAY['3 Months / 3,000 km','6 Months / 6,000 km','12 Months / 12,000 km','24 Months / 24,000 km','36 Months / 36,000 km'],
    ARRAY['55','65','70','80','90'], ARRAY['155','165','170','180','190']);
  PERFORM pg_temp.append_aprotect_addon('Powertrain Warranty','Silver - $1,000 Per Claim','Car Rental',
    ARRAY['3 Months / 3,000 km','6 Months / 6,000 km','12 Months / 12,000 km','24 Months / 24,000 km','36 Months / 36,000 km'],
    ARRAY['25','25','35','45','55'], ARRAY['125','125','135','145','155']);

  PERFORM pg_temp.append_aprotect_addon('Powertrain Warranty','Gold - $1,500 Per Claim','Unlimited km',
    ARRAY['3 Months / Unlimited km','6 Months / Unlimited km','12 Months / 20,000 km','24 Months / 40,000 km','36 Months / 60,000 km'],
    ARRAY['Included','Included','70','85','100'], ARRAY['Included','Included','170','185','200']);
  PERFORM pg_temp.append_aprotect_addon('Powertrain Warranty','Gold - $1,500 Per Claim','Zero Deductible',
    ARRAY['3 Months / Unlimited km','6 Months / Unlimited km','12 Months / 20,000 km','24 Months / 40,000 km','36 Months / 60,000 km'],
    ARRAY['25','25','35','45','55'], ARRAY['125','125','135','145','155']);
  PERFORM pg_temp.append_aprotect_addon('Powertrain Warranty','Gold - $1,500 Per Claim','Seals & Gaskets',
    ARRAY['3 Months / Unlimited km','6 Months / Unlimited km','12 Months / 20,000 km','24 Months / 40,000 km','36 Months / 60,000 km'],
    ARRAY['55','65','75','85','120'], ARRAY['155','165','175','185','220']);
  PERFORM pg_temp.append_aprotect_addon('Powertrain Warranty','Gold - $1,500 Per Claim','Car Rental',
    ARRAY['3 Months / Unlimited km','6 Months / Unlimited km','12 Months / 20,000 km','24 Months / 40,000 km','36 Months / 60,000 km'],
    ARRAY['25','25','35','45','55'], ARRAY['125','125','135','145','155']);
  PERFORM pg_temp.append_aprotect_addon('Powertrain Warranty','Gold - $1,500 Per Claim','Air Conditioning',
    ARRAY['3 Months / Unlimited km','6 Months / Unlimited km','12 Months / 20,000 km','24 Months / 40,000 km','36 Months / 60,000 km'],
    ARRAY['n/a','n/a','120','130','140'], ARRAY['n/a','n/a','220','230','240']);
  PERFORM pg_temp.append_aprotect_addon('Powertrain Warranty','Gold - $1,500 Per Claim','Hi-Tech Components',
    ARRAY['3 Months / Unlimited km','6 Months / Unlimited km','12 Months / 20,000 km','24 Months / 40,000 km','36 Months / 60,000 km'],
    ARRAY['n/a','n/a','160','170','180'], ARRAY['n/a','n/a','260','270','280']);

  PERFORM pg_temp.append_aprotect_addon('Powertrain Warranty','Platinum - $2,500 Per Claim','Unlimited km',
    ARRAY['6 Months / Unlimited km','12 Months / 20,000 km','24 Months / 40,000 km','36 Months / 60,000 km','48 Months / 80,000 km'],
    ARRAY['Included','70','85','125','n/a'], ARRAY['Included','170','185','225','n/a']);
  PERFORM pg_temp.append_aprotect_addon('Powertrain Warranty','Platinum - $2,500 Per Claim','Zero Deductible',
    ARRAY['6 Months / Unlimited km','12 Months / 20,000 km','24 Months / 40,000 km','36 Months / 60,000 km','48 Months / 80,000 km'],
    ARRAY['25','35','45','55','75'], ARRAY['125','135','145','155','175']);
  PERFORM pg_temp.append_aprotect_addon('Powertrain Warranty','Platinum - $2,500 Per Claim','Seals & Gaskets',
    ARRAY['6 Months / Unlimited km','12 Months / 20,000 km','24 Months / 40,000 km','36 Months / 60,000 km','48 Months / 80,000 km'],
    ARRAY['65','85','100','150','175'], ARRAY['165','185','200','250','275']);
  PERFORM pg_temp.append_aprotect_addon('Powertrain Warranty','Platinum - $2,500 Per Claim','Car Rental',
    ARRAY['6 Months / Unlimited km','12 Months / 20,000 km','24 Months / 40,000 km','36 Months / 60,000 km','48 Months / 80,000 km'],
    ARRAY['25','35','45','55','55'], ARRAY['125','135','145','155','155']);
  PERFORM pg_temp.append_aprotect_addon('Powertrain Warranty','Platinum - $2,500 Per Claim','Air Conditioning',
    ARRAY['6 Months / Unlimited km','12 Months / 20,000 km','24 Months / 40,000 km','36 Months / 60,000 km','48 Months / 80,000 km'],
    ARRAY['n/a','120','140','160','180'], ARRAY['n/a','220','240','260','280']);
  PERFORM pg_temp.append_aprotect_addon('Powertrain Warranty','Platinum - $2,500 Per Claim','Hi-Tech Components',
    ARRAY['6 Months / Unlimited km','12 Months / 20,000 km','24 Months / 40,000 km','36 Months / 60,000 km','48 Months / 80,000 km'],
    ARRAY['n/a','160','170','180','200'], ARRAY['n/a','260','270','280','300']);

  PERFORM pg_temp.append_aprotect_addon('Powertrain Warranty','$3,000 Per Claim','Unlimited km',
    ARRAY['12 Months / 20,000 km','24 Months / 40,000 km','36 Months / 60,000 km','48 Months / 80,000 km'],
    ARRAY['70','85','125','n/a'], ARRAY['170','185','225','n/a']);
  PERFORM pg_temp.append_aprotect_addon('Powertrain Warranty','$3,000 Per Claim','Zero Deductible',
    ARRAY['12 Months / 20,000 km','24 Months / 40,000 km','36 Months / 60,000 km','48 Months / 80,000 km'],
    ARRAY['35','45','55','75'], ARRAY['135','145','155','175']);
  PERFORM pg_temp.append_aprotect_addon('Powertrain Warranty','$3,000 Per Claim','Seals & Gaskets',
    ARRAY['12 Months / 20,000 km','24 Months / 40,000 km','36 Months / 60,000 km','48 Months / 80,000 km'],
    ARRAY['85','100','150','175'], ARRAY['185','200','250','275']);
  PERFORM pg_temp.append_aprotect_addon('Powertrain Warranty','$3,000 Per Claim','Car Rental',
    ARRAY['12 Months / 20,000 km','24 Months / 40,000 km','36 Months / 60,000 km','48 Months / 80,000 km'],
    ARRAY['35','45','55','55'], ARRAY['135','145','155','155']);
  PERFORM pg_temp.append_aprotect_addon('Powertrain Warranty','$3,000 Per Claim','Air Conditioning',
    ARRAY['12 Months / 20,000 km','24 Months / 40,000 km','36 Months / 60,000 km','48 Months / 80,000 km'],
    ARRAY['120','140','160','180'], ARRAY['220','240','260','280']);
  PERFORM pg_temp.append_aprotect_addon('Powertrain Warranty','$3,000 Per Claim','Hi-Tech Components',
    ARRAY['12 Months / 20,000 km','24 Months / 40,000 km','36 Months / 60,000 km','48 Months / 80,000 km'],
    ARRAY['160','170','180','200'], ARRAY['260','270','280','300']);

  -- ESSENTIAL WARRANTY
  PERFORM pg_temp.append_aprotect_addon('Essential Warranty','$1,000 Per Claim','Unlimited km',
    ARRAY['12 Months / 20,000 km','24 Months / 40,000 km','36 Months / 60,000 km','48 Months / 80,000 km'],
    ARRAY['100','100','100','150'], ARRAY['200','200','200','250']);
  PERFORM pg_temp.append_aprotect_addon('Essential Warranty','$1,000 Per Claim','Zero Deductible',
    ARRAY['12 Months / 20,000 km','24 Months / 40,000 km','36 Months / 60,000 km','48 Months / 80,000 km'],
    ARRAY['85','120','150','150'], ARRAY['185','220','250','250']);
  PERFORM pg_temp.append_aprotect_addon('Essential Warranty','$1,000 Per Claim','Air Conditioning',
    ARRAY['12 Months / 20,000 km','24 Months / 40,000 km','36 Months / 60,000 km','48 Months / 80,000 km'],
    ARRAY['120','130','140','160'], ARRAY['220','230','240','260']);
  PERFORM pg_temp.append_aprotect_addon('Essential Warranty','$1,500 Per Claim','Unlimited km',
    ARRAY['12 Months / 20,000 km','24 Months / 40,000 km','36 Months / 60,000 km','48 Months / 80,000 km'],
    ARRAY['100','100','100','150'], ARRAY['200','200','200','250']);
  PERFORM pg_temp.append_aprotect_addon('Essential Warranty','$1,500 Per Claim','Zero Deductible',
    ARRAY['12 Months / 20,000 km','24 Months / 40,000 km','36 Months / 60,000 km','48 Months / 80,000 km'],
    ARRAY['85','120','150','150'], ARRAY['185','220','250','250']);
  PERFORM pg_temp.append_aprotect_addon('Essential Warranty','$1,500 Per Claim','Air Conditioning',
    ARRAY['12 Months / 20,000 km','24 Months / 40,000 km','36 Months / 60,000 km','48 Months / 80,000 km'],
    ARRAY['120','130','140','160'], ARRAY['220','230','240','260']);
  PERFORM pg_temp.append_aprotect_addon('Essential Warranty','$1,500 Per Claim','Hi-Tech Components',
    ARRAY['12 Months / 20,000 km','24 Months / 40,000 km','36 Months / 60,000 km','48 Months / 80,000 km'],
    ARRAY['160','170','180','200'], ARRAY['260','270','280','300']);
  PERFORM pg_temp.append_aprotect_addon('Essential Warranty','$3,000 Per Claim','Unlimited km',
    ARRAY['12 Months / 20,000 km','24 Months / 40,000 km','36 Months / 60,000 km','48 Months / 80,000 km'],
    ARRAY['100','100','100','n/a'], ARRAY['200','200','200','n/a']);
  PERFORM pg_temp.append_aprotect_addon('Essential Warranty','$3,000 Per Claim','Zero Deductible',
    ARRAY['12 Months / 20,000 km','24 Months / 40,000 km','36 Months / 60,000 km','48 Months / 80,000 km'],
    ARRAY['85','120','150','150'], ARRAY['185','220','250','250']);
  PERFORM pg_temp.append_aprotect_addon('Essential Warranty','$3,000 Per Claim','Air Conditioning',
    ARRAY['12 Months / 20,000 km','24 Months / 40,000 km','36 Months / 60,000 km','48 Months / 80,000 km'],
    ARRAY['120','140','160','180'], ARRAY['220','240','260','280']);
  PERFORM pg_temp.append_aprotect_addon('Essential Warranty','$3,000 Per Claim','Hi-Tech Components',
    ARRAY['12 Months / 20,000 km','24 Months / 40,000 km','36 Months / 60,000 km','48 Months / 80,000 km'],
    ARRAY['160','170','180','200'], ARRAY['260','270','280','300']);
  PERFORM pg_temp.append_aprotect_addon('Essential Warranty','$3,000 Per Claim','Hybrid Components',
    ARRAY['12 Months / 20,000 km','24 Months / 40,000 km','36 Months / 60,000 km','48 Months / 80,000 km'],
    ARRAY['249','299','349','449'], ARRAY['349','399','449','549']);

  PERFORM pg_temp.append_aprotect_addon('Essential Warranty','$5,000 Per Claim (up to 220k km)','Unlimited km',
    ARRAY['12 Months / 20,000 km','24 Months / 40,000 km','36 Months / 60,000 km','48 Months / 80,000 km'],
    ARRAY['100','100','200','250'], ARRAY['200','200','n/a','n/a']);
  PERFORM pg_temp.append_aprotect_addon('Essential Warranty','$5,000 Per Claim (up to 220k km)','Zero Deductible',
    ARRAY['12 Months / 20,000 km','24 Months / 40,000 km','36 Months / 60,000 km','48 Months / 80,000 km'],
    ARRAY['125','125','150','150'], ARRAY['225','225','250','250']);
  PERFORM pg_temp.append_aprotect_addon('Essential Warranty','$5,000 Per Claim (up to 220k km)','Air Conditioning',
    ARRAY['12 Months / 20,000 km','24 Months / 40,000 km','36 Months / 60,000 km','48 Months / 80,000 km'],
    ARRAY['160','170','190','200'], ARRAY['260','270','290','300']);
  PERFORM pg_temp.append_aprotect_addon('Essential Warranty','$5,000 Per Claim (up to 220k km)','Hi-Tech ELITE',
    ARRAY['12 Months / 20,000 km','24 Months / 40,000 km','36 Months / 60,000 km','48 Months / 80,000 km'],
    ARRAY['349','399','449','449'], ARRAY['449','499','549','549']);
  PERFORM pg_temp.append_aprotect_addon('Essential Warranty','$5,000 Per Claim (up to 220k km)','Hybrid Components',
    ARRAY['12 Months / 20,000 km','24 Months / 40,000 km','36 Months / 60,000 km','48 Months / 80,000 km'],
    ARRAY['349','399','469','559'], ARRAY['449','499','569','659']);
  PERFORM pg_temp.append_aprotect_addon('Essential Warranty','$5,000 Per Claim (up to 220k km)','Premium Make Charge',
    ARRAY['12 Months / 20,000 km','24 Months / 40,000 km','36 Months / 60,000 km','48 Months / 80,000 km'],
    ARRAY['350','450','550','600'], ARRAY['350','450','550','600']);

  PERFORM pg_temp.append_aprotect_addon('Essential Warranty','$7,500 Per Claim (up to 220k km)','Unlimited km',
    ARRAY['24 Months / 40,000 km','36 Months / 60,000 km','48 Months / 80,000 km'],
    ARRAY['100','n/a','n/a'], ARRAY['200','n/a','n/a']);
  PERFORM pg_temp.append_aprotect_addon('Essential Warranty','$7,500 Per Claim (up to 220k km)','Zero Deductible',
    ARRAY['24 Months / 40,000 km','36 Months / 60,000 km','48 Months / 80,000 km'],
    ARRAY['125','150','150'], ARRAY['225','250','250']);
  PERFORM pg_temp.append_aprotect_addon('Essential Warranty','$7,500 Per Claim (up to 220k km)','Air Conditioning',
    ARRAY['24 Months / 40,000 km','36 Months / 60,000 km','48 Months / 80,000 km'],
    ARRAY['170','190','200'], ARRAY['270','290','300']);
  PERFORM pg_temp.append_aprotect_addon('Essential Warranty','$7,500 Per Claim (up to 220k km)','Hi-Tech ELITE',
    ARRAY['24 Months / 40,000 km','36 Months / 60,000 km','48 Months / 80,000 km'],
    ARRAY['399','449','449'], ARRAY['499','549','549']);
  PERFORM pg_temp.append_aprotect_addon('Essential Warranty','$7,500 Per Claim (up to 220k km)','Hybrid Components',
    ARRAY['24 Months / 40,000 km','36 Months / 60,000 km','48 Months / 80,000 km'],
    ARRAY['399','469','559'], ARRAY['499','569','659']);
  PERFORM pg_temp.append_aprotect_addon('Essential Warranty','$7,500 Per Claim (up to 220k km)','Premium Make Charge',
    ARRAY['24 Months / 40,000 km','36 Months / 60,000 km','48 Months / 80,000 km'],
    ARRAY['450','550','600'], ARRAY['450','550','600']);

  PERFORM pg_temp.append_aprotect_addon('Essential Warranty','$10,000 Per Claim (up to 220k km)','Unlimited km',
    ARRAY['24 Months / 40,000 km','36 Months / 60,000 km','48 Months / 80,000 km'],
    ARRAY['100','250','350'], ARRAY['200','n/a','n/a']);
  PERFORM pg_temp.append_aprotect_addon('Essential Warranty','$10,000 Per Claim (up to 220k km)','Zero Deductible',
    ARRAY['24 Months / 40,000 km','36 Months / 60,000 km','48 Months / 80,000 km'],
    ARRAY['125','150','150'], ARRAY['225','250','250']);
  PERFORM pg_temp.append_aprotect_addon('Essential Warranty','$10,000 Per Claim (up to 220k km)','Air Conditioning',
    ARRAY['24 Months / 40,000 km','36 Months / 60,000 km','48 Months / 80,000 km'],
    ARRAY['170','190','200'], ARRAY['270','290','300']);
  PERFORM pg_temp.append_aprotect_addon('Essential Warranty','$10,000 Per Claim (up to 220k km)','Hi-Tech ELITE',
    ARRAY['24 Months / 40,000 km','36 Months / 60,000 km','48 Months / 80,000 km'],
    ARRAY['399','449','449'], ARRAY['499','549','549']);
  PERFORM pg_temp.append_aprotect_addon('Essential Warranty','$10,000 Per Claim (up to 220k km)','Hybrid Components',
    ARRAY['24 Months / 40,000 km','36 Months / 60,000 km','48 Months / 80,000 km'],
    ARRAY['399','469','559'], ARRAY['499','569','659']);
  PERFORM pg_temp.append_aprotect_addon('Essential Warranty','$10,000 Per Claim (up to 220k km)','Premium Make Charge',
    ARRAY['24 Months / 40,000 km','36 Months / 60,000 km','48 Months / 80,000 km'],
    ARRAY['450','550','600'], ARRAY['450','550','600']);

  -- PREMIUM SPECIAL WARRANTY
  PERFORM pg_temp.append_aprotect_addon('Premium Special Warranty','$3,000 Per Claim','Unlimited km',
    ARRAY['3 Months / Unlimited km','6 Months / Unlimited km','12 Months / 20,000 km','24 Months / 40,000 km','36 Months / 60,000 km','48 Months / 80,000 km'],
    ARRAY['Included','Included','100','100','n/a','n/a'], ARRAY['Included','Included','200','200','n/a','n/a']);
  PERFORM pg_temp.append_aprotect_addon('Premium Special Warranty','$3,000 Per Claim','Zero Deductible',
    ARRAY['3 Months / Unlimited km','6 Months / Unlimited km','12 Months / 20,000 km','24 Months / 40,000 km','36 Months / 60,000 km','48 Months / 80,000 km'],
    ARRAY['35','55','85','120','150','150'], ARRAY['135','155','185','220','250','250']);
  PERFORM pg_temp.append_aprotect_addon('Premium Special Warranty','$3,000 Per Claim','Hi-Tech Components',
    ARRAY['3 Months / Unlimited km','6 Months / Unlimited km','12 Months / 20,000 km','24 Months / 40,000 km','36 Months / 60,000 km','48 Months / 80,000 km'],
    ARRAY['n/a','n/a','160','170','180','200'], ARRAY['n/a','n/a','260','270','280','300']);
  PERFORM pg_temp.append_aprotect_addon('Premium Special Warranty','$3,000 Per Claim','Hybrid Components',
    ARRAY['3 Months / Unlimited km','6 Months / Unlimited km','12 Months / 20,000 km','24 Months / 40,000 km','36 Months / 60,000 km','48 Months / 80,000 km'],
    ARRAY['n/a','n/a','249','299','349','449'], ARRAY['n/a','n/a','349','399','449','549']);

  PERFORM pg_temp.append_aprotect_addon('Premium Special Warranty','$4,000 Per Claim (up to 220k km)','Unlimited km',
    ARRAY['12 Months / 20,000 km','24 Months / 40,000 km','36 Months / 70,000 km','48 Months / 90,000 km'],
    ARRAY['100','100','n/a','n/a'], ARRAY['200','200','n/a','n/a']);
  PERFORM pg_temp.append_aprotect_addon('Premium Special Warranty','$4,000 Per Claim (up to 220k km)','Zero Deductible',
    ARRAY['12 Months / 20,000 km','24 Months / 40,000 km','36 Months / 70,000 km','48 Months / 90,000 km'],
    ARRAY['85','120','150','150'], ARRAY['185','220','250','250']);
  PERFORM pg_temp.append_aprotect_addon('Premium Special Warranty','$4,000 Per Claim (up to 220k km)','Hi-Tech Components',
    ARRAY['12 Months / 20,000 km','24 Months / 40,000 km','36 Months / 70,000 km','48 Months / 90,000 km'],
    ARRAY['160','170','180','200'], ARRAY['260','270','280','300']);
  PERFORM pg_temp.append_aprotect_addon('Premium Special Warranty','$4,000 Per Claim (up to 220k km)','Hi-Tech ELITE',
    ARRAY['12 Months / 20,000 km','24 Months / 40,000 km','36 Months / 70,000 km','48 Months / 90,000 km'],
    ARRAY['349','399','449','449'], ARRAY['449','499','549','549']);
  PERFORM pg_temp.append_aprotect_addon('Premium Special Warranty','$4,000 Per Claim (up to 220k km)','Hybrid Components',
    ARRAY['12 Months / 20,000 km','24 Months / 40,000 km','36 Months / 70,000 km','48 Months / 90,000 km'],
    ARRAY['249','299','349','449'], ARRAY['349','399','449','549']);
  PERFORM pg_temp.append_aprotect_addon('Premium Special Warranty','$4,000 Per Claim (up to 220k km)','Premium Make Charge',
    ARRAY['12 Months / 20,000 km','24 Months / 40,000 km','36 Months / 70,000 km','48 Months / 90,000 km'],
    ARRAY['250','300','385','400'], ARRAY['350','450','550','600']);

  PERFORM pg_temp.append_aprotect_addon('Premium Special Warranty','$5,000 Per Claim (up to 220k km)','Unlimited km',
    ARRAY['12 Months / 20,000 km','24 Months / 40,000 km','36 Months / 70,000 km','48 Months / 90,000 km'],
    ARRAY['100','150','250','350'], ARRAY['100','250','350','450']);
  PERFORM pg_temp.append_aprotect_addon('Premium Special Warranty','$5,000 Per Claim (up to 220k km)','Zero Deductible',
    ARRAY['12 Months / 20,000 km','24 Months / 40,000 km','36 Months / 70,000 km','48 Months / 90,000 km'],
    ARRAY['85','120','150','150'], ARRAY['185','220','250','250']);
  PERFORM pg_temp.append_aprotect_addon('Premium Special Warranty','$5,000 Per Claim (up to 220k km)','Hi-Tech Components',
    ARRAY['12 Months / 20,000 km','24 Months / 40,000 km','36 Months / 70,000 km','48 Months / 90,000 km'],
    ARRAY['160','170','180','200'], ARRAY['260','270','280','300']);
  PERFORM pg_temp.append_aprotect_addon('Premium Special Warranty','$5,000 Per Claim (up to 220k km)','Hi-Tech ELITE',
    ARRAY['12 Months / 20,000 km','24 Months / 40,000 km','36 Months / 70,000 km','48 Months / 90,000 km'],
    ARRAY['349','399','449','449'], ARRAY['449','499','549','549']);
  PERFORM pg_temp.append_aprotect_addon('Premium Special Warranty','$5,000 Per Claim (up to 220k km)','Hybrid Components',
    ARRAY['12 Months / 20,000 km','24 Months / 40,000 km','36 Months / 70,000 km','48 Months / 90,000 km'],
    ARRAY['249','299','359','449'], ARRAY['449','499','549','549']);
  PERFORM pg_temp.append_aprotect_addon('Premium Special Warranty','$5,000 Per Claim (up to 220k km)','Premium Make Charge',
    ARRAY['12 Months / 20,000 km','24 Months / 40,000 km','36 Months / 70,000 km','48 Months / 90,000 km'],
    ARRAY['350','450','550','600'], ARRAY['350','450','550','600']);

  -- LUXURY WARRANTY
  PERFORM pg_temp.append_aprotect_addon('Luxury Warranty','$1,000 Per Claim','Zero Deductible',
    ARRAY['3 Months / Unlimited km','6 Months / Unlimited km','12 Months / 20,000 km','24 Months / 40,000 km','36 Months / 60,000 km'],
    ARRAY['35','55','85','115','135'], ARRAY['135','155','185','215','235']);
  PERFORM pg_temp.append_aprotect_addon('Luxury Warranty','$1,500 Per Claim','Zero Deductible',
    ARRAY['3 Months / Unlimited km','6 Months / Unlimited km','12 Months / 20,000 km','24 Months / 40,000 km','36 Months / 60,000 km'],
    ARRAY['35','55','85','115','135'], ARRAY['135','155','185','215','235']);
  PERFORM pg_temp.append_aprotect_addon('Luxury Warranty','$2,500 Per Claim','Zero Deductible',
    ARRAY['6 Months / Unlimited km','12 Months / 20,000 km','24 Months / 40,000 km','36 Months / 60,000 km'],
    ARRAY['55','85','115','135'], ARRAY['155','185','215','235']);
  PERFORM pg_temp.append_aprotect_addon('Luxury Warranty','$2,500 Per Claim','Hi-Tech Components',
    ARRAY['6 Months / Unlimited km','12 Months / 20,000 km','24 Months / 40,000 km','36 Months / 60,000 km'],
    ARRAY['n/a','129','149','179'], ARRAY['n/a','229','249','279']);
  PERFORM pg_temp.append_aprotect_addon('Luxury Warranty','$2,500 Per Claim','Hybrid Components',
    ARRAY['6 Months / Unlimited km','12 Months / 20,000 km','24 Months / 40,000 km','36 Months / 60,000 km'],
    ARRAY['n/a','249','299','349'], ARRAY['n/a','349','399','449']);
  PERFORM pg_temp.append_aprotect_addon('Luxury Warranty','$2,500 Per Claim','Premium Make Charge',
    ARRAY['6 Months / Unlimited km','12 Months / 20,000 km','24 Months / 40,000 km','36 Months / 60,000 km'],
    ARRAY['n/a','100','150','170'], ARRAY['n/a','200','250','300']);
  PERFORM pg_temp.append_aprotect_addon('Luxury Warranty','$3,000 Per Claim','Zero Deductible',
    ARRAY['12 Months / 20,000 km','24 Months / 40,000 km','36 Months / 60,000 km'],
    ARRAY['85','115','135'], ARRAY['185','215','235']);
  PERFORM pg_temp.append_aprotect_addon('Luxury Warranty','$3,000 Per Claim','Hi-Tech Components',
    ARRAY['12 Months / 20,000 km','24 Months / 40,000 km','36 Months / 60,000 km'],
    ARRAY['129','149','179'], ARRAY['229','249','279']);
  PERFORM pg_temp.append_aprotect_addon('Luxury Warranty','$3,000 Per Claim','Hybrid Components',
    ARRAY['12 Months / 20,000 km','24 Months / 40,000 km','36 Months / 60,000 km'],
    ARRAY['249','299','349'], ARRAY['349','399','449']);
  PERFORM pg_temp.append_aprotect_addon('Luxury Warranty','$3,000 Per Claim','Premium Make Charge',
    ARRAY['12 Months / 20,000 km','24 Months / 40,000 km','36 Months / 60,000 km'],
    ARRAY['100','150','170'], ARRAY['200','250','300']);

  -- DIAMOND PLUS WARRANTY
  PERFORM pg_temp.append_aprotect_addon('Diamond Plus Warranty','$5,000 / claim','Powertrain Plus',
    ARRAY['12 Months / Unlimited km','24 Months / Unlimited km','36 Months / 70,000 km','48 Months / 90,000 km'],
    ARRAY['295','295','345','345'], ARRAY['395','395','445','445']);
  PERFORM pg_temp.append_aprotect_addon('Diamond Plus Warranty','$5,000 / claim','Hi-Tech Components',
    ARRAY['12 Months / Unlimited km','24 Months / Unlimited km','36 Months / 70,000 km','48 Months / 90,000 km'],
    ARRAY['349','399','449','449'], ARRAY['449','499','549','549']);
  PERFORM pg_temp.append_aprotect_addon('Diamond Plus Warranty','$5,000 / claim','Hybrid Components',
    ARRAY['12 Months / Unlimited km','24 Months / Unlimited km','36 Months / 70,000 km','48 Months / 90,000 km'],
    ARRAY['349','399','489','559'], ARRAY['449','499','589','659']);
  PERFORM pg_temp.append_aprotect_addon('Diamond Plus Warranty','$5,000 / claim','Premium Make Charge',
    ARRAY['12 Months / Unlimited km','24 Months / Unlimited km','36 Months / 70,000 km','48 Months / 90,000 km'],
    ARRAY['350','450','550','600'], ARRAY['350','450','550','600']);

  PERFORM pg_temp.append_aprotect_addon('Diamond Plus Warranty','$7,500 / claim','Unlimited km',
    ARRAY['24 Months / 40,000 km','36 Months / 70,000 km','48 Months / 90,000 km'],
    ARRAY['100','100','100'], ARRAY['200','200','200']);
  PERFORM pg_temp.append_aprotect_addon('Diamond Plus Warranty','$7,500 / claim','Powertrain Plus',
    ARRAY['24 Months / 40,000 km','36 Months / 70,000 km','48 Months / 90,000 km'],
    ARRAY['295','295','345'], ARRAY['395','395','445']);
  PERFORM pg_temp.append_aprotect_addon('Diamond Plus Warranty','$7,500 / claim','Hi-Tech Components',
    ARRAY['24 Months / 40,000 km','36 Months / 70,000 km','48 Months / 90,000 km'],
    ARRAY['349','399','449'], ARRAY['449','499','549']);
  PERFORM pg_temp.append_aprotect_addon('Diamond Plus Warranty','$7,500 / claim','Hybrid Components',
    ARRAY['24 Months / 40,000 km','36 Months / 70,000 km','48 Months / 90,000 km'],
    ARRAY['399','489','559'], ARRAY['499','589','659']);
  PERFORM pg_temp.append_aprotect_addon('Diamond Plus Warranty','$7,500 / claim','Premium Make Charge',
    ARRAY['24 Months / 40,000 km','36 Months / 70,000 km','48 Months / 90,000 km'],
    ARRAY['450','550','600'], ARRAY['450','550','600']);

  PERFORM pg_temp.append_aprotect_addon('Diamond Plus Warranty','$10,000 / claim','Unlimited km',
    ARRAY['24 Months / 40,000 km','36 Months / 70,000 km','48 Months / 90,000 km'],
    ARRAY['250','n/a','n/a'], ARRAY['350','n/a','n/a']);
  PERFORM pg_temp.append_aprotect_addon('Diamond Plus Warranty','$10,000 / claim','Powertrain Plus',
    ARRAY['24 Months / 40,000 km','36 Months / 70,000 km','48 Months / 90,000 km'],
    ARRAY['295','295','345'], ARRAY['395','395','445']);
  PERFORM pg_temp.append_aprotect_addon('Diamond Plus Warranty','$10,000 / claim','Hi-Tech Components',
    ARRAY['24 Months / 40,000 km','36 Months / 70,000 km','48 Months / 90,000 km'],
    ARRAY['349','399','449'], ARRAY['449','499','549']);
  PERFORM pg_temp.append_aprotect_addon('Diamond Plus Warranty','$10,000 / claim','Hybrid Components',
    ARRAY['24 Months / 40,000 km','36 Months / 70,000 km','48 Months / 90,000 km'],
    ARRAY['399','489','559'], ARRAY['499','589','659']);
  PERFORM pg_temp.append_aprotect_addon('Diamond Plus Warranty','$10,000 / claim','Premium Make Charge',
    ARRAY['24 Months / 40,000 km','36 Months / 70,000 km','48 Months / 90,000 km'],
    ARRAY['450','550','600'], ARRAY['450','550','600']);

  PERFORM pg_temp.append_aprotect_addon('Diamond Plus Warranty','$20,000 / claim','Powertrain Plus',
    ARRAY['24 Months / 40,000 km','36 Months / 70,000 km','48 Months / 90,000 km'],
    ARRAY['295','295','345'], ARRAY['395','395','445']);
  PERFORM pg_temp.append_aprotect_addon('Diamond Plus Warranty','$20,000 / claim','Hi-Tech Components',
    ARRAY['24 Months / 40,000 km','36 Months / 70,000 km','48 Months / 90,000 km'],
    ARRAY['349','399','449'], ARRAY['449','499','549']);
  PERFORM pg_temp.append_aprotect_addon('Diamond Plus Warranty','$20,000 / claim','Hybrid Components',
    ARRAY['24 Months / 40,000 km','36 Months / 70,000 km','48 Months / 90,000 km'],
    ARRAY['399','489','559'], ARRAY['499','589','659']);
  PERFORM pg_temp.append_aprotect_addon('Diamond Plus Warranty','$20,000 / claim','Premium Make Charge',
    ARRAY['24 Months / 40,000 km','36 Months / 70,000 km','48 Months / 90,000 km'],
    ARRAY['450','550','600'], ARRAY['450','550','600']);

  -- DRIVER PROGRAM
  PERFORM pg_temp.append_aprotect_addon('Driver Program','$1,500 Per Claim','Car Rental',
    ARRAY['12 Months / Unlimited km','24 Months / 60,000 km','36 Months / 90,000 km'],
    ARRAY['25','35','45'], ARRAY['125','135','145']);
  PERFORM pg_temp.append_aprotect_addon('Driver Program','$1,500 Per Claim','Zero Deductible',
    ARRAY['12 Months / Unlimited km','24 Months / 60,000 km','36 Months / 90,000 km'],
    ARRAY['50','75','45'], ARRAY['150','175','145']);
  PERFORM pg_temp.append_aprotect_addon('Driver Program','$1,500 Per Claim','Air Conditioning',
    ARRAY['12 Months / Unlimited km','24 Months / 60,000 km','36 Months / 90,000 km'],
    ARRAY['75','100','125'], ARRAY['175','200','225']);
  PERFORM pg_temp.append_aprotect_addon('Driver Program','$1,500 Per Claim','Hi-Tech Components',
    ARRAY['12 Months / Unlimited km','24 Months / 60,000 km','36 Months / 90,000 km'],
    ARRAY['100','150','200'], ARRAY['200','250','300']);
  PERFORM pg_temp.append_aprotect_addon('Driver Program','$1,500 Per Claim','Hybrid Components',
    ARRAY['12 Months / Unlimited km','24 Months / 60,000 km','36 Months / 90,000 km'],
    ARRAY['350','450','550'], ARRAY['450','550','650']);
  PERFORM pg_temp.append_aprotect_addon('Driver Program','$1,500 Per Claim','Add extra 10,000 km',
    ARRAY['12 Months / Unlimited km','24 Months / 60,000 km','36 Months / 90,000 km'],
    ARRAY['n/a','175','225'], ARRAY['n/a','275','325']);

  PERFORM pg_temp.append_aprotect_addon('Driver Program','$3,000 Per Claim','Car Rental',
    ARRAY['12 Months / Unlimited km','24 Months / 60,000 km','36 Months / 90,000 km'],
    ARRAY['25','35','45'], ARRAY['125','135','145']);
  PERFORM pg_temp.append_aprotect_addon('Driver Program','$3,000 Per Claim','Zero Deductible',
    ARRAY['12 Months / Unlimited km','24 Months / 60,000 km','36 Months / 90,000 km'],
    ARRAY['75','100','125'], ARRAY['175','200','225']);
  PERFORM pg_temp.append_aprotect_addon('Driver Program','$3,000 Per Claim','Air Conditioning',
    ARRAY['12 Months / Unlimited km','24 Months / 60,000 km','36 Months / 90,000 km'],
    ARRAY['100','125','250'], ARRAY['200','225','350']);
  PERFORM pg_temp.append_aprotect_addon('Driver Program','$3,000 Per Claim','Hi-Tech Components',
    ARRAY['12 Months / Unlimited km','24 Months / 60,000 km','36 Months / 90,000 km'],
    ARRAY['150','200','250'], ARRAY['250','300','350']);
  PERFORM pg_temp.append_aprotect_addon('Driver Program','$3,000 Per Claim','Hybrid Components',
    ARRAY['12 Months / Unlimited km','24 Months / 60,000 km','36 Months / 90,000 km'],
    ARRAY['450','550','650'], ARRAY['550','650','750']);
  PERFORM pg_temp.append_aprotect_addon('Driver Program','$3,000 Per Claim','Add extra 10,000 km',
    ARRAY['12 Months / Unlimited km','24 Months / 60,000 km','36 Months / 90,000 km'],
    ARRAY['n/a','175','225'], ARRAY['n/a','275','325']);

  -- PRO WARRANTY
  PERFORM pg_temp.append_aprotect_addon('Pro Warranty','$5,000 Per Claim (up to 200k km)','Car Rental',
    ARRAY['12 Months / Unlimited km','24 Months / Unlimited km','36 Months / 90,000 km'],
    ARRAY['25','35','45'], ARRAY['125','135','145']);
  PERFORM pg_temp.append_aprotect_addon('Pro Warranty','$5,000 Per Claim (up to 200k km)','Zero Deductible',
    ARRAY['12 Months / Unlimited km','24 Months / Unlimited km','36 Months / 90,000 km'],
    ARRAY['125','175','225'], ARRAY['225','275','325']);
  PERFORM pg_temp.append_aprotect_addon('Pro Warranty','$5,000 Per Claim (up to 200k km)','GPS & Tech Package',
    ARRAY['12 Months / Unlimited km','24 Months / Unlimited km','36 Months / 90,000 km'],
    ARRAY['150','200','250'], ARRAY['250','300','350']);
  PERFORM pg_temp.append_aprotect_addon('Pro Warranty','$5,000 Per Claim (up to 200k km)','Hi-Tech Components',
    ARRAY['12 Months / Unlimited km','24 Months / Unlimited km','36 Months / 90,000 km'],
    ARRAY['150','200','250'], ARRAY['250','300','350']);
  PERFORM pg_temp.append_aprotect_addon('Pro Warranty','$5,000 Per Claim (up to 200k km)','Hybrid Components',
    ARRAY['12 Months / Unlimited km','24 Months / Unlimited km','36 Months / 90,000 km'],
    ARRAY['499','599','699'], ARRAY['599','699','799']);
  PERFORM pg_temp.append_aprotect_addon('Pro Warranty','$5,000 Per Claim (up to 200k km)','Add extra 10,000 km',
    ARRAY['12 Months / Unlimited km','24 Months / Unlimited km','36 Months / 90,000 km'],
    ARRAY['n/a','n/a','299'], ARRAY['n/a','n/a','399']);

  PERFORM pg_temp.append_aprotect_addon('Pro Warranty','$10,000 Per Claim (up to 160k km)','Car Rental',
    ARRAY['12 Months / Unlimited km','24 Months / 60,000 km','36 Months / 90,000 km'],
    ARRAY['25','35','45'], ARRAY['125','135','145']);
  PERFORM pg_temp.append_aprotect_addon('Pro Warranty','$10,000 Per Claim (up to 160k km)','Zero Deductible',
    ARRAY['12 Months / Unlimited km','24 Months / 60,000 km','36 Months / 90,000 km'],
    ARRAY['150','200','250'], ARRAY['250','300','350']);
  PERFORM pg_temp.append_aprotect_addon('Pro Warranty','$10,000 Per Claim (up to 160k km)','GPS & Tech Package',
    ARRAY['12 Months / Unlimited km','24 Months / 60,000 km','36 Months / 90,000 km'],
    ARRAY['200','250','300'], ARRAY['300','350','400']);
  PERFORM pg_temp.append_aprotect_addon('Pro Warranty','$10,000 Per Claim (up to 160k km)','Hi-Tech Components',
    ARRAY['12 Months / Unlimited km','24 Months / 60,000 km','36 Months / 90,000 km'],
    ARRAY['175','225','275'], ARRAY['275','325','375']);
  PERFORM pg_temp.append_aprotect_addon('Pro Warranty','$10,000 Per Claim (up to 160k km)','Hybrid Components',
    ARRAY['12 Months / Unlimited km','24 Months / 60,000 km','36 Months / 90,000 km'],
    ARRAY['499','599','699'], ARRAY['599','699','799']);
  PERFORM pg_temp.append_aprotect_addon('Pro Warranty','$10,000 Per Claim (up to 160k km)','Add extra 10,000 km',
    ARRAY['12 Months / Unlimited km','24 Months / 60,000 km','36 Months / 90,000 km'],
    ARRAY['n/a','199','299'], ARRAY['n/a','299','399']);

  WITH base_rows AS (
    SELECT
      p.id,
      coalesce(
        jsonb_agg(e.elem ORDER BY e.ord)
          FILTER (
            WHERE e.elem IS NOT NULL
              AND NOT (
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
  ),
  addon_rows AS (
    SELECT
      product_name,
      jsonb_agg(
        jsonb_build_object(
          'kind', 'addon',
          'addonName', addon_name,
          'label', term_label,
          'term', term_label,
          'vehicleClass', tier,
          'dealerCost', CASE
            WHEN dealer_value ~ '^[0-9]+(\.[0-9]+)?$' THEN to_jsonb(dealer_value::numeric)
            ELSE to_jsonb(dealer_value)
          END,
          'suggestedRetail', CASE
            WHEN retail_value ~ '^[0-9]+(\.[0-9]+)?$' THEN to_jsonb(retail_value::numeric)
            ELSE to_jsonb(retail_value)
          END
        )
        ORDER BY seq
      ) AS rows
    FROM tmp_aprotect_addons
    GROUP BY product_name
  )
  UPDATE public.products p
  SET pricing_json = jsonb_set(
    coalesce(p.pricing_json, '{}'::jsonb),
    '{rows}',
    base_rows.rows || coalesce(addon_rows.rows, '[]'::jsonb),
    true
  )
  FROM base_rows
  CROSS JOIN addon_rows
  WHERE p.provider_entity_id = v_eid
    AND p.id = base_rows.id
    AND p.name = addon_rows.product_name;
END $$;
