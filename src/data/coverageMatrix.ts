export interface CoverageItem {
  label: string;
  /** One boolean per plan column — true = covered */
  values: boolean[];
}

export interface CoverageCategory {
  category: string;
  items: CoverageItem[];
}

/** Default plan column headings used when no live products are available */
export const PLAN_COLUMNS = ["Silver", "Gold", "Platinum", "Diamond"];

/** Static coverage matrix — mirrors the prototype's ComparisonMatrix data */
export const coverageMatrix: CoverageCategory[] = [
  {
    category: "Powertrain",
    items: [
      { label: "Engine (all internal lubricated parts)", values: [true, true, true, true] },
      { label: "Transmission (all internal parts)", values: [true, true, true, true] },
      { label: "Drive Axle / Differential", values: [true, true, true, true] },
      { label: "Transfer Case", values: [false, true, true, true] },
      { label: "Seals & Gaskets (powertrain)", values: [false, true, true, true] },
    ],
  },
  {
    category: "Electrical",
    items: [
      { label: "Alternator", values: [true, true, true, true] },
      { label: "Starter Motor", values: [true, true, true, true] },
      { label: "Window Motors & Regulators", values: [false, true, true, true] },
      { label: "Power Seat Motors", values: [false, false, true, true] },
      { label: "Electronic Control Modules (PCM/TCM/BCM)", values: [false, true, true, true] },
      { label: "Navigation / Infotainment System", values: [false, false, true, true] },
    ],
  },
  {
    category: "Air Conditioning",
    items: [
      { label: "Compressor", values: [true, true, true, true] },
      { label: "Condenser", values: [false, true, true, true] },
      { label: "Evaporator", values: [false, true, true, true] },
      { label: "Expansion Valve / Orifice Tube", values: [false, false, true, true] },
    ],
  },
  {
    category: "Cooling System",
    items: [
      { label: "Water Pump", values: [true, true, true, true] },
      { label: "Radiator", values: [false, true, true, true] },
      { label: "Thermostat", values: [false, true, true, true] },
      { label: "Cooling Fan Motor", values: [false, false, true, true] },
    ],
  },
  {
    category: "Fuel System",
    items: [
      { label: "Fuel Pump", values: [true, true, true, true] },
      { label: "Fuel Injectors", values: [false, true, true, true] },
      { label: "Fuel Pressure Regulator", values: [false, false, true, true] },
    ],
  },
  {
    category: "Steering",
    items: [
      { label: "Power Steering Pump", values: [true, true, true, true] },
      { label: "Rack & Pinion / Steering Gear", values: [false, true, true, true] },
      { label: "Electronic Power Steering Motor", values: [false, false, true, true] },
    ],
  },
  {
    category: "Brakes",
    items: [
      { label: "Master Cylinder", values: [true, true, true, true] },
      { label: "ABS Pump / Modulator", values: [false, true, true, true] },
      { label: "Brake Booster", values: [false, false, true, true] },
    ],
  },
  {
    category: "Additional Benefits",
    items: [
      { label: "Rental Car Reimbursement", values: [false, true, true, true] },
      { label: "Roadside Assistance (24/7)", values: [true, true, true, true] },
      { label: "Trip Interruption Coverage", values: [false, false, true, true] },
      { label: "Towing (unlimited km)", values: [false, true, true, true] },
    ],
  },
];
