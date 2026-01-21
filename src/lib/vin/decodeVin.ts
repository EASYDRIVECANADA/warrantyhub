export type VinDecoded = {
  vin: string;
  vehicleYear?: string;
  vehicleMake?: string;
  vehicleModel?: string;
  vehicleTrim?: string;
  vehicleBodyClass?: string;
  vehicleEngine?: string;
  vehicleTransmission?: string;
};

function clean(vin: string) {
  return vin.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function pickFirst(...vals: Array<string | null | undefined>) {
  for (const v of vals) {
    if (!v) continue;
    const t = String(v).trim();
    if (t && t !== "0" && t.toUpperCase() !== "NOT APPLICABLE") return t;
  }
  return undefined;
}

export async function decodeVin(vinRaw: string): Promise<VinDecoded> {
  const vin = clean(vinRaw);
  if (!vin) throw new Error("VIN is required");
  if (vin.length < 10) throw new Error("VIN is too short");

  const url = `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValuesExtended/${encodeURIComponent(vin)}?format=json`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`VIN decode failed (${res.status})`);
  }

  const json = (await res.json()) as {
    Results?: Array<Record<string, string | null | undefined>>;
  };

  const row = json.Results?.[0] ?? {};

  const vehicleYear = pickFirst(row.ModelYear);
  const vehicleMake = pickFirst(row.Make);
  const vehicleModel = pickFirst(row.Model);
  const vehicleTrim = pickFirst(row.Trim, row.Series);
  const vehicleBodyClass = pickFirst(row.BodyClass);

  const engine = pickFirst(
    row.EngineModel,
    row.EngineConfiguration,
    row.EngineCylinders ? `${row.EngineCylinders} cyl` : undefined,
    row.DisplacementL ? `${row.DisplacementL}L` : undefined,
  );

  const vehicleTransmission = pickFirst(row.TransmissionStyle, row.TransmissionSpeeds);

  return {
    vin,
    vehicleYear,
    vehicleMake,
    vehicleModel,
    vehicleTrim,
    vehicleBodyClass,
    vehicleEngine: engine,
    vehicleTransmission,
  };
}
