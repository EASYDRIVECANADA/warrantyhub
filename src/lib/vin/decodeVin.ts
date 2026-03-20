export type VinDecoded = {
  vin: string;
  vehicleYear?: string;
  vehicleMake?: string;
  vehicleModel?: string;
  vehicleTrim?: string;
  fuelTypePrimary?: string;
  fuelTypeSecondary?: string;
  electrificationLevel?: string;
  powertrainType?: "BEV" | "PHEV" | "HEV" | "ICE" | "UNKNOWN";
  vehicleDriveType?: string;
  vehicleBrakeSystem?: string;
  vehicleEngine?: string;
  vehicleBodyClass?: string;
  vehicleBodyStyle?: string;
  vehicleTransmission?: string;
  manufacturedIn?: string;
  tires?: string;
  warranty?: string;
  msrp?: string;
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

function includesToken(text: string | undefined, token: string) {
  if (!text) return false;
  return text.toLowerCase().includes(token.toLowerCase());
}

function normalizeElectrificationLevel(v: string | undefined) {
  const t = (v ?? "").trim();
  if (!t) return undefined;
  const upper = t.toUpperCase();
  if (upper === "BEV" || upper === "HEV" || upper === "PHEV") return upper as "BEV" | "HEV" | "PHEV";
  return t;
}

function derivePowertrainType(input: { fuelTypePrimary?: string; fuelTypeSecondary?: string; electrificationLevel?: string }) {
  const el = normalizeElectrificationLevel(input.electrificationLevel);
  if (el === "BEV" || el === "HEV" || el === "PHEV") return el;

  const p = input.fuelTypePrimary ?? "";
  const s = input.fuelTypeSecondary ?? "";

  const hasElectric = includesToken(p, "electric") || includesToken(s, "electric");
  const hasGas = includesToken(p, "gas") || includesToken(s, "gas") || includesToken(p, "gasoline") || includesToken(s, "gasoline");
  const hasDiesel = includesToken(p, "diesel") || includesToken(s, "diesel");

  if (hasElectric && !hasGas && !hasDiesel) return "BEV";
  if (hasElectric && (hasGas || hasDiesel)) return "PHEV";

  if (includesToken(p, "hybrid") || includesToken(s, "hybrid")) return "HEV";

  if (p || s) return "ICE";
  return "UNKNOWN";
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
  const vehicleBodyStyle = pickFirst(row.BodyClass);
  const vehicleBodyClass = vehicleBodyStyle;

  const fuelTypePrimary = pickFirst((row as any).FuelTypePrimary, (row as any).FuelTypePrimary2);
  const fuelTypeSecondary = pickFirst((row as any).FuelTypeSecondary, (row as any).FuelTypeSecondary2);
  const electrificationLevel = pickFirst((row as any).ElectrificationLevel);
  const powertrainType = derivePowertrainType({ fuelTypePrimary, fuelTypeSecondary, electrificationLevel });

  const engine = pickFirst(
    row.EngineModel,
    row.EngineConfiguration,
    row.EngineCylinders ? `${row.EngineCylinders} cyl` : undefined,
    row.DisplacementL ? `${row.DisplacementL}L` : undefined,
  );

  const vehicleTransmission = pickFirst(
    row.TransmissionStyle,
    row.TransmissionSpeeds ? `${row.TransmissionSpeeds}` : undefined,
  );

  const vehicleDriveType = pickFirst(row.DriveType, row.DriveTypePrimary);
  const vehicleBrakeSystem = pickFirst(row.BrakeSystemType);

  const manufacturedIn = pickFirst(row.PlantCountry);
  const tires = pickFirst(row.TireSizeFront, row.TireSizeRear, row.TireTypeFront, row.TireTypeRear);

  const msrp = pickFirst(row.MSRP, row.BasePrice);
  const warranty = pickFirst(row.Warranty);

  return {
    vin,
    vehicleYear,
    vehicleMake,
    vehicleModel,
    vehicleTrim,
    fuelTypePrimary,
    fuelTypeSecondary,
    electrificationLevel,
    powertrainType,
    vehicleDriveType,
    vehicleBrakeSystem,
    vehicleEngine: engine,
    vehicleBodyClass,
    vehicleBodyStyle,
    vehicleTransmission,
    manufacturedIn,
    tires,
    warranty,
    msrp,
  };
}
