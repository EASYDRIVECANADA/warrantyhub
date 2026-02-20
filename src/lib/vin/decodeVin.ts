export type VinDecoded = {
  vin: string;
  vehicleYear?: string;
  vehicleMake?: string;
  vehicleModel?: string;
  vehicleTrim?: string;
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
