import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { PageShell } from "../components/PageShell";
import { getDocumentsApi } from "../lib/documents/documents";
import type { ProductDocument } from "../lib/documents/types";
import { getProductsApi } from "../lib/products/products";
import { getProductPricingApi } from "../lib/productPricing/productPricing";
import { getProductAddonsApi } from "../lib/productAddons/productAddons";
import { sanitizeDigitsOnly, sanitizeMoney, sanitizeWordsOnly } from "../lib/utils";
import type { CreateProductInput, Product, ProductType, PricingStructure } from "../lib/products/types";
import type { ClaimLimitType, ProductPricing } from "../lib/productPricing/types";
import type { ProductAddon } from "../lib/productAddons/types";
import { defaultPricingRow } from "../lib/productPricing/defaultRow";

const FINANCE_TERMS = [24, 36, 48, 60, 72, 84, 96] as const;
type FinanceTermMonths = (typeof FINANCE_TERMS)[number];

function normalizeMoneyString(value: string) {
  return (value ?? "").replace(/,/g, "").trim();
}

function formatMoneyInput(value: string) {
  const raw = sanitizeMoney(value);
  if (!raw) return "";
  const [intRaw, decRaw] = raw.split(".");
  const intPart = (intRaw ?? "").replace(/^0+(?=\d)/, "");
  const withCommas = (intPart || "0").replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  if (decRaw === undefined) return withCommas;
  return `${withCommas}.${decRaw}`;
}

function productTypeLabel(t: ProductType) {
  if (t === "EXTENDED_WARRANTY") return "Extended Warranty";
  if (t === "TIRE_RIM") return "Tire & Rim";
  if (t === "APPEARANCE") return "Appearance / Rust / Key";
  if (t === "GAP") return "GAP Insurance";
  return "Other";
}

function dollarsToCents(v: string) {
  const n = Number(normalizeMoneyString(v));
  if (!Number.isFinite(n)) return undefined;
  return Math.round(n * 100);
}

function centsToDollars(cents?: number) {
  if (typeof cents !== "number") return "";
  const dollars = cents / 100;
  return dollars.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function money(cents?: number) {
  if (typeof cents !== "number") return "—";
  const dollars = cents / 100;
  return `$${dollars.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatUnknownError(e: unknown) {
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object") {
    const anyE = e as any;
    if (typeof anyE.message === "string" && anyE.message.trim()) return anyE.message;
    if (typeof anyE.error_description === "string" && anyE.error_description.trim()) return anyE.error_description;
    if (typeof anyE.details === "string" && anyE.details.trim()) return anyE.details;
    if (typeof anyE.hint === "string" && anyE.hint.trim()) return anyE.hint;
  }
  return "Unexpected error";
}

function parseOptionalInt(v: string) {
  const t = v.trim();
  if (!t) return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? Math.floor(n) : undefined;
}

function parseOptionalPct(v: string) {
  const t = (v ?? "").trim();
  if (!t) return undefined;
  const n = Number(t);
  if (!Number.isFinite(n)) return undefined;
  if (n < 0 || n > 100) return undefined;
  return n;
}

function parseOptionalIntOrNull(v: string) {
  const t = v.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? Math.floor(n) : null;
}

function parseAllowlist(raw: string) {
  const items = raw
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  return items.length > 0 ? items : undefined;
}

function allowlistToString(items: string[] | undefined) {
  if (!items || items.length === 0) return "";
  return items.join(", ");
}

function statusBadge(published: boolean) {
  return (
    "text-[10px] px-2 py-0.5 rounded-md border " +
    (published ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-amber-50 text-amber-800 border-amber-200")
  );
}

function eligibilitySummary(p: Product) {
  const parts: string[] = [];
  if (typeof p.eligibilityMaxVehicleAgeYears === "number") parts.push(`≤${p.eligibilityMaxVehicleAgeYears}y`);
  if (typeof p.eligibilityMaxMileageKm === "number") parts.push(`≤${p.eligibilityMaxMileageKm}km`);
  if (p.eligibilityMakeAllowlist && p.eligibilityMakeAllowlist.length > 0) parts.push(`${p.eligibilityMakeAllowlist.length} makes`);
  if (p.eligibilityModelAllowlist && p.eligibilityModelAllowlist.length > 0) parts.push(`${p.eligibilityModelAllowlist.length} models`);
  if (p.eligibilityTrimAllowlist && p.eligibilityTrimAllowlist.length > 0) parts.push(`${p.eligibilityTrimAllowlist.length} trims`);
  return parts.length > 0 ? parts.join(" • ") : "All";
}

function isWarrantyCoverageDoc(d: Pick<ProductDocument, "title">) {
  const t = String(d.title ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  return t === "warranty coverage" || t === "warranty coverage image" || t === "brochure";
}

function pricingUniqKey(r: {
  termMonths: number | null;
  termKm: number | null;
  vehicleMileageMinKm?: number;
  vehicleMileageMaxKm?: number | null;
  vehicleClass?: string;
  deductibleCents: number;
  claimLimitCents?: number;
  loanAmountMinCents?: number;
  loanAmountMaxCents?: number;
  financeTermMonths?: number;
}) {
  const termMonths = r.termMonths;
  const termKm = r.termKm;
  const mileageMin = typeof r.vehicleMileageMinKm === "number" ? r.vehicleMileageMinKm : null;
  const mileageMax = r.vehicleMileageMaxKm === null ? null : typeof r.vehicleMileageMaxKm === "number" ? r.vehicleMileageMaxKm : null;
  const vehicleClass = typeof r.vehicleClass === "string" && r.vehicleClass.trim() ? r.vehicleClass.trim() : null;
  const claimLimit = typeof r.claimLimitCents === "number" ? r.claimLimitCents : null;
  const loanAmountMin = typeof r.loanAmountMinCents === "number" ? r.loanAmountMinCents : null;
  const loanAmountMax = typeof r.loanAmountMaxCents === "number" ? r.loanAmountMaxCents : null;
  const financeTermMonths = typeof r.financeTermMonths === "number" ? r.financeTermMonths : null;
  return JSON.stringify([
    termMonths,
    termKm,
    mileageMin,
    mileageMax,
    vehicleClass,
    r.deductibleCents,
    claimLimit,
    loanAmountMin,
    loanAmountMax,
    financeTermMonths,
  ]);
}

function validatePricingHealth(rows: ProductPricing[]) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return { ok: false, reason: "Published products require at least one valid pricing row.", primary: null as ProductPricing | null };
  }

  const defaults = rows.filter((r) => r.isDefault);
  if (defaults.length !== 1) {
    return { ok: false, reason: "Exactly one default pricing row is required.", primary: defaultPricingRow(rows) };
  }

  const seen = new Set<string>();
  for (const r of rows) {
    const key = pricingUniqKey(r);
    if (seen.has(key)) {
      return { ok: false, reason: "Duplicate pricing variants detected.", primary: defaultPricingRow(rows) };
    }
    seen.add(key);

    if (r.termMonths !== null && (!Number.isFinite(r.termMonths) || r.termMonths <= 0)) {
      return { ok: false, reason: "Invalid unlimited usage.", primary: defaultPricingRow(rows) };
    }
    if (r.termKm !== null && (!Number.isFinite(r.termKm) || r.termKm <= 0)) {
      return { ok: false, reason: "Invalid unlimited usage.", primary: defaultPricingRow(rows) };
    }

    if (!Number.isFinite(r.basePriceCents) || r.basePriceCents <= 0) {
      return { ok: false, reason: "Missing required fields.", primary: defaultPricingRow(rows) };
    }
    if (!Number.isFinite(r.deductibleCents) || r.deductibleCents < 0) {
      return { ok: false, reason: "Missing required fields.", primary: defaultPricingRow(rows) };
    }
    if (typeof r.vehicleMileageMinKm === "number" && r.vehicleMileageMinKm < 0) {
      return { ok: false, reason: "Invalid mileage bands.", primary: defaultPricingRow(rows) };
    }
    if (typeof r.vehicleMileageMaxKm === "number" && r.vehicleMileageMaxKm < 0) {
      return { ok: false, reason: "Invalid mileage bands.", primary: defaultPricingRow(rows) };
    }
    if (typeof r.vehicleMileageMinKm === "number" && typeof r.vehicleMileageMaxKm === "number" && r.vehicleMileageMaxKm < r.vehicleMileageMinKm) {
      return { ok: false, reason: "Invalid mileage bands.", primary: defaultPricingRow(rows) };
    }
  }

  return { ok: true, reason: null as string | null, primary: defaults[0] ?? defaultPricingRow(rows) };
}

type EditorState = {
  id?: string;
  name: string;
  productType: ProductType;
  programCode: string;
  pricingStructure: PricingStructure;
  pricingVariesByMileageBand: boolean;
  pricingVariesByVehicleClass: boolean;
  classVehicleTypes: Array<{ key: string; classCode: string; vehicleTypes: string }>;
  financeBands: FinanceBand[];
  financeDefaultBandId: string;
  financeDefaultTermMonths: FinanceTermMonths;
  pricingRows: Array<{
    key: string;
    isDefault: boolean;
    termMonths: string;
    termMonthsUnlimited: boolean;
    termKm: string;
    termKmUnlimited: boolean;
    vehicleMileageMinKm: string;
    vehicleMileageMaxKm: string;
    vehicleMileageMaxUnlimited: boolean;
    vehicleClass: string;
    loanAmountMin: string;
    loanAmountMax: string;
    financeTermMonths: string;
    claimLimitType: "" | "PER_CLAIM" | "TOTAL_COVERAGE" | "FMV" | "MAX_RETAIL";
    claimLimitAmount: string;
    deductible: string;
    providerCost: string;
  }>;
  powertrainEligibility: "ALL" | "ICE" | "ELECTRIFIED" | "HEV" | "PHEV" | "BEV";
  eligibilityMaxVehicleAgeYears: string;
  eligibilityMaxMileageKm: string;
  eligibilityMakeAllowlist: string;
  eligibilityModelAllowlist: string;
  eligibilityTrimAllowlist: string;
  keyBenefits: string;
  coverageMaxLtvPercent: string;
  coverageDetails: string;
  exclusions: string;
  internalNotes: string;
  published: boolean;
};

type ProductEditorTab = "OVERVIEW" | "ELIGIBILITY" | "PRICING" | "ADDONS";
type WizardStep = 1 | 2 | 3 | 4 | 5 | 6;

type PendingAddon = {
  key: string;
  name: string;
  description: string;
  price: string;
  pricingType: "FIXED" | "PER_TERM" | "PER_CLAIM";
  appliesToAllPricingRows: boolean;
  applicableTermMonths: string[];
  applicablePricingScopeKeys?: string[];
};

function emptyEditor(): EditorState {
  return {
    name: "",
    productType: "EXTENDED_WARRANTY",
    programCode: "",
    pricingStructure: "FLAT",
    pricingVariesByMileageBand: false,
    pricingVariesByVehicleClass: false,
    classVehicleTypes: [
      {
        key: crypto.randomUUID(),
        classCode: "CLASS_1",
        vehicleTypes: "",
      },
      {
        key: crypto.randomUUID(),
        classCode: "CLASS_2",
        vehicleTypes: "",
      },
      {
        key: crypto.randomUUID(),
        classCode: "CLASS_3",
        vehicleTypes: "",
      },
      {
        key: crypto.randomUUID(),
        classCode: "CLASS_4",
        vehicleTypes: "",
      },
      {
        key: crypto.randomUUID(),
        classCode: "CLASS_5",
        vehicleTypes: "",
      },
    ],
    financeBands: [
      {
        id: crypto.randomUUID(),
        loanAmountMin: "",
        loanAmountMax: "",
        pricesByTermMonths: {},
      },
    ],
    financeDefaultBandId: "",
    financeDefaultTermMonths: 24,
    pricingRows: [
      {
        key: crypto.randomUUID(),
        isDefault: true,
        termMonths: "",
        termMonthsUnlimited: false,
        termKm: "",
        termKmUnlimited: false,
        vehicleMileageMinKm: "",
        vehicleMileageMaxKm: "",
        vehicleMileageMaxUnlimited: false,
        vehicleClass: "ALL",
        loanAmountMin: "",
        loanAmountMax: "",
        financeTermMonths: "",
        claimLimitType: "",
        claimLimitAmount: "",
        deductible: "",
        providerCost: "",
      },
    ],
    powertrainEligibility: "ALL",
    eligibilityMaxVehicleAgeYears: "",
    eligibilityMaxMileageKm: "",
    eligibilityMakeAllowlist: "",
    eligibilityModelAllowlist: "",
    eligibilityTrimAllowlist: "",
    keyBenefits: "",
    coverageMaxLtvPercent: "",
    coverageDetails: "",
    exclusions: "",
    internalNotes: "",
    published: false,
  };
}

function editorFromProduct(p: Product): EditorState {
  const fallbackRow: EditorState["pricingRows"][number] = {
    key: crypto.randomUUID(),
    isDefault: true,
    termMonths: "",
    termMonthsUnlimited: false,
    termKm: "",
    termKmUnlimited: false,
    vehicleMileageMinKm: "",
    vehicleMileageMaxKm: "",
    vehicleMileageMaxUnlimited: false,
    vehicleClass: "ALL",
    loanAmountMin: "",
    loanAmountMax: "",
    financeTermMonths: "",
    claimLimitType: "",
    claimLimitAmount: "",
    deductible: "",
    providerCost: "",
  };

  const toClassVehicleTypes = (): EditorState["classVehicleTypes"] => {
    const raw = (p.classVehicleTypes ?? null) as Record<string, string> | null;
    const fromMap = raw
      ? Object.entries(raw)
          .map(([k, v]) => ({ classCode: String(k), vehicleTypes: String(v ?? "") }))
          .filter((x) => x.classCode.trim())
      : [];

    if (fromMap.length > 0) {
      const rows = fromMap
        .sort((a, b) => a.classCode.localeCompare(b.classCode))
        .map((x) => ({ key: crypto.randomUUID(), classCode: x.classCode, vehicleTypes: x.vehicleTypes }));

      const existing = new Set(rows.map((r) => (r.classCode ?? "").trim().toUpperCase()).filter(Boolean));
      const ensure = ["CLASS_1", "CLASS_2", "CLASS_3", "CLASS_4", "CLASS_5"];
      for (const code of ensure) {
        if (!existing.has(code)) {
          rows.push({ key: crypto.randomUUID(), classCode: code, vehicleTypes: "" });
        }
      }

      return rows.sort((a, b) => (a.classCode ?? "").localeCompare(b.classCode ?? ""));
    }

    // Back-compat for previously saved class1/2/3 fields.
    return [
      { key: crypto.randomUUID(), classCode: "CLASS_1", vehicleTypes: (p.class1VehicleTypes ?? "").toString() },
      { key: crypto.randomUUID(), classCode: "CLASS_2", vehicleTypes: (p.class2VehicleTypes ?? "").toString() },
      { key: crypto.randomUUID(), classCode: "CLASS_3", vehicleTypes: (p.class3VehicleTypes ?? "").toString() },
      { key: crypto.randomUUID(), classCode: "CLASS_4", vehicleTypes: ((p as any).class4VehicleTypes ?? "").toString() },
      { key: crypto.randomUUID(), classCode: "CLASS_5", vehicleTypes: ((p as any).class5VehicleTypes ?? "").toString() },
    ];
  };

  return {
    id: p.id,
    name: p.name,
    productType: p.productType,
    programCode: (p.programCode ?? "").trim(),
    pricingStructure: p.productType === "GAP" ? (p.pricingStructure ?? "FINANCE_MATRIX") : (p.pricingStructure ?? "FLAT"),
    pricingVariesByMileageBand: false,
    pricingVariesByVehicleClass: false,
    classVehicleTypes: toClassVehicleTypes(),
    financeBands: [
      {
        id: crypto.randomUUID(),
        loanAmountMin: "",
        loanAmountMax: "",
        pricesByTermMonths: {},
      },
    ],
    financeDefaultBandId: "",
    financeDefaultTermMonths: 24,
    pricingRows: [fallbackRow],
    powertrainEligibility:
      ((p as any).powertrainEligibility ?? "ALL") === "ICE" ||
      ((p as any).powertrainEligibility ?? "ALL") === "ELECTRIFIED" ||
      ((p as any).powertrainEligibility ?? "ALL") === "HEV" ||
      ((p as any).powertrainEligibility ?? "ALL") === "PHEV" ||
      ((p as any).powertrainEligibility ?? "ALL") === "BEV"
        ? ((p as any).powertrainEligibility as any)
        : "ALL",
    eligibilityMaxVehicleAgeYears:
      typeof p.eligibilityMaxVehicleAgeYears === "number" ? String(p.eligibilityMaxVehicleAgeYears) : "",
    eligibilityMaxMileageKm:
      typeof p.eligibilityMaxMileageKm === "number" ? String(p.eligibilityMaxMileageKm) : "",
    eligibilityMakeAllowlist: allowlistToString(p.eligibilityMakeAllowlist),
    eligibilityModelAllowlist: allowlistToString(p.eligibilityModelAllowlist),
    eligibilityTrimAllowlist: allowlistToString(p.eligibilityTrimAllowlist),
    keyBenefits: (p.keyBenefits ?? "").trim(),
    coverageMaxLtvPercent:
      p.coverageMaxLtvPercent === null
        ? ""
        : typeof p.coverageMaxLtvPercent === "number"
          ? String(p.coverageMaxLtvPercent)
          : "",
    coverageDetails: p.coverageDetails ?? "",
    exclusions: p.exclusions ?? "",
    internalNotes: p.internalNotes ?? "",
    published: p.published,
  };
}

function textareaClassName() {
  return "flex min-h-[90px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";
}

function parsePositiveInt(v: string) {
  const t = (v ?? "").trim();
  if (!t) return undefined;
  const n = Number(t);
  if (!Number.isFinite(n)) return undefined;
  const i = Math.trunc(n);
  if (i <= 0) return undefined;
  return i;
}

function asClaimLimitType(v: string | undefined): ClaimLimitType | undefined {
  const t = (v ?? "").trim();
  if (!t) return undefined;
  if (t === "PER_CLAIM" || t === "TOTAL_COVERAGE" || t === "FMV" || t === "MAX_RETAIL") return t;
  return undefined;
}

function normalizeClaimLimitTypeLabel(v: string | undefined): ClaimLimitType | undefined {
  const t = (v ?? "").trim().toUpperCase();
  if (!t) return undefined;
  if (t === "PER_CLAIM" || t === "PER CLAIM") return "PER_CLAIM";
  if (t === "TOTAL_COVERAGE" || t === "TOTAL COVERAGE") return "TOTAL_COVERAGE";
  if (t === "FMV" || t === "FAIR MARKET VALUE") return "FMV";
  if (t === "MAX_RETAIL" || t === "MAX RETAIL") return "MAX_RETAIL";
  return undefined;
}

function normalizeVehicleClassLabel(v: string | undefined): string {
  const t = (v ?? "").trim().toUpperCase();
  if (!t || t === "ALL" || t === "ALL CLASSES") return "ALL";
  if (t === "CLASS_1" || t === "CLASS 1" || t === "1") return "CLASS_1";
  if (t === "CLASS_2" || t === "CLASS 2" || t === "2") return "CLASS_2";
  if (t === "CLASS_3" || t === "CLASS 3" || t === "3") return "CLASS_3";
  if (t === "CLASS_4" || t === "CLASS 4" || t === "4") return "CLASS_4";
  if (t === "CLASS_5" || t === "CLASS 5" || t === "5") return "CLASS_5";
  return "ALL";
}

function splitTableRow(line: string): string[] {
  if (line.includes("\t")) return line.split("\t").map((x) => x.trim());
  return line.split(",").map((x) => x.trim());
}

function isAllowedFinanceTermMonths(v: number) {
  return v === 24 || v === 36 || v === 48 || v === 60 || v === 72 || v === 84 || v === 96;
}

type FinanceBand = {
  id: string;
  loanAmountMin: string;
  loanAmountMax: string;
  pricesByTermMonths: Partial<Record<FinanceTermMonths, string>>;
};

function parseFinanceMatrixPaste(rawText: string): FinanceBand[] {
  const raw = (rawText ?? "").trim();
  if (!raw) throw new Error("Paste rate sheet text first.");

  const lines = raw
    .split(/\r?\n/g)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) throw new Error("Paste rate sheet text first.");

  const first = splitTableRow(lines[0]!);
  const header = first.map((h) => h.replace(/\s+/g, "").toLowerCase());

  const hasHeader = header.some((h) => h === "loan_min" || h === "loanmin" || h === "loan_amount_min" || h === "loanamountmin");
  const dataLines = hasHeader ? lines.slice(1) : lines;
  const monthCols = (hasHeader ? header.slice(2) : first.slice(2)).map((h) => Number(String(h).trim()));

  if (monthCols.length === 0 || monthCols.some((m) => !Number.isFinite(m) || !isAllowedFinanceTermMonths(m))) {
    throw new Error("Rate sheet header must include finance term columns: 24, 36, 48, 60, 72, 84, 96");
  }

  const out: FinanceBand[] = [];
  for (const line of dataLines) {
    const cols = splitTableRow(line);
    const loanMin = sanitizeMoney((cols[0] ?? "").trim());
    const loanMax = sanitizeMoney((cols[1] ?? "").trim());
    if (!loanMin || !loanMax) continue;

    const band: FinanceBand = {
      id: crypto.randomUUID(),
      loanAmountMin: loanMin,
      loanAmountMax: loanMax,
      pricesByTermMonths: {},
    };

    for (let i = 0; i < monthCols.length; i += 1) {
      const term = monthCols[i]!;
      const cell = sanitizeMoney((cols[i + 2] ?? "").trim());
      if (!cell) continue;
      band.pricesByTermMonths[term as FinanceTermMonths] = cell;
    }

    out.push(band);
  }

  if (out.length === 0) throw new Error("No finance matrix rows found in the pasted rate sheet.");
  return out;
}

function normalizeAddonPricingType(v: string | undefined): PendingAddon["pricingType"] {
  const t = (v ?? "").trim().toUpperCase();
  if (!t) return "FIXED";
  if (t === "FIXED" || t === "1X" || t === "ONE_TIME" || t === "ONE TIME") return "FIXED";
  if (t === "PER_TERM" || t === "PER TERM") return "PER_TERM";
  if (t === "PER_CLAIM" || t === "PER CLAIM") return "PER_CLAIM";
  return "FIXED";
}

function parseAddonsPaste(rawText: string): Array<{
  name: string;
  description: string;
  pricingType: PendingAddon["pricingType"];
  price: string;
  termMonths?: string;
  termKm?: string;
}> {
  const raw = (rawText ?? "").trim();
  if (!raw) throw new Error("Paste add-ons table text first.");

  const lines = raw
    .split(/\r?\n/g)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) throw new Error("Paste add-ons table text first.");

  const first = splitTableRow(lines[0]!);
  const header = first.map((h) => h.replace(/\s+/g, "").toLowerCase());

  const idxName = header.findIndex((h) => h === "name" || h === "addon" || h === "addonname" || h === "add-on" || h === "add-onname");
  const idxPrice = header.findIndex((h) => h === "price" || h === "amount" || h === "dealerprice" || h === "dealer_cost" || h === "dealercost");
  const idxDesc = header.findIndex((h) => h === "description" || h === "desc");
  const idxType = header.findIndex((h) => h === "pricingtype" || h === "type" || h === "pricing");
  const idxTerm = header.findIndex((h) => h === "termmonths" || h === "term" || h === "months");
  const idxKm = header.findIndex((h) => h === "termkm" || h === "km" || h === "termkilometers" || h === "termkilometres");

  const hasHeader = idxName >= 0 || idxPrice >= 0;
  const dataLines = hasHeader ? lines.slice(1) : lines;

  const parseNoHeaderRow = (cols: string[]) => {
    const c = cols.map((x) => String(x ?? "").trim());
    if (c.length < 2) return null;
    if (c.length === 2) {
      return { name: c[0] ?? "", description: "", pricingType: "FIXED" as const, price: sanitizeMoney(c[1] ?? "") };
    }
    if (c.length === 3) {
      const maybePrice = sanitizeMoney(c[2] ?? "");
      return { name: c[0] ?? "", description: c[1] ?? "", pricingType: "FIXED" as const, price: maybePrice };
    }
    const name = c[0] ?? "";
    const description = c[1] ?? "";
    const pricingType = normalizeAddonPricingType(c[2]);
    const price = sanitizeMoney(c[3] ?? "");
    return { name, description, pricingType, price };
  };

  const out: Array<{
    name: string;
    description: string;
    pricingType: PendingAddon["pricingType"];
    price: string;
    termMonths?: string;
    termKm?: string;
  }> = [];
  for (const line of dataLines) {
    const cols = splitTableRow(line);
    if (cols.length === 0) continue;

    const parsed = hasHeader
      ? (() => {
          const name = String(cols[idxName >= 0 ? idxName : 0] ?? "").trim();
          const description = idxDesc >= 0 ? String(cols[idxDesc] ?? "").trim() : "";
          const pricingType = normalizeAddonPricingType(idxType >= 0 ? String(cols[idxType] ?? "") : "");
          const priceRaw = idxPrice >= 0 ? String(cols[idxPrice] ?? "") : String(cols[cols.length - 1] ?? "");
          const price = sanitizeMoney(priceRaw);
          const termMonths = idxTerm >= 0 ? String(cols[idxTerm] ?? "").trim() : "";
          const termKm = idxKm >= 0 ? String(cols[idxKm] ?? "").trim() : "";
          return { name, description, pricingType, price, termMonths: termMonths || undefined, termKm: termKm || undefined };
        })()
      : parseNoHeaderRow(cols);

    if (!parsed) continue;
    const name = (parsed.name ?? "").trim();
    const price = sanitizeMoney(parsed.price ?? "");
    if (!name) continue;
    if (!price) continue;

    const t = typeof (parsed as any).termMonths === "string" ? String((parsed as any).termMonths).trim() : "";
    const k = typeof (parsed as any).termKm === "string" ? String((parsed as any).termKm).trim() : "";
    out.push({
      name,
      description: (parsed.description ?? "").trim(),
      pricingType: parsed.pricingType ?? "FIXED",
      price: formatMoneyInput(price),
      termMonths: t ? t : undefined,
      termKm: k ? k : undefined,
    });
  }

  if (out.length === 0) throw new Error("No add-on rows found. Ensure you include at least name + price.");
  return out;
}

export function ProviderProductsPage() {
  const api = useMemo(() => getProductsApi(), []);
  const pricingApi = useMemo(() => getProductPricingApi(), []);
  const addonsApi = useMemo(() => getProductAddonsApi(), []);
  const documentsApi = useMemo(() => getDocumentsApi(), []);
  const qc = useQueryClient();

  const [showEditor, setShowEditor] = useState(false);
  const [editor, setEditor] = useState<EditorState>(() => emptyEditor());
  const [activeTab, setActiveTab] = useState<ProductEditorTab>("OVERVIEW");
  const [wizardStep, setWizardStep] = useState<WizardStep>(1);
  const [error, setError] = useState<string | null>(null);

  const saveInFlightRef = useRef(false);
  const brochureInputRef = useRef<HTMLInputElement | null>(null);
  const [saveInFlight, setSaveInFlight] = useState(false);

  const [pastePricingOpen, setPastePricingOpen] = useState(false);
  const [pastePricingText, setPastePricingText] = useState("");

  const [pasteFinanceOpen, setPasteFinanceOpen] = useState(false);
  const [pasteFinanceText, setPasteFinanceText] = useState("");

  const [pasteAddonsOpen, setPasteAddonsOpen] = useState(false);
  const [pasteAddonsText, setPasteAddonsText] = useState("");

  const [pendingAddons, setPendingAddons] = useState<PendingAddon[]>([]);
  const [activeAddonTermTab, setActiveAddonTermTab] = useState<string>("ALL");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "DRAFT" | "PUBLISHED">("ALL");

  const editorProductId = (editor.id ?? "").trim();

  const brochureDocsQuery = useQuery({
    queryKey: ["product-documents", editorProductId],
    enabled: showEditor && !!editorProductId,
    queryFn: () => documentsApi.list({ productId: editorProductId }),
  });

  const brochureDocs = useMemo(() => {
    const docs = (brochureDocsQuery.data ?? []) as ProductDocument[];
    return docs.filter(isWarrantyCoverageDoc);
  }, [brochureDocsQuery.data]);

  const uploadBrochureMutation = useMutation({
    mutationFn: async (file: File) => {
      const productId = editorProductId;
      if (!productId) throw new Error("Save the product before uploading an image.");
      const existing = (await documentsApi.list({ productId })) as ProductDocument[];
      for (const d of existing.filter(isWarrantyCoverageDoc)) {
        await documentsApi.remove(d.id);
      }
      return documentsApi.upload({ title: "Warranty Coverage", file, productId });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["product-documents", editorProductId] });
    },
  });

  const removeBrochureMutation = useMutation({
    mutationFn: async (id: string) => {
      await documentsApi.remove(id);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["product-documents", editorProductId] });
    },
  });

  const pricingRowsQuery = useQuery({
    queryKey: ["provider-product-pricing", editorProductId],
    enabled: showEditor && !!editorProductId,
    queryFn: () => pricingApi.list({ productId: editorProductId }),
  });

  const pricingRowsFromApi = (pricingRowsQuery.data ?? []) as ProductPricing[];

  const pricingRowScopeKeyById = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of pricingRowsFromApi) {
      const id = (r.id ?? "").trim();
      if (!id) continue;
      const mk = r.termMonths === null ? "UNL" : typeof r.termMonths === "number" ? String(Math.round(r.termMonths)) : "UNL";
      const kk = r.termKm === null ? "UNL" : typeof r.termKm === "number" ? String(Math.round(r.termKm)) : "UNL";
      map.set(id, `${mk}|${kk}`);
    }
    return map;
  }, [pricingRowsFromApi]);

  const pricingScopesFromApi = useMemo(() => {
    const byKey = new Map<string, { scopeKey: string; termMonths: number | null; termKm: number | null; pricingRowIds: string[] }>();
    for (const r of pricingRowsFromApi) {
      const id = (r.id ?? "").trim();
      if (!id) continue;
      const mk = r.termMonths === null ? "UNL" : typeof r.termMonths === "number" ? String(Math.round(r.termMonths)) : "UNL";
      const kk = r.termKm === null ? "UNL" : typeof r.termKm === "number" ? String(Math.round(r.termKm)) : "UNL";
      const scopeKey = `${mk}|${kk}`;
      const existing = byKey.get(scopeKey);
      if (existing) {
        existing.pricingRowIds.push(id);
      } else {
        byKey.set(scopeKey, {
          scopeKey,
          termMonths: typeof r.termMonths === "number" && Number.isFinite(r.termMonths) ? Math.round(r.termMonths) : null,
          termKm: typeof r.termKm === "number" && Number.isFinite(r.termKm) ? Math.round(r.termKm) : null,
          pricingRowIds: [id],
        });
      }
    }

    return Array.from(byKey.values()).sort((a, b) => {
      const am = a.termMonths === null ? Number.POSITIVE_INFINITY : a.termMonths;
      const bm = b.termMonths === null ? Number.POSITIVE_INFINITY : b.termMonths;
      const ak = a.termKm === null ? Number.POSITIVE_INFINITY : a.termKm;
      const bk = b.termKm === null ? Number.POSITIVE_INFINITY : b.termKm;
      return (am - bm) || (ak - bk) || a.scopeKey.localeCompare(b.scopeKey);
    });
  }, [pricingRowsFromApi]);

  const pricingScopesFromEditor = useMemo(() => {
    const byKey = new Map<string, { scopeKey: string; termMonths: number | null; termKm: number | null; pricingRowIds: string[] }>();
    for (const r of editor.pricingRows) {
      const termMonths = r.termMonthsUnlimited ? null : parsePositiveInt(r.termMonths);
      const termKm = r.termKmUnlimited ? null : parsePositiveInt(r.termKm);
      if (termMonths === undefined && termKm === undefined) continue;

      const mk = termMonths === null ? "UNL" : typeof termMonths === "number" ? String(Math.round(termMonths)) : "UNL";
      const kk = termKm === null ? "UNL" : typeof termKm === "number" ? String(Math.round(termKm)) : "UNL";
      const scopeKey = `${mk}|${kk}`;
      if (!byKey.has(scopeKey)) {
        byKey.set(scopeKey, {
          scopeKey,
          termMonths: typeof termMonths === "number" && Number.isFinite(termMonths) ? Math.round(termMonths) : null,
          termKm: typeof termKm === "number" && Number.isFinite(termKm) ? Math.round(termKm) : null,
          pricingRowIds: [],
        });
      }
    }

    return Array.from(byKey.values()).sort((a, b) => {
      const am = a.termMonths === null ? Number.POSITIVE_INFINITY : a.termMonths;
      const bm = b.termMonths === null ? Number.POSITIVE_INFINITY : b.termMonths;
      const ak = a.termKm === null ? Number.POSITIVE_INFINITY : a.termKm;
      const bk = b.termKm === null ? Number.POSITIVE_INFINITY : b.termKm;
      return (am - bm) || (ak - bk) || a.scopeKey.localeCompare(b.scopeKey);
    });
  }, [editor.pricingRows]);

  const pricingRowTermMonthsById = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of pricingRowsFromApi) {
      const id = (r.id ?? "").trim();
      if (!id) continue;
      if (typeof r.termMonths === "number" && Number.isFinite(r.termMonths) && r.termMonths > 0) {
        map.set(id, r.termMonths);
      }
    }
    return map;
  }, [pricingRowsFromApi]);

  const addonsQuery = useQuery({
    queryKey: ["product-addons", editorProductId],
    enabled: showEditor && !!editorProductId,
    queryFn: () => addonsApi.list({ productId: editorProductId }),
  });

  const addons = (addonsQuery.data ?? []) as ProductAddon[];

  const hasHydratedAddons = useRef(false);
  const hydratedAddonsProductId = useRef<string>("");
  useEffect(() => {
    if (!showEditor) {
      hasHydratedAddons.current = false;
      hydratedAddonsProductId.current = "";
      return;
    }

    if (hydratedAddonsProductId.current !== editorProductId) {
      hasHydratedAddons.current = false;
      hydratedAddonsProductId.current = editorProductId;
    }

    if (!editorProductId) {
      hasHydratedAddons.current = false;
      setPendingAddons((s) =>
        s.length > 0
          ? s
          : [
              {
                key: crypto.randomUUID(),
                name: "",
                description: "",
                pricingType: "FIXED",
                price: "",
                appliesToAllPricingRows: true,
                applicableTermMonths: [],
              },
            ],
      );
      return;
    }

    if (addonsQuery.isLoading || addonsQuery.isError) return;
    if (pricingRowsQuery.isLoading || pricingRowsQuery.isError) return;
    if (hasHydratedAddons.current) return;

    const needsPricingMap = addons.some((a) => {
      const appliesToAll = typeof (a as any).appliesToAllPricingRows === "boolean" ? Boolean((a as any).appliesToAllPricingRows) : true;
      if (appliesToAll) return false;
      const ids = Array.isArray((a as any).applicablePricingRowIds)
        ? ((a as any).applicablePricingRowIds as unknown[]).filter((x) => typeof x === "string")
        : [];
      return ids.length > 0;
    });
    if (needsPricingMap && pricingRowTermMonthsById.size === 0) return;

    const mapped = addons
      .slice()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((a): PendingAddon => ({
        key: a.id,
        name: a.name,
        description: a.description ?? "",
        pricingType: ((a as any).pricingType ?? "FIXED") as any,
        price: centsToDollars(typeof a.dealerCostCents === "number" ? a.dealerCostCents : a.basePriceCents),
        appliesToAllPricingRows:
          typeof (a as any).appliesToAllPricingRows === "boolean" ? Boolean((a as any).appliesToAllPricingRows) : true,
        applicablePricingScopeKeys: (() => {
          const appliesToAll =
            typeof (a as any).appliesToAllPricingRows === "boolean" ? Boolean((a as any).appliesToAllPricingRows) : true;
          if (appliesToAll) return undefined;
          const ids = Array.isArray((a as any).applicablePricingRowIds)
            ? ((a as any).applicablePricingRowIds as unknown[]).filter((x) => typeof x === "string")
            : [];
          const scopes = new Set<string>();
          for (const id of ids) {
            const k = pricingRowScopeKeyById.get(id);
            if (k) scopes.add(k);
          }
          return scopes.size > 0 ? Array.from(scopes.values()).sort((x, y) => x.localeCompare(y)) : undefined;
        })(),
        applicableTermMonths: (() => {
          const appliesToAll =
            typeof (a as any).appliesToAllPricingRows === "boolean" ? Boolean((a as any).appliesToAllPricingRows) : true;
          if (appliesToAll) return [] as string[];

          const direct: number[] = Array.isArray((a as any).applicableTermMonths)
            ? ((a as any).applicableTermMonths as unknown[])
                .map((x) => Number(String(x ?? "").trim()))
                .filter((n) => Number.isFinite(n) && n > 0)
                .map((n) => Math.round(n))
            : [];
          if (direct.length > 0) {
            return Array.from(new Set(direct))
              .sort((x, y) => x - y)
              .map((n) => String(n));
          }

          const ids = Array.isArray((a as any).applicablePricingRowIds)
            ? ((a as any).applicablePricingRowIds as unknown[]).filter((x) => typeof x === "string")
            : [];
          const terms = new Set<number>();
          for (const id of ids) {
            const t = pricingRowTermMonthsById.get(id);
            if (typeof t === "number") terms.add(t);
          }
          return Array.from(terms.values())
            .sort((x, y) => x - y)
            .map((n) => String(n));
        })(),
      }));

    hasHydratedAddons.current = true;
    setPendingAddons(
      mapped.length > 0
        ? mapped
        : [
            {
              key: crypto.randomUUID(),
              name: "",
              description: "",
              pricingType: "FIXED",
              price: "",
              appliesToAllPricingRows: true,
              applicableTermMonths: [],
            },
          ],
    );
  }, [
    addons,
    addonsQuery.isError,
    addonsQuery.isLoading,
    editorProductId,
    pricingRowScopeKeyById,
    pricingRowTermMonthsById,
    pricingRowsQuery.isError,
    pricingRowsQuery.isLoading,
    showEditor,
  ]);

  const productsQuery = useQuery({
    queryKey: ["provider-products"],
    queryFn: () => api.list(),
  });

  const uniqueAddonScopeOptions = useMemo(() => {
    if (pricingScopesFromApi.length > 0) return pricingScopesFromApi;
    return pricingScopesFromEditor;
  }, [pricingScopesFromApi, pricingScopesFromEditor]);

  const invalidAddonsCount = useMemo(() => {
    const validScopes = new Set(uniqueAddonScopeOptions.map((s) => s.scopeKey));
    let c = 0;
    for (const a of pendingAddons) {
      if (a.appliesToAllPricingRows) continue;
      const scopes = Array.isArray(a.applicablePricingScopeKeys) ? a.applicablePricingScopeKeys.map((t) => String(t)) : [];
      if (scopes.length > 0) {
        if (scopes.some((s) => !validScopes.has(s))) c++;
        continue;
      }

      const terms = Array.isArray(a.applicableTermMonths) ? a.applicableTermMonths.map((t) => String(t)) : [];
      if (terms.length === 0) c++;
    }
    return c;
  }, [pendingAddons, uniqueAddonScopeOptions]);

  useEffect(() => {
    if (!showEditor) return;
    if (activeAddonTermTab === "ALL") return;
    if (activeAddonTermTab === "INVALID") return;
    const valid = new Set(uniqueAddonScopeOptions.map((s) => s.scopeKey));
    if (!valid.has(activeAddonTermTab)) {
      setActiveAddonTermTab("ALL");
    }
  }, [activeAddonTermTab, showEditor, uniqueAddonScopeOptions]);
  useEffect(() => {
    if (!showEditor) return;
    if (!editorProductId) return;
    if (pricingRowsQuery.isLoading) return;
    if (pricingRowsQuery.isError) return;

    if (pricingRowsFromApi.length === 0) return;

    setEditor((s) => {
      if ((s.id ?? "").trim() !== editorProductId) return s;
      const mapped = pricingRowsFromApi
        .slice()
        .sort((a, b) => {
          const am = a.termMonths ?? Number.MAX_SAFE_INTEGER;
          const bm = b.termMonths ?? Number.MAX_SAFE_INTEGER;
          const ak = a.termKm ?? Number.MAX_SAFE_INTEGER;
          const bk = b.termKm ?? Number.MAX_SAFE_INTEGER;
          return (am - bm) || (ak - bk) || (a.deductibleCents - b.deductibleCents);
        })
        .map((r): EditorState["pricingRows"][number] => {
          const persistedType = asClaimLimitType(typeof (r as any).claimLimitType === "string" ? (r as any).claimLimitType : undefined);
          const inferredType = !persistedType && typeof r.claimLimitCents === "number" && r.claimLimitCents > 0 ? ("PER_CLAIM" as const) : undefined;
          const claimLimitType = persistedType ?? inferredType ?? "";

          const amountCents =
            typeof (r as any).claimLimitAmountCents === "number"
              ? (r as any).claimLimitAmountCents
              : typeof r.claimLimitCents === "number"
                ? r.claimLimitCents
                : undefined;

          return {
            key: r.id,
            isDefault: r.isDefault === true,
            termMonths: r.termMonths === null ? "" : String(r.termMonths),
            termMonthsUnlimited: r.termMonths === null,
            termKm: r.termKm === null ? "" : String(r.termKm),
            termKmUnlimited: r.termKm === null,
            vehicleMileageMinKm: typeof r.vehicleMileageMinKm === "number" ? String(r.vehicleMileageMinKm) : "",
            vehicleMileageMaxKm: r.vehicleMileageMaxKm === null ? "" : typeof r.vehicleMileageMaxKm === "number" ? String(r.vehicleMileageMaxKm) : "",
            vehicleMileageMaxUnlimited: r.vehicleMileageMaxKm === null,
            vehicleClass: typeof r.vehicleClass === "string" && r.vehicleClass.trim() ? r.vehicleClass.trim() : "ALL",
            loanAmountMin: typeof (r as any).loanAmountMinCents === "number" ? String((r as any).loanAmountMinCents / 100) : "",
            loanAmountMax: typeof (r as any).loanAmountMaxCents === "number" ? String((r as any).loanAmountMaxCents / 100) : "",
            financeTermMonths: typeof (r as any).financeTermMonths === "number" ? String((r as any).financeTermMonths) : "",
            claimLimitType,
            claimLimitAmount: typeof amountCents === "number" ? centsToDollars(amountCents) : "",
            deductible: centsToDollars(r.deductibleCents),
            providerCost: centsToDollars(r.basePriceCents),
          };
        });

      const variesByMileageBand = pricingRowsFromApi.some(
        (r) => typeof r.vehicleMileageMinKm === "number" || r.vehicleMileageMaxKm === null || typeof r.vehicleMileageMaxKm === "number",
      );

      const variesByVehicleClass = pricingRowsFromApi.some((r) => typeof r.vehicleClass === "string" && r.vehicleClass.trim());

      const hasFinanceMatrix = pricingRowsFromApi.some((r) => typeof (r as any).financeTermMonths === "number");

      const nextFinanceBands = (() => {
        if (!hasFinanceMatrix) return s.financeBands;

        const byBand = new Map<string, FinanceBand>();
        for (const r of pricingRowsFromApi) {
          const term = (r as any).financeTermMonths;
          const min = (r as any).loanAmountMinCents;
          const max = (r as any).loanAmountMaxCents;
          const net = (r as any).providerNetCostCents;

          if (typeof term !== "number" || !isAllowedFinanceTermMonths(term)) continue;
          if (typeof min !== "number" || typeof max !== "number") continue;
          if (typeof net !== "number") continue;

          const minD = (min / 100).toFixed(2).replace(/\.00$/, "");
          const maxD = (max / 100).toFixed(2).replace(/\.00$/, "");
          const k = `${min}|${max}`;
          const existing = byBand.get(k);
          if (existing) {
            existing.pricesByTermMonths[term as FinanceTermMonths] = centsToDollars(net);
          } else {
            byBand.set(k, {
              id: crypto.randomUUID(),
              loanAmountMin: minD,
              loanAmountMax: maxD,
              pricesByTermMonths: { [term as FinanceTermMonths]: centsToDollars(net) },
            });
          }
        }
        const arr = Array.from(byBand.values()).sort((a, b) => {
          const am = dollarsToCents(a.loanAmountMin) ?? 0;
          const bm = dollarsToCents(b.loanAmountMin) ?? 0;
          return am - bm;
        });
        return arr.length > 0 ? arr : s.financeBands;
      })();

      const nextDefault = (() => {
        if (!hasFinanceMatrix) return { bandId: s.financeDefaultBandId, term: s.financeDefaultTermMonths };
        const d = pricingRowsFromApi.find((r) => r.isDefault === true) as any;
        if (!d) return { bandId: s.financeDefaultBandId, term: s.financeDefaultTermMonths };
        const term = d.financeTermMonths;
        const min = d.loanAmountMinCents;
        const max = d.loanAmountMaxCents;
        if (typeof term !== "number" || !isAllowedFinanceTermMonths(term) || typeof min !== "number" || typeof max !== "number") {
          return { bandId: s.financeDefaultBandId, term: s.financeDefaultTermMonths };
        }
        const band = nextFinanceBands.find(
          (b) => dollarsToCents(b.loanAmountMin) === min && dollarsToCents(b.loanAmountMax) === max,
        );
        return { bandId: band?.id ?? s.financeDefaultBandId, term: term as FinanceTermMonths };
      })();

      if (mapped.length === 0) return s;
      const same =
        s.pricingRows.length === mapped.length &&
        s.pricingRows.every((row, idx) => {
          const next = mapped[idx]!;
          return (
            row.key === next.key &&
            row.isDefault === next.isDefault &&
            row.termMonths === next.termMonths &&
            row.termMonthsUnlimited === next.termMonthsUnlimited &&
            row.termKm === next.termKm &&
            row.termKmUnlimited === next.termKmUnlimited &&
            row.vehicleMileageMinKm === next.vehicleMileageMinKm &&
            row.vehicleMileageMaxKm === next.vehicleMileageMaxKm &&
            row.vehicleMileageMaxUnlimited === next.vehicleMileageMaxUnlimited &&
            row.vehicleClass === next.vehicleClass &&
            row.loanAmountMin === next.loanAmountMin &&
            row.loanAmountMax === next.loanAmountMax &&
            row.financeTermMonths === next.financeTermMonths &&
            row.claimLimitType === next.claimLimitType &&
            row.claimLimitAmount === next.claimLimitAmount &&
            row.deductible === next.deductible &&
            row.providerCost === next.providerCost
          );
        });

      if (same) return s;
      return {
        ...s,
        pricingRows: mapped,
        pricingStructure: hasFinanceMatrix ? "FINANCE_MATRIX" : s.pricingStructure,
        pricingVariesByMileageBand: variesByMileageBand,
        pricingVariesByVehicleClass: variesByVehicleClass,
        financeBands: nextFinanceBands,
        financeDefaultBandId: nextDefault.bandId,
        financeDefaultTermMonths: nextDefault.term,
      };
    });
  }, [editorProductId, pricingRowsFromApi, pricingRowsQuery.isError, pricingRowsQuery.isLoading, showEditor]);

  const createMutation = useMutation({
    mutationFn: (input: CreateProductInput) => api.create(input),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["provider-products"] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Parameters<typeof api.update>[1] }) => api.update(id, patch),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["provider-products"] });
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (id: string) => {
      const productId = (id ?? "").trim();
      if (!productId) return;

      const existing = await pricingApi.list({ productId });
      for (const r of existing) {
        await pricingApi.remove(r.id);
      }

      await api.remove(productId);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["provider-products"] });
    },
  });

  const products = (productsQuery.data ?? []) as Product[];

  const pricingHealthProductIds = useMemo(() => {
    return products
      .map((p) => (p.id ?? "").trim())
      .filter(Boolean);
  }, [products]);

  const pricingHealthQueries = useQueries({
    queries: pricingHealthProductIds.map((productId) => ({
        queryKey: ["provider-product-pricing-health", productId],
        queryFn: () => pricingApi.list({ productId }),
        staleTime: 15_000,
      })),
  });

  const pricingHealthByProductId = useMemo(() => {
    const map = new Map<string, ReturnType<typeof validatePricingHealth>>();
    for (let i = 0; i < pricingHealthQueries.length; i += 1) {
      const q = pricingHealthQueries[i]!;
      const productId = pricingHealthProductIds[i] ?? "";
      if (!productId) continue;
      const rows = (q.data ?? []) as ProductPricing[];
      map.set(productId, validatePricingHealth(rows));
    }
    return map;
  }, [pricingHealthProductIds, pricingHealthQueries]);

  const filteredProducts = products
    .filter((p) => {
      if (statusFilter === "PUBLISHED") return p.published;
      if (statusFilter === "DRAFT") return !p.published;
      return true;
    })
    .filter((p) => {
      const q = search.trim().toLowerCase();
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        productTypeLabel(p.productType).toLowerCase().includes(q) ||
        (p.coverageDetails ?? "").toLowerCase().includes(q) ||
        (p.exclusions ?? "").toLowerCase().includes(q)
      );
    });

  const publishedCount = products.filter((p) => p.published).length;
  const draftCount = products.filter((p) => !p.published).length;

  const beginNew = () => {
    setError(null);
    setEditor(emptyEditor());
    setActiveTab("OVERVIEW");
    setWizardStep(1);
    setPendingAddons([]);
    setShowEditor(true);
  };

  const beginEdit = (p: Product) => {
    setError(null);
    setEditor(editorFromProduct(p));
    setActiveTab("OVERVIEW");
    setWizardStep(1);
    setPendingAddons([]);
    setShowEditor(true);
  };

  const beginEditTab = (p: Product, tab: ProductEditorTab) => {
    setError(null);
    setEditor(editorFromProduct(p));
    setActiveTab(tab);
    const stepMap: Record<ProductEditorTab, WizardStep> = {
      OVERVIEW: 1,
      ELIGIBILITY: 3,
      PRICING: 4,
      ADDONS: 5,
    };
    setWizardStep(stepMap[tab] ?? 1);
    setPendingAddons([]);
    setShowEditor(true);
  };

  const onSubmit = async () => {
    if (saveInFlightRef.current) return;
    setError(null);

    const name = editor.name.trim();
    if (!name) {
      setError("Product name is required");
      setActiveTab("OVERVIEW");
      return;
    }

    type ValidatedRow = {
      key: string;
      isDefault: boolean;
      termMonths: number | null;
      termKm: number | null;
      vehicleMileageMinKm?: number;
      vehicleMileageMaxKm?: number | null;
      vehicleClass?: string;
      loanAmountMinCents?: number;
      loanAmountMaxCents?: number;
      financeTermMonths?: number;
      deductibleCents: number;
      claimLimitCents?: number;
      claimLimitType?: ClaimLimitType;
      claimLimitAmountCents?: number;
      providerCostCents: number;
    };

    if (editor.pricingStructure === "FINANCE_MATRIX") {
      const bands = editor.financeBands.slice();
      if (bands.length === 0) {
        setError("Add at least one loan band.");
        setActiveTab("PRICING");
        return;
      }

      const parsedBands = bands
        .map((b) => {
          const minCents = dollarsToCents(b.loanAmountMin);
          const maxCents = dollarsToCents(b.loanAmountMax);
          return { b, minCents, maxCents };
        })
        .sort((a, b) => ((a.minCents ?? 0) - (b.minCents ?? 0)));

      for (const { b, minCents, maxCents } of parsedBands) {
        if (typeof minCents !== "number" || typeof maxCents !== "number") {
          setError("All loan bands require loan min and loan max.");
          setActiveTab("PRICING");
          return;
        }
        if (maxCents <= minCents) {
          setError("Each loan band requires loan max > loan min.");
          setActiveTab("PRICING");
          return;
        }
        for (const t of FINANCE_TERMS) {
          const dollars = (b.pricesByTermMonths?.[t] ?? "").trim();
          const cents = dollarsToCents(dollars);
          if (typeof cents !== "number" || cents <= 0) {
            setError("Every finance term price must be filled for every loan band.");
            setActiveTab("PRICING");
            return;
          }
        }
      }

      for (let i = 0; i < parsedBands.length; i += 1) {
        const a = parsedBands[i]!;
        if (typeof a.minCents !== "number" || typeof a.maxCents !== "number") continue;
        for (let j = i + 1; j < parsedBands.length; j += 1) {
          const b = parsedBands[j]!;
          if (typeof b.minCents !== "number" || typeof b.maxCents !== "number") continue;
          if (b.minCents > a.maxCents) break;
          const overlaps = Math.max(a.minCents, b.minCents) <= Math.min(a.maxCents, b.maxCents);
          if (overlaps) {
            setError("Overlapping loan bands detected. Please adjust loan ranges so they do not overlap.");
            setActiveTab("PRICING");
            return;
          }
        }
      }

      if (!editor.financeDefaultBandId) {
        setError("Select a default cell (radio button) in the Finance Matrix.");
        setActiveTab("PRICING");
        return;
      }

      saveInFlightRef.current = true;
      setSaveInFlight(true);
      let saveStep = "";
      try {
        const input: CreateProductInput = {
          name,
          productType: editor.productType,
          pricingStructure: editor.pricingStructure,
          powertrainEligibility: editor.powertrainEligibility,
          keyBenefits: editor.keyBenefits.trim(),
          coverageMaxLtvPercent: parseOptionalPct(editor.coverageMaxLtvPercent),
          coverageDetails: editor.coverageDetails.trim(),
          exclusions: editor.exclusions.trim(),
          classVehicleTypes: Object.fromEntries(
            editor.classVehicleTypes
              .map((x) => ({ classCode: (x.classCode ?? "").trim(), vehicleTypes: (x.vehicleTypes ?? "").trim() }))
              .filter((x) => x.classCode && x.vehicleTypes)
              .map((x) => [x.classCode, x.vehicleTypes])
          ),
          eligibilityMaxVehicleAgeYears: parseOptionalInt(editor.eligibilityMaxVehicleAgeYears),
          eligibilityMaxMileageKm: parseOptionalInt(editor.eligibilityMaxMileageKm),
          eligibilityMakeAllowlist: parseAllowlist(editor.eligibilityMakeAllowlist),
          eligibilityModelAllowlist: parseAllowlist(editor.eligibilityModelAllowlist),
          eligibilityTrimAllowlist: parseAllowlist(editor.eligibilityTrimAllowlist),
        };

        const overviewExtrasPatch = {
          programCode: editor.programCode.trim() || "",
          internalNotes: editor.internalNotes.trim() || "",
        };

        const allowlistsForUpdate = {
          eligibilityMakeAllowlist: parseAllowlist(editor.eligibilityMakeAllowlist) ?? [],
          eligibilityModelAllowlist: parseAllowlist(editor.eligibilityModelAllowlist) ?? [],
          eligibilityTrimAllowlist: parseAllowlist(editor.eligibilityTrimAllowlist) ?? [],
        };

        let savedProduct: Product | null = null;
        if (!editor.id) {
          saveStep = "Create product";
          savedProduct = (await createMutation.mutateAsync(input)) as Product;
          saveStep = "Update product";
          savedProduct = (await updateMutation.mutateAsync({ id: savedProduct.id, patch: overviewExtrasPatch })) as Product;
        } else {
          saveStep = "Update product";
          savedProduct = (await updateMutation.mutateAsync({
            id: editor.id,
            patch: {
              name: input.name,
              productType: input.productType,
              pricingStructure: "FINANCE_MATRIX",
              powertrainEligibility: input.powertrainEligibility,
              keyBenefits: input.keyBenefits ?? "",
              coverageMaxLtvPercent: input.coverageMaxLtvPercent ?? null,
              coverageDetails: input.coverageDetails ?? "",
              exclusions: input.exclusions ?? "",
              classVehicleTypes: input.classVehicleTypes ?? {},
              ...overviewExtrasPatch,
              ...(input.coverageMaxLtvPercent === null ? { coverageMaxLtvPercent: null } : {}),
              eligibilityMaxVehicleAgeYears: parseOptionalIntOrNull(editor.eligibilityMaxVehicleAgeYears),
              eligibilityMaxMileageKm: parseOptionalIntOrNull(editor.eligibilityMaxMileageKm),
              ...allowlistsForUpdate,
            },
          })) as Product;
        }

        const productId = (savedProduct?.id ?? editor.id ?? "").trim();
        if (productId) {
          saveStep = "Delete existing pricing";
          const existing = await pricingApi.list({ productId });
          for (const r of existing) await pricingApi.remove(r.id);

          const defaultBand = editor.financeBands.find((b) => b.id === editor.financeDefaultBandId) ?? null;

          saveStep = "Create finance matrix pricing";
          {
            const toCreate: any[] = [];
            for (const band of editor.financeBands) {
              const loanAmountMinCents = dollarsToCents(band.loanAmountMin)!;
              const loanAmountMaxCents = dollarsToCents(band.loanAmountMax)!;
              for (const term of FINANCE_TERMS) {
                const net = dollarsToCents((band.pricesByTermMonths?.[term] ?? "").trim())!;
                const isDefault = defaultBand?.id === band.id && editor.financeDefaultTermMonths === term;
                toCreate.push({
                  productId,
                  isDefault,
                  termMonths: null,
                  termKm: null,
                  financeTermMonths: term,
                  loanAmountMinCents,
                  loanAmountMaxCents,
                  providerNetCostCents: net,
                  deductibleCents: 0,
                  basePriceCents: net,
                  dealerCostCents: net,
                });
              }
            }

            const chunk = <T,>(arr: T[], size: number) => {
              if (!Array.isArray(arr) || arr.length === 0) return [] as T[][];
              const s = Math.max(1, Math.floor(size));
              const out: T[][] = [];
              for (let i = 0; i < arr.length; i += s) out.push(arr.slice(i, i + s));
              return out;
            };

            for (const batch of chunk(toCreate, 25)) {
              await Promise.all(batch.map((row) => pricingApi.create(row)));
            }
          }

          saveStep = "Refresh pricing";
          await qc.invalidateQueries({ queryKey: ["product-pricing", productId] });
        }

        setShowEditor(false);
        setPastePricingOpen(false);
        setPasteFinanceOpen(false);
        setPastePricingText("");
        setPasteFinanceText("");
        saveStep = "Refresh products";
        await qc.invalidateQueries({ queryKey: ["provider-products"] });
      } catch (e) {
        console.error("Failed to save finance matrix product", { step: saveStep, error: e });
        const msg = formatUnknownError(e);
        setError(saveStep ? `Failed at: ${saveStep}. ${msg}` : msg);
        setActiveTab("PRICING");
      } finally {
        saveInFlightRef.current = false;
        setSaveInFlight(false);
      }
      return;
    }

    const normalizedRows = editor.pricingRows
      .map((r) => ({
        key: r.key,
        isDefault: r.isDefault === true,
        termMonths: r.termMonthsUnlimited ? null : parsePositiveInt(r.termMonths),
        termKm: r.termKmUnlimited ? null : parsePositiveInt(r.termKm),
        vehicleMileageMinKm: editor.pricingVariesByMileageBand ? parseOptionalInt(r.vehicleMileageMinKm) : undefined,
        vehicleMileageMaxKm: editor.pricingVariesByMileageBand ? (r.vehicleMileageMaxUnlimited ? null : parseOptionalInt(r.vehicleMileageMaxKm)) : undefined,
        vehicleClass:
          editor.pricingVariesByVehicleClass === true
            ? r.vehicleClass === "ALL"
              ? undefined
              : r.vehicleClass.trim() || undefined
            : undefined,
        loanAmountMinCents: dollarsToCents(r.loanAmountMin),
        loanAmountMaxCents: dollarsToCents(r.loanAmountMax),
        financeTermMonths: parseOptionalInt(r.financeTermMonths),
        claimLimitType: asClaimLimitType(r.claimLimitType),
        claimLimitAmountCents: dollarsToCents(r.claimLimitAmount),
        deductibleCents: dollarsToCents(r.deductible) ?? 0,
        providerCostCents: dollarsToCents(r.providerCost),
      }))
      .filter((r) => r.termMonths !== undefined || r.termKm !== undefined || r.providerCostCents || r.deductibleCents);

    const validatedRows: ValidatedRow[] = normalizedRows.map((r) => {
      if (editor.pricingStructure === "FINANCE_MATRIX") {
        const term = r.financeTermMonths;
        if (typeof term !== "number" || !isAllowedFinanceTermMonths(term)) {
          throw new Error("Finance term months is required and must be one of: 24, 36, 48, 60, 72, 84, 96.");
        }
        if (typeof r.loanAmountMinCents !== "number" || !Number.isFinite(r.loanAmountMinCents) || r.loanAmountMinCents < 0) {
          throw new Error("Loan amount min is required for Finance Matrix rows.");
        }
        if (typeof r.loanAmountMaxCents !== "number" || !Number.isFinite(r.loanAmountMaxCents) || r.loanAmountMaxCents <= 0) {
          throw new Error("Loan amount max is required for Finance Matrix rows.");
        }
        if (r.loanAmountMaxCents <= r.loanAmountMinCents) {
          throw new Error("Loan amount max must be greater than loan amount min.");
        }
        if (typeof r.providerCostCents !== "number" || r.providerCostCents <= 0) {
          throw new Error("Each Finance Matrix cell requires provider net cost.");
        }

        return {
          key: r.key,
          isDefault: r.isDefault === true,
          termMonths: null,
          termKm: null,
          loanAmountMinCents: r.loanAmountMinCents,
          loanAmountMaxCents: r.loanAmountMaxCents,
          financeTermMonths: term,
          providerNetCostCents: r.providerCostCents,
          deductibleCents: 0,
          providerCostCents: r.providerCostCents,
        } as any;
      }

      if (r.termMonths !== null && typeof r.termMonths !== "number") {
        throw new Error("Published products require at least one valid pricing row.");
      }
      if (r.termMonths !== null && (typeof r.termMonths !== "number" || r.termMonths <= 0)) {
        throw new Error("Each pricing row requires term months (positive number or Unlimited).");
      }

      if (r.termMonths === undefined) {
        throw new Error("Each pricing row requires term months (positive number or Unlimited).");
      }

      if (r.termKm === undefined) {
        throw new Error("Each pricing row requires term km (positive number or Unlimited).");
      }
      if (r.termKm !== null && (typeof r.termKm !== "number" || r.termKm <= 0)) {
        throw new Error("Each pricing row requires term km (positive number or Unlimited).");
      }
      if (typeof r.providerCostCents !== "number" || r.providerCostCents <= 0) {
        throw new Error("Each pricing row requires provider cost.");
      }
      if (!Number.isFinite(r.deductibleCents) || r.deductibleCents < 0) throw new Error("Deductible must be a number >= 0.");

      if (editor.pricingVariesByMileageBand) {
        if (typeof r.vehicleMileageMinKm !== "number" || !Number.isFinite(r.vehicleMileageMinKm)) {
          throw new Error("Mileage min is required when pricing varies by mileage band.");
        }
        if (r.vehicleMileageMinKm < 0) throw new Error("Mileage min must be >= 0.");
        if (typeof r.vehicleMileageMaxKm === "number" && r.vehicleMileageMaxKm < 0) throw new Error("Mileage max must be >= 0.");
        if (typeof r.vehicleMileageMaxKm === "number" && r.vehicleMileageMaxKm < r.vehicleMileageMinKm) {
          throw new Error("Mileage max must be >= mileage min.");
        }
      }

      const claimType = r.claimLimitType;
      const amount = r.claimLimitAmountCents;
      if (claimType) {
        if (claimType === "FMV") {
          return {
            key: r.key,
            isDefault: r.isDefault === true,
            termMonths: r.termMonths,
            termKm: r.termKm,
            vehicleMileageMinKm: typeof r.vehicleMileageMinKm === "number" ? r.vehicleMileageMinKm : undefined,
            vehicleMileageMaxKm: r.vehicleMileageMaxKm === null ? null : typeof r.vehicleMileageMaxKm === "number" ? r.vehicleMileageMaxKm : undefined,
            vehicleClass: typeof r.vehicleClass === "string" ? r.vehicleClass : undefined,
            claimLimitType: claimType,
            deductibleCents: r.deductibleCents,
            providerCostCents: r.providerCostCents,
          };
        }

        if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
          throw new Error("Claim limit amount is required and must be > 0 for the selected claim limit type.");
        }
      }

      return {
        key: r.key,
        isDefault: r.isDefault === true,
        termMonths: r.termMonths,
        termKm: r.termKm,
        vehicleMileageMinKm: typeof r.vehicleMileageMinKm === "number" ? r.vehicleMileageMinKm : undefined,
        vehicleMileageMaxKm: r.vehicleMileageMaxKm === null ? null : typeof r.vehicleMileageMaxKm === "number" ? r.vehicleMileageMaxKm : undefined,
        vehicleClass: typeof r.vehicleClass === "string" ? r.vehicleClass : undefined,
        claimLimitType: claimType,
        claimLimitAmountCents: typeof amount === "number" && amount > 0 ? amount : undefined,
        claimLimitCents: claimType && typeof amount === "number" && amount > 0 ? amount : undefined,
        deductibleCents: r.deductibleCents,
        providerCostCents: r.providerCostCents,
      };
    });

    if (editor.published && validatedRows.length === 0) {
      setError("Published products require at least one valid pricing row.");
      setActiveTab("PRICING");
      return;
    }

    if (validatedRows.filter((r) => r.isDefault).length > 1) {
      setError("Exactly one default pricing row is required.");
      setActiveTab("PRICING");
      return;
    }

    if (editor.published && !validatedRows.some((r) => r.isDefault)) {
      setError("Exactly one default pricing row is required.");
      setActiveTab("PRICING");
      return;
    }

    const rowsWithDefault = (() => {
      const anyDefault = validatedRows.some((r) => r.isDefault);
      if (anyDefault) return validatedRows.map((r, idx) => ({ ...r, isDefault: r.isDefault && idx === validatedRows.findIndex((x) => x.isDefault) }));
      if (editor.published) return validatedRows;
      return validatedRows.map((r, idx) => ({ ...r, isDefault: idx === 0 }));
    })();

    if (editor.pricingVariesByMileageBand) {
      const groups = new Map<string, ValidatedRow[]>();
      for (const r of rowsWithDefault) {
        const key = `${r.termMonths ?? ""}|${r.termKm ?? ""}|${(r.vehicleClass ?? "").trim()}|${r.deductibleCents}|${r.claimLimitCents ?? ""}`;
        const arr = groups.get(key) ?? [];
        arr.push(r);
        groups.set(key, arr);
      }

      for (const [, groupRows] of groups) {
        const bands = groupRows
          .map((r) => {
            const min = typeof r.vehicleMileageMinKm === "number" ? r.vehicleMileageMinKm : null;
            const max = r.vehicleMileageMaxKm === null ? null : typeof r.vehicleMileageMaxKm === "number" ? r.vehicleMileageMaxKm : null;
            return { min, max };
          })
          .filter((b) => typeof b.min === "number");

        for (let i = 0; i < bands.length; i++) {
          for (let j = i + 1; j < bands.length; j++) {
            const a = bands[i]!;
            const b = bands[j]!;
            const aMax = a.max === null ? Number.POSITIVE_INFINITY : (a.max as number);
            const bMax = b.max === null ? Number.POSITIVE_INFINITY : (b.max as number);
            if ((a.min as number) <= bMax && (b.min as number) <= aMax) {
              setError("Overlapping mileage bands detected for the same term and vehicle class.");
              setActiveTab("PRICING");
              return;
            }
          }
        }
      }
    }

    const seen = new Set<string>();
    for (const r of rowsWithDefault) {
      const key = `${r.termMonths}|${r.termKm}|${r.vehicleMileageMinKm ?? ""}|${r.vehicleMileageMaxKm ?? ""}|${r.vehicleClass ?? ""}|${r.deductibleCents}|${r.claimLimitCents ?? ""}`;
      if (seen.has(key)) {
        setError("Duplicate pricing variants detected.");
        setActiveTab("PRICING");
        return;
      }
      seen.add(key);
    }

    const primary = defaultPricingRow(rowsWithDefault);

    if (editor.published && !primary) {
      setError("To publish, set a default pricing row.");
      setActiveTab("PRICING");
      return;
    }

    const input: CreateProductInput = {
      name,
      productType: editor.productType,
      pricingStructure: editor.pricingStructure,
      powertrainEligibility: editor.powertrainEligibility,
      keyBenefits: editor.keyBenefits.trim(),
      coverageMaxLtvPercent: parseOptionalPct(editor.coverageMaxLtvPercent),
      coverageDetails: editor.coverageDetails.trim(),
      exclusions: editor.exclusions.trim(),
      classVehicleTypes: Object.fromEntries(
        editor.classVehicleTypes
          .map((x) => ({ classCode: (x.classCode ?? "").trim(), vehicleTypes: (x.vehicleTypes ?? "").trim() }))
          .filter((x) => x.classCode && x.vehicleTypes)
          .map((x) => [x.classCode, x.vehicleTypes])
      ),
      termMonths: primary && typeof primary.termMonths === "number" ? primary.termMonths : undefined,
      termKm: primary && typeof primary.termKm === "number" ? primary.termKm : undefined,
      deductibleCents: primary && typeof primary.deductibleCents === "number" ? primary.deductibleCents : undefined,
      eligibilityMaxVehicleAgeYears: parseOptionalInt(editor.eligibilityMaxVehicleAgeYears),
      eligibilityMaxMileageKm: parseOptionalInt(editor.eligibilityMaxMileageKm),
      eligibilityMakeAllowlist: parseAllowlist(editor.eligibilityMakeAllowlist),
      eligibilityModelAllowlist: parseAllowlist(editor.eligibilityModelAllowlist),
      eligibilityTrimAllowlist: parseAllowlist(editor.eligibilityTrimAllowlist),
      basePriceCents: primary ? primary.providerCostCents : undefined,
      dealerCostCents: primary ? primary.providerCostCents : undefined,
    };

    const overviewExtrasPatch = {
      programCode: editor.programCode.trim() || "",
      internalNotes: editor.internalNotes.trim() || "",
    };

    const allowlistsForUpdate = {
      eligibilityMakeAllowlist: parseAllowlist(editor.eligibilityMakeAllowlist) ?? [],
      eligibilityModelAllowlist: parseAllowlist(editor.eligibilityModelAllowlist) ?? [],
      eligibilityTrimAllowlist: parseAllowlist(editor.eligibilityTrimAllowlist) ?? [],
    };

    const normalizedAddons = pendingAddons
      .map((r) => {
        const applicableTermMonths = Array.isArray(r.applicableTermMonths)
          ? r.applicableTermMonths.map((x) => String(x ?? "").trim()).filter(Boolean)
          : ([] as string[]);

        const applicablePricingScopeKeys = Array.isArray((r as any).applicablePricingScopeKeys)
          ? ((r as any).applicablePricingScopeKeys as unknown[])
              .map((x) => String(x ?? "").trim())
              .filter(Boolean)
          : ([] as string[]);

        const appliesToAllPricingRows =
          r.appliesToAllPricingRows === true || (applicablePricingScopeKeys.length === 0 && applicableTermMonths.length === 0);

        return {
          key: r.key,
          name: r.name.trim(),
          description: r.description.trim(),
          pricingType: r.pricingType,
          priceRaw: r.price,
          appliesToAllPricingRows,
          applicableTermMonths: appliesToAllPricingRows ? ([] as string[]) : applicableTermMonths,
          applicablePricingScopeKeys: appliesToAllPricingRows ? ([] as string[]) : applicablePricingScopeKeys,
        };
      })
      .filter((r) => !!r.name);

    for (const r of normalizedAddons) {
      const price = dollarsToCents(r.priceRaw);
      if (typeof price !== "number" || price <= 0) {
        setError(`Add-on price is required for "${r.name}".`);
        setActiveTab("ADDONS");
        return;
      }
    }

    const seenAddonKeys = new Set<string>();
    for (const r of normalizedAddons) {
      const nameKey = r.name.toLowerCase();
      const scopeKey = r.appliesToAllPricingRows
        ? "ALL"
        : (r.applicablePricingScopeKeys ?? []).length > 0
          ? (r.applicablePricingScopeKeys ?? [])
              .slice()
              .sort((a, b) => a.localeCompare(b))
              .join(",")
          : (r.applicableTermMonths ?? [])
              .map((x) => Number(x))
              .filter((n) => Number.isFinite(n) && n > 0)
              .map((n) => Math.round(n))
              .sort((a, b) => a - b)
              .join(",");

      const key = `${nameKey}::${scopeKey}`;

      if (seenAddonKeys.has(key)) {
        setError(`Duplicate add-on detected for the same pricing scope: "${r.name}".`);
        setActiveTab("ADDONS");
        return;
      }
      seenAddonKeys.add(key);
    }

    saveInFlightRef.current = true;
    setSaveInFlight(true);
    try {
      let savedProduct: Product | null = null;
      const desiredPublished = editor.published;
      if (!editor.id) {
        savedProduct = (await createMutation.mutateAsync(input)) as Product;

        savedProduct = (await updateMutation.mutateAsync({
          id: savedProduct.id,
          patch: overviewExtrasPatch,
        })) as Product;
      } else {
        savedProduct = (await updateMutation.mutateAsync({
          id: editor.id,
          patch: {
            name: input.name,
            productType: input.productType,
            powertrainEligibility: input.powertrainEligibility,
            keyBenefits: input.keyBenefits ?? "",
            coverageMaxLtvPercent: input.coverageMaxLtvPercent ?? null,
            coverageDetails: input.coverageDetails ?? "",
            exclusions: input.exclusions ?? "",
            classVehicleTypes: input.classVehicleTypes ?? {},
            ...overviewExtrasPatch,
            ...(typeof input.termMonths === "number" ? { termMonths: input.termMonths } : {}),
            ...(typeof input.termKm === "number" ? { termKm: input.termKm } : {}),
            ...(typeof input.deductibleCents === "number" ? { deductibleCents: input.deductibleCents } : {}),
            eligibilityMaxVehicleAgeYears: parseOptionalIntOrNull(editor.eligibilityMaxVehicleAgeYears),
            eligibilityMaxMileageKm: parseOptionalIntOrNull(editor.eligibilityMaxMileageKm),
            ...allowlistsForUpdate,
            basePriceCents: input.basePriceCents,
            dealerCostCents: input.dealerCostCents,
          },
        })) as Product;
      }

      const productId = (savedProduct?.id ?? editor.id ?? "").trim();
      if (productId) {
        const existing = await pricingApi.list({ productId });

        const normalizedRowsWithDefault = (() => {
          const arr = rowsWithDefault.slice();
          if (arr.length === 0) return arr;

          const firstDefaultIdx = arr.findIndex((r) => r.isDefault === true);
          const idx = firstDefaultIdx >= 0 ? firstDefaultIdx : 0;
          return arr.map((r, i) => ({ ...r, isDefault: i === idx }));
        })();

        const chunk = <T,>(arr: T[], size: number) => {
          if (!Array.isArray(arr) || arr.length === 0) return [] as T[][];
          const s = Math.max(1, Math.floor(size));
          const out: T[][] = [];
          for (let i = 0; i < arr.length; i += s) out.push(arr.slice(i, i + s));
          return out;
        };

        const created: { id: string }[] = [];

        const toCreateInput = (r: (typeof normalizedRowsWithDefault)[number]) => ({
          productId,
          isDefault: r.isDefault === true,
          ...(editor.pricingStructure === "FINANCE_MATRIX"
            ? {
                termMonths: null,
                termKm: null,
                financeTermMonths: (r as any).financeTermMonths,
                loanAmountMinCents: (r as any).loanAmountMinCents,
                loanAmountMaxCents: (r as any).loanAmountMaxCents,
                providerNetCostCents: r.providerCostCents,
                deductibleCents: 0,
                basePriceCents: r.providerCostCents,
                dealerCostCents: r.providerCostCents,
              }
            : {
                termMonths: r.termMonths,
                termKm: r.termKm,
                vehicleMileageMinKm: r.vehicleMileageMinKm,
                vehicleMileageMaxKm: r.vehicleMileageMaxKm,
                vehicleClass: r.vehicleClass,
                claimLimitCents: r.claimLimitCents,
                ...(typeof r.claimLimitType === "string" ? { claimLimitType: r.claimLimitType } : {}),
                ...(typeof r.claimLimitAmountCents === "number" ? { claimLimitAmountCents: r.claimLimitAmountCents } : {}),
                deductibleCents: r.deductibleCents,
                basePriceCents: r.providerCostCents,
                dealerCostCents: r.providerCostCents,
              }),
        });

        const restoreInputs = existing.map((r) => ({
          productId,
          isDefault: r.isDefault === true,
          termMonths: r.termMonths ?? undefined,
          termKm: r.termKm ?? undefined,
          vehicleMileageMinKm: typeof r.vehicleMileageMinKm === "number" ? r.vehicleMileageMinKm : undefined,
          vehicleMileageMaxKm: r.vehicleMileageMaxKm === null ? null : typeof r.vehicleMileageMaxKm === "number" ? r.vehicleMileageMaxKm : undefined,
          vehicleClass: typeof r.vehicleClass === "string" ? r.vehicleClass : undefined,
          claimLimitCents: typeof r.claimLimitCents === "number" ? r.claimLimitCents : undefined,
          ...(typeof (r as any).claimLimitType === "string" ? { claimLimitType: (r as any).claimLimitType } : {}),
          ...(typeof (r as any).claimLimitAmountCents === "number" ? { claimLimitAmountCents: (r as any).claimLimitAmountCents } : {}),
          deductibleCents: r.deductibleCents,
          basePriceCents: r.basePriceCents,
          dealerCostCents: typeof r.dealerCostCents === "number" ? r.dealerCostCents : r.basePriceCents,
        }));

        const normalizedRestoreInputs = (() => {
          const arr = restoreInputs.slice();
          if (arr.length === 0) return arr;
          const firstDefaultIdx = arr.findIndex((r) => (r as any).isDefault === true);
          const idx = firstDefaultIdx >= 0 ? firstDefaultIdx : 0;
          return arr.map((r, i) => ({ ...r, isDefault: i === idx }));
        })();

        const nonDefault = normalizedRowsWithDefault.filter((r) => r.isDefault !== true);
        const defaultRow = normalizedRowsWithDefault.find((r) => r.isDefault === true) ?? null;

        try {
          for (const batch of chunk(existing, 25)) {
            await Promise.all(batch.map((r) => pricingApi.remove(r.id)));
          }

          for (const batch of chunk(nonDefault, 25)) {
            const res = await Promise.all(batch.map((r) => pricingApi.create(toCreateInput(r))));
            for (const row of res) created.push({ id: (row as any).id });
          }

          if (defaultRow) {
            const row = await pricingApi.create(toCreateInput(defaultRow));
            created.push({ id: (row as any).id });
          }

          await qc.invalidateQueries({ queryKey: ["product-pricing", productId] });
        } catch (e) {
          console.error("Failed to save pricing", e);
          try {
            for (const batch of chunk(created, 25)) {
              await Promise.all(batch.map((r) => pricingApi.remove(r.id)));
            }

            const restoreNonDefault = normalizedRestoreInputs.filter((r) => (r as any).isDefault !== true);
            const restoreDefault = normalizedRestoreInputs.find((r) => (r as any).isDefault === true) ?? null;

            for (const batch of chunk(restoreNonDefault, 25)) {
              await Promise.all(batch.map((r) => pricingApi.create(r as any)));
            }
            if (restoreDefault) {
              await pricingApi.create(restoreDefault as any);
            }

            await qc.invalidateQueries({ queryKey: ["product-pricing", productId] });
          } catch {
            // best-effort rollback
          }

          setActiveTab("PRICING");
          throw new Error(`Failed to save pricing: ${formatUnknownError(e)}`);
        }
      }

      if (productId) {
        try {
          const latestPricing = (await pricingApi.list({ productId })) as ProductPricing[];
          const idsByScope = (() => {
            const map = new Map<string, string[]>();
            for (const pr of latestPricing) {
              const id = (pr.id ?? "").trim();
              if (!id) continue;
              const mk = pr.termMonths === null ? "UNL" : typeof pr.termMonths === "number" ? String(Math.round(pr.termMonths)) : "UNL";
              const kk = pr.termKm === null ? "UNL" : typeof pr.termKm === "number" ? String(Math.round(pr.termKm)) : "UNL";
              const scopeKey = `${mk}|${kk}`;
              map.set(scopeKey, [...(map.get(scopeKey) ?? []), id]);
            }
            return map;
          })();

          const idsByTerm = (() => {
            const map = new Map<number, string[]>();
            for (const pr of latestPricing) {
              if (typeof pr.termMonths !== "number" || !Number.isFinite(pr.termMonths) || pr.termMonths <= 0) continue;
              const id = (pr.id ?? "").trim();
              if (!id) continue;
              map.set(Math.round(pr.termMonths), [...(map.get(Math.round(pr.termMonths)) ?? []), id]);
            }
            return map;
          })();

          const existingAddons = await addonsApi.list({ productId });
          for (const a of existingAddons) {
            await addonsApi.remove(a.id);
          }

          for (const row of normalizedAddons) {
            const price = dollarsToCents(row.priceRaw) as number;

            const applicablePricingRowIds = (() => {
              if (row.appliesToAllPricingRows) return undefined;

              const selectedScopes = (row as any).applicablePricingScopeKeys as string[] | undefined;
              const scopeKeys = Array.isArray(selectedScopes)
                ? selectedScopes.map((x) => String(x ?? "").trim()).filter(Boolean)
                : [];

              if (scopeKeys.length > 0) {
                const ids: string[] = [];
                for (const k of scopeKeys) {
                  ids.push(...(idsByScope.get(k) ?? []));
                }
                return ids.length > 0
                  ? Array.from(new Set(ids))
                      .slice()
                      .sort((a, b) => a.localeCompare(b))
                  : [];
              }

              const selectedTerms = row.applicableTermMonths
                .map((x) => Number(x))
                .filter((n) => Number.isFinite(n) && n > 0)
                .map((n) => Math.round(n));
              const ids: string[] = [];
              for (const t of selectedTerms) {
                ids.push(...(idsByTerm.get(t) ?? []));
              }
              return ids.length > 0
                ? Array.from(new Set(ids))
                    .slice()
                    .sort((a, b) => a.localeCompare(b))
                : [];
            })();

            if (!row.appliesToAllPricingRows && Array.isArray(applicablePricingRowIds) && applicablePricingRowIds.length === 0) {
              const selectedScopes = (row as any).applicablePricingScopeKeys as string[] | undefined;
              const scopeKeys = Array.isArray(selectedScopes)
                ? selectedScopes.map((x) => String(x ?? "").trim()).filter(Boolean)
                : [];

              if (scopeKeys.length > 0) {
                const availableScopes = Array.from(idsByScope.keys()).sort((a, b) => a.localeCompare(b));
                const missing = scopeKeys.filter((k) => (idsByScope.get(k) ?? []).length === 0);
                if (missing.length > 0) {
                  throw new Error(
                    `Add-on "${row.name}" targets pricing scope(s) ${missing.join(", ")}, but no pricing rows exist for those scope(s). ` +
                      (availableScopes.length > 0 ? `Available pricing scopes: ${availableScopes.join(", ")}.` : "Add pricing rows first."),
                  );
                }

                throw new Error(`Select at least one pricing tab for add-on "${row.name}", or set it to apply to all pricing rows.`);
              }

              const selectedTerms = (row.applicableTermMonths ?? [])
                .map((x) => Number(x))
                .filter((n) => Number.isFinite(n) && n > 0)
                .map((n) => Math.round(n));
              const availableTerms = Array.from(idsByTerm.keys()).sort((a, b) => a - b);

              if (selectedTerms.length === 0) {
                throw new Error(`Select at least one term for add-on "${row.name}", or set it to apply to all terms.`);
              }

              const missing = selectedTerms.filter((t) => (idsByTerm.get(t) ?? []).length === 0);
              if (missing.length > 0) {
                throw new Error(
                  `Add-on "${row.name}" targets term(s) ${missing.join(", ")} month(s), but no pricing rows exist for those term(s). ` +
                    (availableTerms.length > 0
                      ? `Available pricing terms: ${availableTerms.join(", ")}.`
                      : "Add pricing rows first."),
                );
              }

              throw new Error(`Select at least one term for add-on "${row.name}", or set it to apply to all terms.`);
            }

            await addonsApi.create({
              productId,
              name: row.name,
              description: row.description || undefined,
              pricingType: row.pricingType,
              appliesToAllPricingRows: row.appliesToAllPricingRows,
              applicableTermMonths:
                row.appliesToAllPricingRows || ((row as any).applicablePricingScopeKeys ?? []).length > 0
                  ? undefined
                  : row.applicableTermMonths
                      .map((x) => Number(String(x ?? "").trim()))
                      .filter((n) => Number.isFinite(n) && n > 0)
                      .map((n) => Math.round(n)),
              applicablePricingRowIds,
              basePriceCents: price,
              minPriceCents: undefined,
              maxPriceCents: undefined,
              dealerCostCents: price,
              active: true,
            });
          }
          await qc.invalidateQueries({ queryKey: ["product-addons", productId] });
        } catch (e) {
          setActiveTab("ADDONS");
          throw new Error(`Failed to save add-ons: ${formatUnknownError(e)}`);
        }
      }

      await qc.invalidateQueries({ queryKey: ["marketplace-products"] });

      {
        const productId = (savedProduct?.id ?? editor.id ?? "").trim();
        if (productId) {
          if (desiredPublished) {
            const check = await pricingApi.list({ productId });
            if (!Array.isArray(check) || check.length === 0) {
              setActiveTab("PRICING");
              throw new Error(
                `Failed to save pricing: Cannot publish product ${productId}: no pricing rows exist. Add at least one pricing row, Save, then publish.`
              );
            }
          }

          savedProduct = (await updateMutation.mutateAsync({
            id: productId,
            patch: { published: desiredPublished },
          })) as Product;
        }
      }

      setShowEditor(false);
      setEditor(emptyEditor());
      setWizardStep(1);
      setPendingAddons([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : `Failed to save product: ${formatUnknownError(e)}`);
    } finally {
      saveInFlightRef.current = false;
      setSaveInFlight(false);
    }
  };

  const busy =
    saveInFlight ||
    createMutation.isPending ||
    updateMutation.isPending ||
    removeMutation.isPending ||
    uploadBrochureMutation.isPending ||
    removeBrochureMutation.isPending;

  const onDelete = (p: Product) => {
    void (async () => {
      const id = (p?.id ?? "").trim();
      if (!id) return;

      const confirmed = window.confirm(`Delete "${p.name}"? This cannot be undone.`);
      if (!confirmed) return;

      setError(null);
      try {
        await removeMutation.mutateAsync(id);

        if ((editor.id ?? "").trim() === id) {
          setShowEditor(false);
          setEditor(emptyEditor());
          setWizardStep(1);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to delete product");
      }
    })();
  };

  return (
    <PageShell
      badge="Provider Portal"
      title="Products"
      subtitle="Manage and publish offerings into the marketplace."
      actions={
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" asChild>
            <Link to="/provider-dashboard">Back to dashboard</Link>
          </Button>
          <Button onClick={beginNew} disabled={busy}>
            New Product
          </Button>
        </div>
      }
    >
      {error ? <div className="text-sm text-destructive">{error}</div> : null}

      {showEditor ? (
        <div className="mt-8 relative">
          <div className="pointer-events-none absolute -inset-6 -z-10 rounded-[32px] bg-gradient-to-br from-blue-600/10 via-transparent to-yellow-400/10 blur-2xl" />

          <div className="rounded-2xl border bg-card shadow-card overflow-hidden ring-1 ring-blue-600/10">
            <div className="px-6 py-4 border-b bg-gradient-to-r from-blue-600/10 to-transparent flex items-center justify-between gap-4 flex-wrap">
              <div>
                <div className="font-semibold">{editor.id ? "Edit Product" : "New Product"}</div>
                <div className="text-sm text-muted-foreground mt-1">
                  Fill out the required details, then add pricing before publishing.
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowEditor(false);
                    setEditor(emptyEditor());
                    setWizardStep(1);
                  }}
                  disabled={busy}
                >
                  Cancel
                </Button>
                <Button onClick={() => void onSubmit()} disabled={busy}>
                  Save
                </Button>
              </div>
            </div>

            <div className="px-6 pt-4">
              <div className="flex items-center gap-2 overflow-x-auto pb-2">
                {(
                  [
                    { step: 1 as WizardStep, label: "Basics", tab: "OVERVIEW" as ProductEditorTab },
                    { step: 2 as WizardStep, label: "Coverage", tab: "OVERVIEW" as ProductEditorTab },
                    { step: 3 as WizardStep, label: "Eligibility", tab: "ELIGIBILITY" as ProductEditorTab },
                    { step: 4 as WizardStep, label: "Pricing", tab: "PRICING" as ProductEditorTab },
                    { step: 5 as WizardStep, label: "Add-ons", tab: "ADDONS" as ProductEditorTab },
                    { step: 6 as WizardStep, label: "Review", tab: "PRICING" as ProductEditorTab },
                  ]
                ).map((item, idx) => {
                  const isCompleted = wizardStep > item.step;
                  const isCurrent = wizardStep === item.step;
                  const isClickable = !busy;
                  return (
                    <div key={item.step} className="flex items-center">
                      <button
                        type="button"
                        onClick={() => {
                          if (isClickable) {
                            setWizardStep(item.step);
                            if (item.step <= 2) {
                              setActiveTab("OVERVIEW");
                            } else {
                              setActiveTab(item.tab);
                            }
                          }
                        }}
                        disabled={!isClickable}
                        className={
                          "flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-all whitespace-nowrap " +
                          (isCurrent
                            ? "bg-blue-600 text-white shadow-md"
                            : isCompleted
                              ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                              : "bg-muted text-muted-foreground hover:bg-muted/80")
                        }
                      >
                        <span
                          className={
                            "flex items-center justify-center w-5 h-5 rounded-full text-xs font-bold " +
                            (isCurrent
                              ? "bg-white text-blue-600"
                              : isCompleted
                                ? "bg-emerald-600 text-white"
                                : "bg-muted-foreground/20 text-muted-foreground")
                          }
                        >
                          {isCompleted ? "✓" : item.step}
                        </span>
                        {item.label}
                      </button>
                      {idx < 5 && (
                        <div className={"w-6 h-0.5 mx-1 " + (isCompleted ? "bg-emerald-300" : "bg-muted")} />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="p-6">
            {activeTab === "OVERVIEW" ? (
              <div className="space-y-6">
                {wizardStep === 1 ? (
                  <div className="rounded-2xl border bg-background/40 p-6">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-600 text-white font-bold text-sm">1</div>
                      <div>
                        <div className="font-semibold">Product Basics</div>
                        <div className="text-sm text-muted-foreground">Name and type identify your product to dealerships</div>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <div className="text-sm font-medium">Product name <span className="text-destructive">*</span></div>
                        <Input
                          value={editor.name}
                          onChange={(e) => setEditor((s) => ({ ...s, name: sanitizeWordsOnly(e.target.value) }))}
                          placeholder="Example: GAP Pro"
                          disabled={busy}
                        />
                      </div>

                      <div className="space-y-2">
                        <div className="text-sm font-medium">Product type</div>
                        <select
                          value={editor.productType}
                          onChange={(e) => setEditor((s) => ({ ...s, productType: e.target.value as ProductType }))}
                          className="h-10 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm"
                          disabled={busy}
                        >
                          <option value="EXTENDED_WARRANTY">Extended Warranty</option>
                          <option value="GAP">GAP Insurance</option>
                          <option value="TIRE_RIM">Tire & Rim</option>
                          <option value="APPEARANCE">Appearance / Rust / Key</option>
                          <option value="OTHER">Other</option>
                        </select>
                      </div>
                    </div>

                    <div className="mt-4 space-y-2">
                      <div className="text-sm font-medium">Program code <span className="text-muted-foreground font-normal">(optional)</span></div>
                      <Input
                        value={editor.programCode}
                        onChange={(e) => setEditor((s) => ({ ...s, programCode: e.target.value }))}
                        placeholder="Example: AX1"
                        disabled={busy}
                      />
                    </div>

                    {editor.productType === "GAP" ? (
                      <div className="mt-4 space-y-2">
                        <div className="text-sm font-medium">Max LTV percent <span className="text-muted-foreground font-normal">(GAP only)</span></div>
                        <Input
                          value={editor.coverageMaxLtvPercent}
                          onChange={(e) => setEditor((s) => ({ ...s, coverageMaxLtvPercent: e.target.value }))}
                          placeholder="Example: 130"
                          disabled={busy}
                        />
                      </div>
                    ) : null}

                    <div className="mt-6 flex justify-end">
                      <Button
                        onClick={() => {
                          if (!editor.name.trim()) {
                            setError("Product name is required");
                            return;
                          }
                          setWizardStep(2);
                        }}
                        disabled={busy}
                      >
                        Next: Coverage Details →
                      </Button>
                    </div>
                  </div>
                ) : null}

                {wizardStep === 2 ? (
                  <div className="space-y-4">
                    <div className="rounded-2xl border bg-background/40 p-6">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-600 text-white font-bold text-sm">2</div>
                        <div>
                          <div className="font-semibold">Coverage Details</div>
                          <div className="text-sm text-muted-foreground">Describe what's covered and what's excluded</div>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div className="space-y-2">
                          <div className="text-sm font-medium">Coverage summary</div>
                          <textarea
                            value={editor.coverageDetails}
                            onChange={(e) => setEditor((s) => ({ ...s, coverageDetails: e.target.value }))}
                            placeholder="Short summary of what's covered…"
                            className={textareaClassName()}
                            disabled={busy}
                          />
                        </div>

                        <div className="space-y-2">
                          <div className="text-sm font-medium">Exclusions</div>
                          <textarea
                            value={editor.exclusions}
                            onChange={(e) => setEditor((s) => ({ ...s, exclusions: e.target.value }))}
                            placeholder="What's not covered…"
                            className={textareaClassName()}
                            disabled={busy}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="rounded-2xl border bg-background/40 p-6">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-600 text-white font-bold text-sm">2</div>
                        <div>
                          <div className="font-semibold">Warranty Image</div>
                          <div className="text-sm text-muted-foreground">Upload a product image for the Dealer Marketplace</div>
                        </div>
                      </div>

                      <input
                        ref={brochureInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        disabled={busy || !editorProductId}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          e.target.value = "";
                          if (!file) return;
                          setError(null);
                          void (async () => {
                            try {
                              await uploadBrochureMutation.mutateAsync(file);
                            } catch (err) {
                              setError(err instanceof Error ? err.message : "Failed to upload image");
                            }
                          })();
                        }}
                      />

                      {!editorProductId ? (
                        <div className="text-sm text-muted-foreground">Save the product first to upload an image.</div>
                      ) : (
                        <div className="space-y-3">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Button
                              type="button"
                              variant="outline"
                              disabled={busy}
                              onClick={() => {
                                brochureInputRef.current?.click();
                              }}
                            >
                              Upload image
                            </Button>
                            {brochureDocs.length > 0 ? (
                              <div className="text-sm text-muted-foreground truncate">{brochureDocs[0]?.fileName}</div>
                            ) : (
                              <div className="text-sm text-muted-foreground">No image uploaded yet.</div>
                            )}
                          </div>

                          {brochureDocs.length > 0 ? (
                            <div className="flex items-center gap-2 flex-wrap">
                              <Button
                                type="button"
                                variant="outline"
                                disabled={busy}
                                onClick={() => {
                                  void (async () => {
                                    const doc = brochureDocs[0];
                                    if (!doc) return;
                                    setError(null);
                                    try {
                                      const url = await documentsApi.getDownloadUrl(doc);
                                      window.open(url, "_blank", "noopener,noreferrer");
                                    } catch (err) {
                                      setError(err instanceof Error ? err.message : "Failed to open image");
                                    }
                                  })();
                                }}
                              >
                                View
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                disabled={busy}
                                onClick={() => {
                                  void (async () => {
                                    const doc = brochureDocs[0];
                                    if (!doc) return;
                                    const confirmed = window.confirm(`Remove warranty coverage image "${doc.fileName}"?`);
                                    if (!confirmed) return;
                                    setError(null);
                                    try {
                                      await removeBrochureMutation.mutateAsync(doc.id);
                                    } catch (err) {
                                      setError(err instanceof Error ? err.message : "Failed to remove image");
                                    }
                                  })();
                                }}
                              >
                                Remove
                              </Button>
                            </div>
                          ) : null}

                          {brochureDocsQuery.isLoading ? <div className="text-sm text-muted-foreground">Loading image…</div> : null}
                          {brochureDocsQuery.isError ? <div className="text-sm text-destructive">Failed to load image.</div> : null}
                        </div>
                      )}
                    </div>

                    <div className="rounded-2xl border bg-background/40 p-6">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-600 text-white font-bold text-sm">2</div>
                        <div>
                          <div className="font-semibold">Internal Notes</div>
                          <div className="text-sm text-muted-foreground">Provider-only notes (not shown to dealerships)</div>
                        </div>
                      </div>
                      <textarea
                        value={editor.internalNotes}
                        onChange={(e) => setEditor((s) => ({ ...s, internalNotes: e.target.value }))}
                        placeholder="Optional notes for your team…"
                        className={textareaClassName()}
                        disabled={busy}
                      />
                    </div>

                    <div className="flex justify-between">
                      <Button variant="outline" onClick={() => setWizardStep(1)} disabled={busy}>
                        ← Back: Basics
                      </Button>
                      <Button onClick={() => { setActiveTab("ELIGIBILITY"); setWizardStep(3); }} disabled={busy}>
                        Next: Eligibility →
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            {activeTab === "ELIGIBILITY" && wizardStep === 3 ? (
              <div className="space-y-4">
                <div className="rounded-2xl border bg-background/40 p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-600 text-white font-bold text-sm">3</div>
                    <div>
                      <div className="font-semibold">Vehicle Eligibility</div>
                      <div className="text-sm text-muted-foreground">Define which vehicles can use this product</div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-2">
                      <div className="text-sm font-medium">Powertrain type</div>
                      <div className="text-xs text-muted-foreground mb-2">Controls whether this product appears for ICE/Hybrid/EV vehicles</div>
                      <select
                        value={editor.powertrainEligibility}
                        onChange={(e) =>
                          setEditor((s) => ({
                            ...s,
                            powertrainEligibility: (e.target.value as any) || "ALL",
                          }))
                        }
                        disabled={busy}
                        className="h-10 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm disabled:opacity-60"
                      >
                        <option value="ALL">All vehicles</option>
                        <option value="ICE">ICE (Gas/Diesel)</option>
                        <option value="ELECTRIFIED">Electrified (BEV + PHEV + HEV)</option>
                        <option value="HEV">HEV (Hybrid)</option>
                        <option value="PHEV">PHEV (Plug-in Hybrid)</option>
                        <option value="BEV">BEV (Electric)</option>
                      </select>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <div className="text-sm font-medium">Max vehicle age</div>
                        <Input
                          value={editor.eligibilityMaxVehicleAgeYears}
                          onChange={(e) =>
                            setEditor((s) => ({ ...s, eligibilityMaxVehicleAgeYears: sanitizeDigitsOnly(e.target.value) }))
                          }
                          placeholder="Years (leave blank for no limit)"
                          inputMode="numeric"
                          disabled={busy}
                        />
                      </div>
                      <div className="space-y-2">
                        <div className="text-sm font-medium">Max mileage</div>
                        <Input
                          value={editor.eligibilityMaxMileageKm}
                          onChange={(e) => setEditor((s) => ({ ...s, eligibilityMaxMileageKm: sanitizeDigitsOnly(e.target.value) }))}
                          placeholder="KM (leave blank for no limit)"
                          inputMode="numeric"
                          disabled={busy}
                        />
                      </div>
                    </div>
                    {(() => {
                      const openAge = !editor.eligibilityMaxVehicleAgeYears.trim();
                      const openKm = !editor.eligibilityMaxMileageKm.trim();
                      if (!(openAge && openKm)) return null;
                      return <div className="text-sm text-emerald-600 font-medium">✓ Fully Open - All vehicles eligible</div>;
                    })()}
                  </div>
                </div>

                <div className="rounded-2xl border bg-background/40 p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-600 text-white font-bold text-sm">3</div>
                    <div>
                      <div className="font-semibold">Make / Model / Trim Allowlists</div>
                      <div className="text-sm text-muted-foreground">Optional - leave blank to allow all makes, models, and trims</div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="space-y-2">
                      <div className="text-sm font-medium">Allowed makes</div>
                      <Input
                        value={editor.eligibilityMakeAllowlist}
                        onChange={(e) => setEditor((s) => ({ ...s, eligibilityMakeAllowlist: e.target.value }))}
                        placeholder="Comma-separated. Example: Toyota, Honda, Ford"
                        disabled={busy}
                      />
                    </div>
                    <div className="space-y-2">
                      <div className="text-sm font-medium">Allowed models</div>
                      <Input
                        value={editor.eligibilityModelAllowlist}
                        onChange={(e) => setEditor((s) => ({ ...s, eligibilityModelAllowlist: e.target.value }))}
                        placeholder="Comma-separated. Example: Camry, Civic, Corolla"
                        disabled={busy}
                      />
                    </div>
                    <div className="space-y-2">
                      <div className="text-sm font-medium">Allowed trims</div>
                      <Input
                        value={editor.eligibilityTrimAllowlist}
                        onChange={(e) => setEditor((s) => ({ ...s, eligibilityTrimAllowlist: e.target.value }))}
                        placeholder="Comma-separated. Example: XLE, Touring, Limited"
                        disabled={busy}
                      />
                    </div>
                  </div>
                </div>

                {editor.pricingStructure === "MILEAGE_CLASS" ? (
                  <div className="rounded-2xl border bg-background/40 p-6">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-600 text-white font-bold text-sm">3</div>
                      <div>
                        <div className="font-semibold">Vehicle Classes</div>
                        <div className="text-sm text-muted-foreground">Descriptive labels for vehicle class categories</div>
                      </div>
                    </div>
                    <div className="space-y-3">
                      {editor.classVehicleTypes.map((row) => (
                        <div key={row.key} className="grid grid-cols-1 md:grid-cols-12 gap-2">
                          <div className="md:col-span-3">
                            <Input
                              value={row.classCode}
                              onChange={(e) =>
                                setEditor((s) => ({
                                  ...s,
                                  classVehicleTypes: s.classVehicleTypes.map((x) =>
                                    x.key === row.key ? { ...x, classCode: e.target.value } : x
                                  ),
                                }))
                              }
                              placeholder="CLASS_4"
                              disabled={busy}
                            />
                          </div>
                          <div className="md:col-span-8">
                            <Input
                              value={row.vehicleTypes}
                              onChange={(e) =>
                                setEditor((s) => ({
                                  ...s,
                                  classVehicleTypes: s.classVehicleTypes.map((x) =>
                                    x.key === row.key ? { ...x, vehicleTypes: e.target.value } : x
                                  ),
                                }))
                              }
                              placeholder="Vehicle types (example: Mid-size SUV, Pickup)"
                              disabled={busy}
                            />
                          </div>
                          <div className="md:col-span-1 flex">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-10 w-full"
                              disabled={busy || editor.classVehicleTypes.length <= 1}
                              onClick={() =>
                                setEditor((s) => ({
                                  ...s,
                                  classVehicleTypes: s.classVehicleTypes.filter((x) => x.key !== row.key),
                                }))
                              }
                            >
                              Remove
                            </Button>
                          </div>
                        </div>
                      ))}

                      <Button
                        type="button"
                        variant="outline"
                        disabled={busy}
                        onClick={() =>
                          setEditor((s) => ({
                            ...s,
                            classVehicleTypes: [
                              ...s.classVehicleTypes,
                              { key: crypto.randomUUID(), classCode: `CLASS_${s.classVehicleTypes.length + 1}`, vehicleTypes: "" },
                            ],
                          }))
                        }
                      >
                        Add class
                      </Button>
                    </div>
                  </div>
                ) : null}

                <div className="flex justify-between">
                  <Button variant="outline" onClick={() => { setActiveTab("OVERVIEW"); setWizardStep(2); }} disabled={busy}>
                    ← Back: Coverage
                  </Button>
                  <Button onClick={() => { setActiveTab("PRICING"); setWizardStep(4); }} disabled={busy}>
                    Next: Pricing →
                  </Button>
                </div>
              </div>
            ) : null}

            {activeTab === "ADDONS" && wizardStep === 5 ? (
              <div className="space-y-4">
                <div className="rounded-2xl border bg-background/40 p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-600 text-white font-bold text-sm">5</div>
                    <div>
                      <div className="font-semibold">Add-ons</div>
                      <div className="text-sm text-muted-foreground">Optional add-ons that customers can purchase with this product</div>
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">Add-ons are saved when you click the main Save button.</div>

                  {editorProductId ? (
                    <div className="mt-3">
                      {addonsQuery.isLoading ? <div className="text-sm text-muted-foreground">Loading add-ons…</div> : null}
                      {addonsQuery.isError ? <div className="text-sm text-destructive">Failed to load add-ons.</div> : null}
                    </div>
                  ) : null}

                  <div className="mt-4 space-y-3">
                    <div className="flex gap-2 flex-wrap items-center">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        onClick={() => setPasteAddonsOpen((v) => !v)}
                      >
                        Paste Add-ons Table
                      </Button>

                      <label className="text-sm">
                        <input
                          type="file"
                          accept=".csv,text/csv,.tsv,text/tab-separated-values"
                          disabled={busy}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            const reader = new FileReader();
                            reader.onload = () => {
                              const text = typeof reader.result === "string" ? reader.result : "";
                              setPasteAddonsText(text);
                              setPasteAddonsOpen(true);
                            };
                            reader.readAsText(file);
                          }}
                          className="hidden"
                        />
                        <Button type="button" variant="outline" size="sm" disabled={busy} asChild>
                          <span>Upload CSV</span>
                        </Button>
                      </label>
                    </div>

                    {pasteAddonsOpen ? (
                      <div className="rounded-lg border p-3 space-y-3">
                        <textarea
                          value={pasteAddonsText}
                          onChange={(e) => setPasteAddonsText(e.target.value)}
                          className={textareaClassName()}
                          placeholder={
                            "Paste CSV/TSV. Columns (with optional header):\n" +
                            "termMonths,termKm,name,description,pricingType,price\n" +
                            "\n" +
                            "Examples:\n" +
                            "ALL,,Music kit,,FIXED,150\n" +
                            "12,20000,Borrow,,FIXED,25\n" +
                            "24,40000,Borrow,,FIXED,50"
                          }
                          disabled={busy}
                        />

                        <div className="flex gap-2 flex-wrap">
                          <Button
                            type="button"
                            disabled={busy}
                            onClick={() => {
                              setError(null);
                              try {
                                const parsed = parseAddonsPaste(pasteAddonsText);
                                const defaultScope = activeAddonTermTab === "INVALID" ? "ALL" : activeAddonTermTab;
                                const validScopes = new Set(uniqueAddonScopeOptions.map((s) => s.scopeKey));

                                const rows: PendingAddon[] = parsed.map((p) => {
                                  const rawTerm = (p.termMonths ?? "").trim();
                                  const rawKm = (p.termKm ?? "").trim();
                                  const upperTerm = rawTerm.toUpperCase();

                                  const isAll = !rawTerm
                                    ? defaultScope === "ALL"
                                    : upperTerm === "ALL" || upperTerm === "ALLTERMS" || upperTerm === "ALL_TERMS";

                                  if (isAll) {
                                    return {
                                      key: crypto.randomUUID(),
                                      name: p.name,
                                      description: p.description,
                                      pricingType: p.pricingType,
                                      price: p.price,
                                      appliesToAllPricingRows: true,
                                      applicableTermMonths: [],
                                    };
                                  }

                                  const normMonths = /^UNLIMITED$/i.test(rawTerm)
                                    ? "UNL"
                                    : (() => {
                                        const n = rawTerm ? Number(rawTerm) : NaN;
                                        return Number.isFinite(n) && n > 0 ? String(Math.round(n)) : null;
                                      })();

                                  const normKm = /^UNLIMITED$/i.test(rawKm)
                                    ? "UNL"
                                    : (() => {
                                        const n = rawKm ? Number(rawKm) : NaN;
                                        return Number.isFinite(n) && n > 0 ? String(Math.round(n)) : null;
                                      })();

                                  if (normMonths && normKm) {
                                    const scopeKey = `${normMonths}|${normKm}`;
                                    if (validScopes.has(scopeKey)) {
                                      return {
                                        key: crypto.randomUUID(),
                                        name: p.name,
                                        description: p.description,
                                        pricingType: p.pricingType,
                                        price: p.price,
                                        appliesToAllPricingRows: false,
                                        applicableTermMonths: [],
                                        applicablePricingScopeKeys: [scopeKey],
                                      };
                                    }
                                  }

                                  if (validScopes.has(defaultScope)) {
                                    return {
                                      key: crypto.randomUUID(),
                                      name: p.name,
                                      description: p.description,
                                      pricingType: p.pricingType,
                                      price: p.price,
                                      appliesToAllPricingRows: false,
                                      applicableTermMonths: [],
                                      applicablePricingScopeKeys: [defaultScope],
                                    };
                                  }

                                  const fallbackMonthsNum = Number(rawTerm);
                                  const fallbackMonths = Number.isFinite(fallbackMonthsNum) && fallbackMonthsNum > 0 ? String(Math.round(fallbackMonthsNum)) : null;

                                  return {
                                    key: crypto.randomUUID(),
                                    name: p.name,
                                    description: p.description,
                                    pricingType: p.pricingType,
                                    price: p.price,
                                    appliesToAllPricingRows: !fallbackMonths,
                                    applicableTermMonths: fallbackMonths ? [fallbackMonths] : [],
                                  };
                                });

                                setPendingAddons((s) => [...s, ...rows]);
                                setPasteAddonsOpen(false);
                              } catch (e) {
                                setError(e instanceof Error ? e.message : formatUnknownError(e));
                              }
                            }}
                          >
                            Parse & Add Rows
                          </Button>
                          <Button type="button" variant="outline" disabled={busy} onClick={() => setPasteAddonsOpen(false)}>
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : null}

                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        variant={activeAddonTermTab === "ALL" ? "default" : "outline"}
                        size="sm"
                        disabled={busy}
                        onClick={() => setActiveAddonTermTab("ALL")}
                      >
                        All terms
                      </Button>
                      {uniqueAddonScopeOptions.map((s) => (
                        <Button
                          key={s.scopeKey}
                          type="button"
                          variant={activeAddonTermTab === s.scopeKey ? "default" : "outline"}
                          size="sm"
                          disabled={busy}
                          onClick={() => setActiveAddonTermTab(s.scopeKey)}
                        >
                          {(s.termMonths === null ? "No Time Limit" : `${s.termMonths} mo`) +
                            (" / " + (s.termKm === null ? "Unlimited km" : `${s.termKm.toLocaleString()} km`))}
                        </Button>
                      ))}
                      {invalidAddonsCount > 0 ? (
                        <Button
                          type="button"
                          variant={activeAddonTermTab === "INVALID" ? "default" : "outline"}
                          size="sm"
                          disabled={busy}
                          onClick={() => setActiveAddonTermTab("INVALID")}
                        >
                          Invalid ({invalidAddonsCount})
                        </Button>
                      ) : null}
                      {uniqueAddonScopeOptions.length === 0 ? (
                        <div className="text-xs text-muted-foreground">Add pricing rows first to see pricing tabs here.</div>
                      ) : null}
                    </div>

                    {pendingAddons
                      .filter((row) => {
                        const valid = new Set(uniqueAddonScopeOptions.map((n) => String(n.scopeKey)));
                        if (activeAddonTermTab === "INVALID") {
                          if (row.appliesToAllPricingRows) return false;
                          const scopes = Array.isArray(row.applicablePricingScopeKeys)
                            ? row.applicablePricingScopeKeys.map((t) => String(t))
                            : ([] as string[]);
                          if (scopes.length > 0) return scopes.some((t) => !valid.has(t));

                          const terms = Array.isArray(row.applicableTermMonths)
                            ? row.applicableTermMonths.map((t) => String(t))
                            : ([] as string[]);
                          return terms.length === 0;
                        }

                        if (activeAddonTermTab === "ALL") return row.appliesToAllPricingRows;
                        const scope = activeAddonTermTab;
                        if (row.appliesToAllPricingRows) return false;

                        const scopes = Array.isArray(row.applicablePricingScopeKeys)
                          ? row.applicablePricingScopeKeys.map((t) => String(t))
                          : ([] as string[]);
                        if (scopes.length > 0) return scopes.includes(scope);

                        const selectedTerms = Array.isArray(row.applicableTermMonths)
                          ? row.applicableTermMonths
                              .map((x) => Number(String(x ?? "").trim()))
                              .filter((n) => Number.isFinite(n) && n > 0)
                              .map((n) => Math.round(n))
                          : [];

                        if (selectedTerms.length === 0) return false;

                        const scopeMonthsPart = scope.split("|")[0] ?? "";
                        const scopeMonths = scopeMonthsPart === "UNL" ? null : Number(scopeMonthsPart);
                        if (scopeMonths === null) return false;
                        return selectedTerms.includes(scopeMonths);
                      })
                      .map((row, idx) => (
                      <div key={row.key} className="rounded-lg border p-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-sm font-medium">Row {idx + 1}</div>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={busy || pendingAddons.length <= 1}
                            onClick={() => setPendingAddons((s) => s.filter((x) => x.key !== row.key))}
                          >
                            Remove
                          </Button>
                        </div>

                        <div className="mt-3 grid grid-cols-1 gap-3">
                          <Input
                            value={row.name}
                            onChange={(e) =>
                              setPendingAddons((s) => s.map((x) => (x.key === row.key ? { ...x, name: e.target.value } : x)))
                            }
                            placeholder="Add-on name"
                            disabled={busy}
                          />
                          <Input
                            value={row.description}
                            onChange={(e) =>
                              setPendingAddons((s) => s.map((x) => (x.key === row.key ? { ...x, description: e.target.value } : x)))
                            }
                            placeholder="Description (optional)"
                            disabled={busy}
                          />
                          <select
                            value={row.pricingType}
                            onChange={(e) =>
                              setPendingAddons((s) => s.map((x) => (x.key === row.key ? { ...x, pricingType: e.target.value as any } : x)))
                            }
                            className="h-10 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm"
                            disabled={busy}
                          >
                            <option value="FIXED">Fixed (1x per contract)</option>
                            <option value="PER_TERM">Per term (1x for now)</option>
                            <option value="PER_CLAIM">Per claim (1x for now)</option>
                          </select>
                          <Input
                            value={row.price}
                            onChange={(e) =>
                              setPendingAddons((s) => s.map((x) => (x.key === row.key ? { ...x, price: sanitizeMoney(e.target.value) } : x)))
                            }
                            onBlur={() =>
                              setPendingAddons((s) => s.map((x) => (x.key === row.key ? { ...x, price: formatMoneyInput(x.price) } : x)))
                            }
                            placeholder="Price"
                            inputMode="decimal"
                            disabled={busy}
                            className="h-9"
                          />
                        </div>
                      </div>
                    ))}

                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy}
                      onClick={() =>
                        setPendingAddons((s) => [
                          ...s,
                          {
                            key: crypto.randomUUID(),
                            name: "",
                            description: "",
                            pricingType: "FIXED",
                            price: "",
                            appliesToAllPricingRows: activeAddonTermTab === "ALL" || activeAddonTermTab === "INVALID",
                            applicableTermMonths: [],
                            ...(activeAddonTermTab === "ALL" || activeAddonTermTab === "INVALID"
                              ? {}
                              : { applicablePricingScopeKeys: [activeAddonTermTab] }),
                          },
                        ])
                      }
                    >
                      Add row
                    </Button>
                  </div>

                  <div className="mt-6 flex justify-between">
                    <Button variant="outline" onClick={() => { setActiveTab("PRICING"); setWizardStep(4); }} disabled={busy}>
                      ← Back: Pricing
                    </Button>
                    <Button onClick={() => { setWizardStep(6); }} disabled={busy}>
                      Next: Review & Publish →
                    </Button>
                  </div>
                </div>
              </div>
            ) : null}

            {activeTab === "PRICING" && wizardStep === 4 ? (
              <div className="space-y-4">
                <div className="rounded-2xl border bg-background/40 p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-600 text-white font-bold text-sm">4</div>
                    <div>
                      <div className="font-semibold">Pricing Structure</div>
                      <div className="text-sm text-muted-foreground">Choose how pricing varies across vehicle types and terms</div>
                    </div>
                  </div>

                  {(() => {
                    const structure = editor.pricingStructure;

                    const setStructure = (next: PricingStructure) => {
                      const wantsMileage = next === "MILEAGE" || next === "MILEAGE_CLASS";
                      const wantsClass = next === "CLASS" || next === "MILEAGE_CLASS";
                      const wantsFinance = next === "FINANCE_MATRIX";

                      setEditor((s) => ({
                        ...s,
                        pricingStructure: next,
                        pricingVariesByMileageBand: wantsFinance ? false : wantsMileage,
                        pricingVariesByVehicleClass: wantsFinance ? false : wantsClass,
                        financeBands:
                          next === "FINANCE_MATRIX"
                            ? (s.financeBands.length > 0
                                ? s.financeBands
                                : [{ id: crypto.randomUUID(), loanAmountMin: "", loanAmountMax: "", pricesByTermMonths: {} }])
                            : s.financeBands,
                        pricingRows: s.pricingRows.map((r) => ({
                          ...r,
                          ...(wantsFinance
                            ? {
                                termMonths: "",
                                termMonthsUnlimited: true,
                                termKm: "",
                                termKmUnlimited: true,
                                vehicleMileageMinKm: "",
                                vehicleMileageMaxKm: "",
                                vehicleMileageMaxUnlimited: false,
                                vehicleClass: "ALL",
                                claimLimitType: "",
                                claimLimitAmount: "",
                                deductible: "0.00",
                              }
                            : null),
                          ...(wantsMileage
                            ? null
                            : {
                                vehicleMileageMinKm: "",
                                vehicleMileageMaxKm: "",
                                vehicleMileageMaxUnlimited: false,
                              }),
                          ...(wantsClass ? null : { vehicleClass: "ALL" }),
                        })),
                      }));
                    };

                    return (
                      <div className="mt-3">
                        <div className="text-sm font-medium">Pricing Structure</div>
                        <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <label className="flex items-center gap-2 text-sm text-muted-foreground">
                            <input
                              type="radio"
                              name="pricing-structure"
                              checked={structure === "FLAT"}
                              onChange={() => setStructure("FLAT")}
                              disabled={busy}
                            />
                            Flat Pricing
                          </label>
                          <label className="flex items-center gap-2 text-sm text-muted-foreground">
                            <input
                              type="radio"
                              name="pricing-structure"
                              checked={structure === "MILEAGE"}
                              onChange={() => setStructure("MILEAGE")}
                              disabled={busy}
                            />
                            Mileage-Based Pricing
                          </label>
                          <label className="flex items-center gap-2 text-sm text-muted-foreground">
                            <input
                              type="radio"
                              name="pricing-structure"
                              checked={structure === "CLASS"}
                              onChange={() => setStructure("CLASS")}
                              disabled={busy}
                            />
                            Class-Based Pricing
                          </label>
                          <label className="flex items-center gap-2 text-sm text-muted-foreground">
                            <input
                              type="radio"
                              name="pricing-structure"
                              checked={structure === "MILEAGE_CLASS"}
                              onChange={() => setStructure("MILEAGE_CLASS")}
                              disabled={busy}
                            />
                            Mileage + Class Pricing
                          </label>

                          {editor.productType === "GAP" ? (
                            <label className="flex items-center gap-2 text-sm text-muted-foreground">
                              <input
                                type="radio"
                                name="pricing-structure"
                                checked={structure === "FINANCE_MATRIX"}
                                onChange={() => setStructure("FINANCE_MATRIX")}
                                disabled={busy}
                              />
                              Finance Matrix Pricing
                            </label>
                          ) : null}
                        </div>
                      </div>
                    );
                  })()}

                  <div className="mt-4">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={() => setPastePricingOpen((v) => !v)}
                    >
                      Paste Pricing Table
                    </Button>

                    {editor.pricingStructure === "FINANCE_MATRIX" ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="ml-2"
                        disabled={busy}
                        onClick={() => setPasteFinanceOpen((v) => !v)}
                      >
                        Paste Rate Sheet
                      </Button>
                    ) : null}
                  </div>

                  {editor.pricingStructure === "FINANCE_MATRIX" && pasteFinanceOpen ? (
                    <div className="mt-3 rounded-lg border p-3 space-y-3">
                      <textarea
                        value={pasteFinanceText}
                        onChange={(e) => setPasteFinanceText(e.target.value)}
                        className={textareaClassName()}
                        placeholder={
                          "Paste CSV/TSV rate sheet. Example:\n" +
                          "loan_min,loan_max,24,36,48,60,72,84,96\n" +
                          "0,10000,446,455,464,473,483,503,525"
                        }
                        disabled={busy}
                      />

                      <div className="flex gap-2 flex-wrap">
                        <Button
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            setError(null);
                            try {
                              const parsedRows = parseFinanceMatrixPaste(pasteFinanceText);
                              setEditor((s) => {
                                return {
                                  ...s,
                                  pricingStructure: "FINANCE_MATRIX",
                                  pricingVariesByMileageBand: false,
                                  pricingVariesByVehicleClass: false,
                                  financeBands: parsedRows,
                                  financeDefaultBandId: parsedRows[0]?.id ?? "",
                                  financeDefaultTermMonths: 24,
                                };
                              });
                              setPasteFinanceText("");
                              setPasteFinanceOpen(false);
                            } catch (e) {
                              setError(e instanceof Error ? e.message : "Failed to parse rate sheet");
                            }
                          }}
                        >
                          Parse & Add Rows
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          disabled={busy}
                          onClick={() => {
                            setPasteFinanceText("");
                            setPasteFinanceOpen(false);
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : null}

                  {pastePricingOpen ? (
                    <div className="mt-3 rounded-lg border p-3 space-y-3">
                      <textarea
                        value={pastePricingText}
                        onChange={(e) => setPastePricingText(e.target.value)}
                        className={textareaClassName()}
                        placeholder={
                          "Paste from Excel (tab-separated) or CSV. Columns (with optional header):\n" +
                          "termMonths, termKm, vehicleMileageMinKm, vehicleMileageMaxKm, vehicleClass, claimLimitType, claimLimitAmount, deductible, providerCost"
                        }
                        disabled={busy}
                      />

                      <div className="flex gap-2 flex-wrap">
                        <Button
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            setError(null);
                            try {
                              const raw = (pastePricingText ?? "").trim();
                              if (!raw) {
                                setError("Paste table text first.");
                                return;
                              }

                              const lines = raw
                                .split(/\r?\n/g)
                                .map((l) => l.trim())
                                .filter(Boolean);

                              if (lines.length === 0) {
                                setError("Paste table text first.");
                                return;
                              }

                              const first = splitTableRow(lines[0]!);
                              const header = first.map((h) => h.replace(/\s+/g, "").toLowerCase());
                              const hasHeader = header.some((h) =>
                                [
                                  "termmonths",
                                  "termkm",
                                  "vehiclemileageminkm",
                                  "vehiclemileagemaxkm",
                                  "vehicleclass",
                                  "claimlimittype",
                                  "claimlimitamount",
                                  "deductible",
                                  "providercost",
                                ].includes(h),
                              );

                              const colIndex = (name: string) => {
                                const idx = header.findIndex((h) => h === name);
                                return idx >= 0 ? idx : null;
                              };

                              const idxTermMonths = hasHeader ? colIndex("termmonths") : 0;
                              const idxTermKm = hasHeader ? colIndex("termkm") : 1;
                              const idxMin = hasHeader ? colIndex("vehiclemileageminkm") : 2;
                              const idxMax = hasHeader ? colIndex("vehiclemileagemaxkm") : 3;
                              const idxClass = hasHeader ? colIndex("vehicleclass") : 4;
                              const idxClaimType = hasHeader ? colIndex("claimlimittype") : 5;
                              const idxClaimAmt = hasHeader ? colIndex("claimlimitamount") : 6;
                              const idxDed = hasHeader ? colIndex("deductible") : 7;
                              const idxCost = hasHeader ? colIndex("providercost") : 8;

                              const dataLines = hasHeader ? lines.slice(1) : lines;
                              const parsedRows: EditorState["pricingRows"][number][] = [];

                              for (const line of dataLines) {
                                const cols = splitTableRow(line);
                                const get = (idx: number | null) => (idx === null ? "" : (cols[idx] ?? "").trim());

                                const rawMonths = get(idxTermMonths);
                                const rawKm = get(idxTermKm);
                                const rawMin = get(idxMin);
                                const rawMax = get(idxMax);
                                const rawClass = get(idxClass);
                                const rawClaimType = get(idxClaimType);
                                const rawClaimAmt = get(idxClaimAmt);
                                const rawDed = get(idxDed);
                                const rawCost = get(idxCost);

                                if (!rawMonths && !rawKm && !rawCost && !rawDed) continue;

                                const monthsUnlimited = /^unlimited$/i.test(rawMonths);
                                const kmUnlimited = /^unlimited$/i.test(rawKm);
                                const maxUnlimited = /^unlimited$/i.test(rawMax);

                                const vehicleClass = normalizeVehicleClassLabel(rawClass);
                                const claimLimitType = normalizeClaimLimitTypeLabel(rawClaimType);

                                parsedRows.push({
                                  key: crypto.randomUUID(),
                                  isDefault: false,
                                  termMonths: monthsUnlimited ? "" : sanitizeDigitsOnly(rawMonths),
                                  termMonthsUnlimited: monthsUnlimited,
                                  termKm: kmUnlimited ? "" : sanitizeDigitsOnly(rawKm),
                                  termKmUnlimited: kmUnlimited,
                                  vehicleMileageMinKm: sanitizeDigitsOnly(rawMin),
                                  vehicleMileageMaxKm: maxUnlimited ? "" : sanitizeDigitsOnly(rawMax),
                                  vehicleMileageMaxUnlimited: maxUnlimited,
                                  vehicleClass,
                                  loanAmountMin: "",
                                  loanAmountMax: "",
                                  financeTermMonths: "",
                                  claimLimitType: claimLimitType ?? "",
                                  claimLimitAmount: sanitizeMoney(rawClaimAmt),
                                  deductible: sanitizeMoney(rawDed),
                                  providerCost: sanitizeMoney(rawCost),
                                });
                              }

                              if (parsedRows.length === 0) {
                                setError("No pricing rows found in pasted table.");
                                return;
                              }

                              const anyMileage = parsedRows.some((r) => r.vehicleMileageMinKm.trim() || r.vehicleMileageMaxUnlimited || r.vehicleMileageMaxKm.trim());
                              const anyClass = parsedRows.some((r) => r.vehicleClass !== "ALL");
                              const existingHasDefault = editor.pricingRows.some((r) => r.isDefault === true);

                              setEditor((s) => {
                                const nextRows = [...s.pricingRows, ...parsedRows];
                                const withDefault =
                                  existingHasDefault || nextRows.some((r) => r.isDefault)
                                    ? nextRows
                                    : nextRows.map((r, i) => ({ ...r, isDefault: i === 0 }));

                                return {
                                  ...s,
                                  pricingRows: withDefault,
                                  pricingVariesByMileageBand: s.pricingVariesByMileageBand || anyMileage,
                                  pricingVariesByVehicleClass: s.pricingVariesByVehicleClass || anyClass,
                                };
                              });
                              setPastePricingText("");
                              setPastePricingOpen(false);
                            } catch (e) {
                              setError(e instanceof Error ? e.message : "Failed to parse pricing table");
                            }
                          }}
                        >
                          Parse & Add Rows
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          disabled={busy}
                          onClick={() => {
                            setPastePricingText("");
                            setPastePricingOpen(false);
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : null}

                  <div className="mt-3 space-y-3">
                    {(() => {
                      if (editor.pricingStructure === "FINANCE_MATRIX") {
                        const asMoney = (v: string) => sanitizeMoney(v);

                        const parsedBands = editor.financeBands
                          .slice()
                          .map((b) => ({
                            ...b,
                            loanAmountMin: (b.loanAmountMin ?? "").trim(),
                            loanAmountMax: (b.loanAmountMax ?? "").trim(),
                          }));

                        const bandIssuesById = new Map<string, string[]>();
                        const bandsWithParsed = parsedBands
                          .map((b) => {
                            const minCents = dollarsToCents(b.loanAmountMin);
                            const maxCents = dollarsToCents(b.loanAmountMax);
                            return { ...b, minCents, maxCents };
                          })
                          .sort((a, b) => ((a.minCents ?? 0) - (b.minCents ?? 0)));

                        for (const b of bandsWithParsed) {
                          const issues: string[] = [];
                          if (typeof b.minCents !== "number") issues.push("Loan min required");
                          if (typeof b.maxCents !== "number") issues.push("Loan max required");
                          if (typeof b.minCents === "number" && typeof b.maxCents === "number" && b.maxCents <= b.minCents) {
                            issues.push("Loan max must be > loan min");
                          }
                          for (const t of FINANCE_TERMS) {
                            const v = (b.pricesByTermMonths?.[t] ?? "").trim();
                            if (!v) issues.push(`Missing ${t} mo price`);
                          }
                          bandIssuesById.set(b.id, issues);
                        }

                        for (let i = 0; i < bandsWithParsed.length; i += 1) {
                          const a = bandsWithParsed[i]!;
                          if (typeof a.minCents !== "number" || typeof a.maxCents !== "number") continue;
                          for (let j = i + 1; j < bandsWithParsed.length; j += 1) {
                            const b = bandsWithParsed[j]!;
                            if (typeof b.minCents !== "number" || typeof b.maxCents !== "number") continue;
                            if (b.minCents > a.maxCents) break;
                            const overlaps = Math.max(a.minCents, b.minCents) <= Math.min(a.maxCents, b.maxCents);
                            if (!overlaps) continue;
                            bandIssuesById.set(a.id, Array.from(new Set([...(bandIssuesById.get(a.id) ?? []), "Overlaps another band"])));
                            bandIssuesById.set(b.id, Array.from(new Set([...(bandIssuesById.get(b.id) ?? []), "Overlaps another band"])));
                          }
                        }

                        return (
                          <div className="space-y-3">
                            <div className="text-sm text-muted-foreground">
                              Finance Matrix: rows are loan amount bands, columns are finance terms. Each cell is provider net cost.
                            </div>

                            <div className="rounded-lg border overflow-x-auto">
                              <table className="w-full text-sm">
                                <thead>
                                  <tr className="border-b bg-muted/20">
                                    <th className="text-left px-3 py-2 text-xs text-muted-foreground min-w-[220px]">Loan amount band</th>
                                    {FINANCE_TERMS.map((t) => (
                                      <th key={t} className="text-left px-3 py-2 text-xs text-muted-foreground min-w-[120px]">
                                        {t} mo
                                      </th>
                                    ))}
                                    <th className="text-left px-3 py-2 text-xs text-muted-foreground min-w-[220px]">Issues</th>
                                    <th className="text-right px-3 py-2 text-xs text-muted-foreground">Action</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y">
                                  {editor.financeBands.map((b) => (
                                    <tr key={b.id}>
                                      <td className="px-3 py-2 align-top">
                                        <div className="grid grid-cols-2 gap-2">
                                          <Input
                                            value={b.loanAmountMin}
                                            onChange={(e) => {
                                              const nextMin = asMoney(e.target.value);
                                              setEditor((s) => ({
                                                ...s,
                                                financeBands: s.financeBands.map((x) => (x.id === b.id ? { ...x, loanAmountMin: nextMin } : x)),
                                              }));
                                            }}
                                            onBlur={() =>
                                              setEditor((s) => ({
                                                ...s,
                                                financeBands: s.financeBands.map((x) => (x.id === b.id ? { ...x, loanAmountMin: formatMoneyInput(x.loanAmountMin) } : x)),
                                              }))
                                            }
                                            placeholder="Loan min"
                                            inputMode="decimal"
                                            disabled={busy}
                                            className="h-8"
                                          />
                                          <Input
                                            value={b.loanAmountMax}
                                            onChange={(e) => {
                                              const nextMax = asMoney(e.target.value);
                                              setEditor((s) => ({
                                                ...s,
                                                financeBands: s.financeBands.map((x) => (x.id === b.id ? { ...x, loanAmountMax: nextMax } : x)),
                                              }));
                                            }}
                                            onBlur={() =>
                                              setEditor((s) => ({
                                                ...s,
                                                financeBands: s.financeBands.map((x) => (x.id === b.id ? { ...x, loanAmountMax: formatMoneyInput(x.loanAmountMax) } : x)),
                                              }))
                                            }
                                            placeholder="Loan max"
                                            inputMode="decimal"
                                            disabled={busy}
                                            className="h-8"
                                          />
                                        </div>
                                      </td>

                                      {FINANCE_TERMS.map((t) => {
                                        const isDefault = editor.financeDefaultBandId === b.id && editor.financeDefaultTermMonths === t;
                                        const value = b.pricesByTermMonths?.[t] ?? "";
                                        return (
                                          <td key={t} className="px-3 py-2 align-top">
                                            <div className="flex items-center gap-2">
                                              <input
                                                type="radio"
                                                name="default-pricing-row"
                                                checked={isDefault}
                                                onChange={() => {
                                                  setEditor((s) => ({
                                                    ...s,
                                                    financeDefaultBandId: b.id,
                                                    financeDefaultTermMonths: t,
                                                  }));
                                                }}
                                                disabled={busy}
                                                title={"Set as default"}
                                              />
                                              <Input
                                                value={value}
                                                onChange={(e) => {
                                                  const v = asMoney(e.target.value);
                                                  setEditor((s) => ({
                                                    ...s,
                                                    financeBands: s.financeBands.map((x) =>
                                                      x.id === b.id
                                                        ? {
                                                            ...x,
                                                            pricesByTermMonths: { ...x.pricesByTermMonths, [t]: v },
                                                          }
                                                        : x,
                                                    ),
                                                  }));
                                                }}
                                                onBlur={() =>
                                                  setEditor((s) => ({
                                                    ...s,
                                                    financeBands: s.financeBands.map((x) => {
                                                      if (x.id !== b.id) return x;
                                                      const current = x.pricesByTermMonths?.[t] ?? "";
                                                      return {
                                                        ...x,
                                                        pricesByTermMonths: {
                                                          ...(x.pricesByTermMonths ?? ({} as any)),
                                                          [t]: formatMoneyInput(current),
                                                        },
                                                      };
                                                    }),
                                                  }))
                                                }
                                                placeholder="0"
                                                inputMode="decimal"
                                                disabled={busy}
                                                className="h-9"
                                              />
                                            </div>
                                          </td>
                                        );
                                      })}

                                      <td className="px-3 py-2 align-top">
                                        {(bandIssuesById.get(b.id) ?? []).length > 0 ? (
                                          <div className="text-xs text-rose-700">
                                            {(bandIssuesById.get(b.id) ?? []).slice(0, 4).join(" • ")}
                                          </div>
                                        ) : (
                                          <div className="text-xs text-muted-foreground">OK</div>
                                        )}
                                      </td>

                                      <td className="px-3 py-2 text-right align-top">
                                        <Button
                                          type="button"
                                          variant="outline"
                                          size="sm"
                                          disabled={busy || editor.financeBands.length <= 1}
                                          onClick={() => {
                                            setEditor((s) => ({
                                              ...s,
                                              financeBands: s.financeBands.filter((x) => x.id !== b.id),
                                              ...(s.financeDefaultBandId === b.id
                                                ? { financeDefaultBandId: s.financeBands.find((x) => x.id !== b.id)?.id ?? "" }
                                                : null),
                                            }));
                                          }}
                                        >
                                          Remove band
                                        </Button>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>

                            <Button
                              type="button"
                              variant="outline"
                              disabled={busy}
                              onClick={() => {
                                setEditor((s) => ({
                                  ...s,
                                  financeBands: [
                                    ...s.financeBands,
                                    {
                                      id: crypto.randomUUID(),
                                      loanAmountMin: "",
                                      loanAmountMax: "",
                                      pricesByTermMonths: {},
                                    },
                                  ],
                                  financeDefaultBandId: s.financeDefaultBandId || s.financeBands[0]?.id || "",
                                }));
                              }}
                            >
                              Add loan band
                            </Button>
                          </div>
                        );
                      }

                      const parsed = editor.pricingRows.map((row, idx) => {
                        const termMonths = row.termMonthsUnlimited ? null : parseOptionalInt(row.termMonths);
                        const termKm = row.termKmUnlimited ? null : parseOptionalInt(row.termKm);
                        const mileageMin = editor.pricingVariesByMileageBand ? parseOptionalInt(row.vehicleMileageMinKm) : 0;
                        const mileageMax = editor.pricingVariesByMileageBand ? (row.vehicleMileageMaxUnlimited ? null : parseOptionalInt(row.vehicleMileageMaxKm)) : null;
                        const vehicleClass = editor.pricingVariesByVehicleClass ? (row.vehicleClass ?? "ALL") : "ALL";
                        const providerCostCents = dollarsToCents(row.providerCost);
                        const deductibleCents = dollarsToCents(row.deductible);

                        return { row, idx, termMonths, termKm, mileageMin, mileageMax, vehicleClass, providerCostCents, deductibleCents };
                      });

                      const uniqKeyForEditorRow = (r: (typeof parsed)[number]) =>
                        JSON.stringify([
                          r.termMonths,
                          r.termKm,
                          typeof r.mileageMin === "number" ? r.mileageMin : null,
                          r.mileageMax,
                          typeof r.vehicleClass === "string" && r.vehicleClass.trim() ? r.vehicleClass.trim() : null,
                          typeof r.deductibleCents === "number" ? r.deductibleCents : null,
                          r.row.claimLimitType || null,
                          r.row.claimLimitType && r.row.claimLimitType !== "FMV" ? dollarsToCents(r.row.claimLimitAmount) ?? null : null,
                        ]);

                      const duplicateGroups = new Map<string, number[]>();
                      for (const p of parsed) {
                        const k = uniqKeyForEditorRow(p);
                        const arr = duplicateGroups.get(k) ?? [];
                        arr.push(p.idx);
                        duplicateGroups.set(k, arr);
                      }
                      const duplicateOf = new Map<number, number[]>();
                      for (const arr of duplicateGroups.values()) {
                        if (arr.length <= 1) continue;
                        for (const i of arr) duplicateOf.set(i, arr.filter((x) => x !== i));
                      }

                      const overlapOf = new Map<number, number[]>();
                      if (editor.pricingVariesByMileageBand) {
                        const groups = new Map<string, (typeof parsed)[number][]>();
                        for (const p of parsed) {
                          const groupKey = JSON.stringify([
                            p.termMonths,
                            p.termKm,
                            typeof p.vehicleClass === "string" ? p.vehicleClass.trim() : "",
                            p.deductibleCents,
                            p.row.claimLimitType || null,
                            p.row.claimLimitType && p.row.claimLimitType !== "FMV" ? dollarsToCents(p.row.claimLimitAmount) ?? null : null,
                          ]);
                          const arr = groups.get(groupKey) ?? [];
                          arr.push(p);
                          groups.set(groupKey, arr);
                        }
                        for (const arr of groups.values()) {
                          const sorted = arr
                            .slice()
                            .sort((a, b) => ((a.mileageMin ?? 0) - (b.mileageMin ?? 0)) || (a.idx - b.idx));
                          for (let i = 0; i < sorted.length; i++) {
                            const a = sorted[i]!;
                            const aMin = a.mileageMin ?? 0;
                            const aMax = a.mileageMax;
                            if (typeof aMin !== "number") continue;
                            for (let j = i + 1; j < sorted.length; j++) {
                              const b = sorted[j]!;
                              const bMin = b.mileageMin ?? 0;
                              const bMax = b.mileageMax;
                              if (typeof bMin !== "number") continue;
                              const aMaxNum = aMax === null ? Number.POSITIVE_INFINITY : typeof aMax === "number" ? aMax : Number.NaN;
                              if (!Number.isFinite(aMaxNum) && aMax !== null) continue;
                              if (bMin > aMaxNum) break;
                              const bMaxNum = bMax === null ? Number.POSITIVE_INFINITY : typeof bMax === "number" ? bMax : Number.NaN;
                              if (!Number.isFinite(bMaxNum) && bMax !== null) continue;
                              const overlaps = Math.max(aMin, bMin) <= Math.min(aMaxNum, bMaxNum);
                              if (!overlaps) continue;
                              overlapOf.set(a.idx, Array.from(new Set([...(overlapOf.get(a.idx) ?? []), b.idx])));
                              overlapOf.set(b.idx, Array.from(new Set([...(overlapOf.get(b.idx) ?? []), a.idx])));
                            }
                          }
                        }
                      }

                      const fieldIssuesByIdx = new Map<number, string[]>();
                      const defaultRowCount = editor.pricingRows.filter((r) => r.isDefault === true).length;
                      for (const p of parsed) {
                        const issues: string[] = [];
                        if (p.termMonths !== null && (typeof p.termMonths !== "number" || p.termMonths <= 0)) issues.push("⚠ Missing Term (Months)");
                        if (p.termKm !== null && (typeof p.termKm !== "number" || p.termKm <= 0)) issues.push("⚠ Missing Term (KM)");
                        if (typeof p.providerCostCents !== "number" || p.providerCostCents <= 0) issues.push("⚠ Missing Provider Cost");
                        if (typeof p.deductibleCents !== "number" || p.deductibleCents < 0) issues.push("⚠ Invalid Deductible");

                        if (editor.pricingVariesByMileageBand) {
                          if (typeof p.mileageMin !== "number" || p.mileageMin < 0) issues.push("⚠ Missing Mileage Min");
                          const max = p.mileageMax;
                          if (max !== null && typeof max !== "number") issues.push("⚠ Invalid Mileage Max");
                          if (typeof max === "number" && max < 0) issues.push("⚠ Invalid Mileage Max");
                          if (typeof p.mileageMin === "number" && typeof max === "number" && max < p.mileageMin) issues.push("⚠ Invalid Mileage Band");
                        }

                        if (p.row.claimLimitType && p.row.claimLimitType !== "FMV") {
                          const amt = dollarsToCents(p.row.claimLimitAmount);
                          if (typeof amt !== "number" || amt <= 0) issues.push("⚠ Missing Claim Limit Amount");
                        }

                        const dups = duplicateOf.get(p.idx);
                        if (dups && dups.length > 0) issues.push(`Duplicate of row ${dups.map((x) => x + 1).join(", ")}`);

                        const ovs = overlapOf.get(p.idx);
                        if (ovs && ovs.length > 0) issues.push(`Overlaps row ${ovs.map((x) => x + 1).join(", ")}`);

                        fieldIssuesByIdx.set(p.idx, issues);
                      }

                      return (
                        <div className="rounded-lg border overflow-x-auto">
                          {defaultRowCount > 1 ? (
                            <div className="border-b bg-rose-50/50 px-3 py-2 text-xs text-rose-700">
                              ⚠ Multiple DEFAULT rows selected. Marketplace & summaries should have exactly one.
                            </div>
                          ) : null}
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b bg-muted/20">
                                <th className="text-left px-3 py-1 text-xs text-muted-foreground">Default</th>
                                <th className="text-left px-3 py-1 text-xs text-muted-foreground">Term (Months)</th>
                                <th className="text-left px-3 py-1 text-xs text-muted-foreground">Term (KM)</th>
                                {editor.pricingVariesByMileageBand ? (
                                  <>
                                    <th className="text-left px-3 py-1 text-xs text-muted-foreground">Mileage min</th>
                                    <th className="text-left px-3 py-1 text-xs text-muted-foreground">Mileage max</th>
                                  </>
                                ) : null}
                                {editor.pricingVariesByVehicleClass ? (
                                  <th className="text-left px-3 py-1 text-xs text-muted-foreground">Class</th>
                                ) : null}
                                <th className="text-left px-3 py-1 text-xs text-muted-foreground">Claim Limit</th>
                                <th className="text-left px-3 py-1 text-xs text-muted-foreground">Provider Net Cost</th>
                                <th className="text-left px-3 py-1 text-xs text-muted-foreground">Deductible</th>
                                <th className="text-left px-3 py-1 text-xs text-muted-foreground">Issues</th>
                                <th className="text-right px-3 py-1 text-xs text-muted-foreground">Action</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y">
                              {editor.pricingRows.map((row) => {
                                const idx = editor.pricingRows.findIndex((r) => r.key === row.key);
                                const issues = fieldIssuesByIdx.get(idx) ?? [];
                                const rowHasIssues = issues.length > 0;
                                return (
                                  <tr
                                    key={row.key}
                                    className={(row.isDefault ? "bg-emerald-50/40 " : "") + (rowHasIssues ? "bg-rose-50/20" : "")}
                                  >
                                    <td className="px-3 py-1 align-top">
                                      <input
                                        type="radio"
                                        name="default-pricing-row"
                                        checked={row.isDefault === true}
                                        onChange={() =>
                                          setEditor((s) => ({
                                            ...s,
                                            pricingRows: s.pricingRows.map((r) => ({ ...r, isDefault: r.key === row.key })),
                                          }))
                                        }
                                        disabled={busy}
                                        title={"Set as default"}
                                      />
                                    </td>

                                    <td className="px-3 py-1 align-top min-w-[140px]">
                                      <Input
                                        value={row.termMonths}
                                        onChange={(e) =>
                                          setEditor((s) => ({
                                            ...s,
                                            pricingRows: s.pricingRows.map((r) => (r.key === row.key ? { ...r, termMonths: sanitizeDigitsOnly(e.target.value) } : r)),
                                          }))
                                        }
                                        placeholder={row.termMonthsUnlimited ? "Unlimited" : "Months"}
                                        inputMode="numeric"
                                        disabled={busy || row.termMonthsUnlimited}
                                        className="h-8"
                                      />
                                      <label className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                                        <input
                                          type="checkbox"
                                          checked={row.termMonthsUnlimited}
                                          onChange={(e) =>
                                            setEditor((s) => ({
                                              ...s,
                                              pricingRows: s.pricingRows.map((r) =>
                                                r.key === row.key
                                                  ? { ...r, termMonthsUnlimited: e.target.checked, termMonths: e.target.checked ? "" : r.termMonths }
                                                  : r,
                                              ),
                                            }))
                                          }
                                          disabled={busy}
                                        />
                                        Unlimited
                                      </label>
                                    </td>

                                    <td className="px-3 py-1 align-top min-w-[140px]">
                                      <Input
                                        value={row.termKm}
                                        onChange={(e) =>
                                          setEditor((s) => ({
                                            ...s,
                                            pricingRows: s.pricingRows.map((r) => (r.key === row.key ? { ...r, termKm: sanitizeDigitsOnly(e.target.value) } : r)),
                                          }))
                                        }
                                        placeholder={row.termKmUnlimited ? "Unlimited" : "KM"}
                                        inputMode="numeric"
                                        disabled={busy || row.termKmUnlimited}
                                        className="h-8"
                                      />
                                      <label className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                                        <input
                                          type="checkbox"
                                          checked={row.termKmUnlimited}
                                          onChange={(e) =>
                                            setEditor((s) => ({
                                              ...s,
                                              pricingRows: s.pricingRows.map((r) =>
                                                r.key === row.key
                                                  ? { ...r, termKmUnlimited: e.target.checked, termKm: e.target.checked ? "" : r.termKm }
                                                  : r,
                                              ),
                                            }))
                                          }
                                          disabled={busy}
                                        />
                                        Unlimited
                                      </label>
                                    </td>

                                    {editor.pricingVariesByMileageBand ? (
                                      <>
                                        <td className="px-3 py-1 align-top min-w-[130px]">
                                          <Input
                                            value={row.vehicleMileageMinKm}
                                            onChange={(e) =>
                                              setEditor((s) => ({
                                                ...s,
                                                pricingRows: s.pricingRows.map((r) =>
                                                  r.key === row.key ? { ...r, vehicleMileageMinKm: sanitizeDigitsOnly(e.target.value) } : r,
                                                ),
                                              }))
                                            }
                                            placeholder="Min"
                                            inputMode="numeric"
                                            disabled={busy}
                                            className="h-8"
                                          />
                                        </td>
                                        <td className="px-3 py-1 align-top min-w-[130px]">
                                          <Input
                                            value={row.vehicleMileageMaxKm}
                                            onChange={(e) =>
                                              setEditor((s) => ({
                                                ...s,
                                                pricingRows: s.pricingRows.map((r) =>
                                                  r.key === row.key ? { ...r, vehicleMileageMaxKm: sanitizeDigitsOnly(e.target.value) } : r,
                                                ),
                                              }))
                                            }
                                            placeholder={row.vehicleMileageMaxUnlimited ? "Unlimited" : "Max"}
                                            inputMode="numeric"
                                            disabled={busy || row.vehicleMileageMaxUnlimited}
                                            className="h-8"
                                          />
                                          <label className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                                            <input
                                              type="checkbox"
                                              checked={row.vehicleMileageMaxUnlimited}
                                              onChange={(e) =>
                                                setEditor((s) => ({
                                                  ...s,
                                                  pricingRows: s.pricingRows.map((r) =>
                                                    r.key === row.key
                                                      ? {
                                                          ...r,
                                                          vehicleMileageMaxUnlimited: e.target.checked,
                                                          vehicleMileageMaxKm: e.target.checked ? "" : r.vehicleMileageMaxKm,
                                                        }
                                                      : r,
                                                  ),
                                                }))
                                              }
                                              disabled={busy}
                                            />
                                            Unlimited
                                          </label>
                                        </td>
                                      </>
                                    ) : null}

                                    {editor.pricingVariesByVehicleClass ? (
                                      <td className="px-3 py-1 align-top min-w-[110px]">
                                        <select
                                          value={row.vehicleClass}
                                          onChange={(e) =>
                                            setEditor((s) => ({
                                              ...s,
                                              pricingRows: s.pricingRows.map((r) => (r.key === row.key ? { ...r, vehicleClass: e.target.value } : r)),
                                            }))
                                          }
                                          className="h-8 rounded-md border border-input bg-transparent px-2 text-xs shadow-sm"
                                          disabled={busy}
                                        >
                                          <option value="ALL">All</option>
                                          {Array.from(
                                            new Set(
                                              editor.classVehicleTypes
                                                .map((x) => (x.classCode ?? "").trim())
                                                .filter(Boolean)
                                            )
                                          )
                                            .sort((a, b) => a.localeCompare(b))
                                            .map((code) => {
                                              const labelMatch = code.match(/^CLASS_(\d+)$/i);
                                              const label = labelMatch ? `Class ${labelMatch[1]}` : code;
                                              return (
                                                <option key={code} value={code}>
                                                  {label}
                                                </option>
                                              );
                                            })}
                                        </select>
                                      </td>
                                    ) : null}

                                    <td className="px-3 py-1 align-top min-w-[180px]">
                                      <select
                                        value={row.claimLimitType}
                                        onChange={(e) =>
                                          setEditor((s) => ({
                                            ...s,
                                            pricingRows: s.pricingRows.map((r) =>
                                              r.key === row.key ? { ...r, claimLimitType: e.target.value as any, claimLimitAmount: "" } : r,
                                            ),
                                          }))
                                        }
                                        className="h-8 rounded-md border border-input bg-transparent px-2 text-xs shadow-sm"
                                        disabled={busy}
                                      >
                                        <option value="">None</option>
                                        <option value="FMV">FMV</option>
                                        <option value="PER_CLAIM">Per claim</option>
                                      </select>
                                      {row.claimLimitType && row.claimLimitType !== "FMV" ? (
                                        <Input
                                          value={row.claimLimitAmount}
                                          onChange={(e) =>
                                            setEditor((s) => ({
                                              ...s,
                                              pricingRows: s.pricingRows.map((r) =>
                                                r.key === row.key ? { ...r, claimLimitAmount: sanitizeMoney(e.target.value) } : r,
                                              ),
                                            }))
                                          }
                                          onBlur={() =>
                                            setEditor((s) => ({
                                              ...s,
                                              pricingRows: s.pricingRows.map((r) =>
                                                r.key === row.key ? { ...r, claimLimitAmount: formatMoneyInput(r.claimLimitAmount) } : r,
                                              ),
                                            }))
                                          }
                                          placeholder="Amount"
                                          inputMode="decimal"
                                          disabled={busy}
                                          className="h-8 mt-1"
                                        />
                                      ) : null}
                                    </td>

                                    <td className="px-3 py-1 align-top min-w-[150px]">
                                      <Input
                                        value={row.providerCost}
                                        onChange={(e) =>
                                          setEditor((s) => ({
                                            ...s,
                                            pricingRows: s.pricingRows.map((r) => (r.key === row.key ? { ...r, providerCost: sanitizeMoney(e.target.value) } : r)),
                                          }))
                                        }
                                        onBlur={() =>
                                          setEditor((s) => ({
                                            ...s,
                                            pricingRows: s.pricingRows.map((r) => (r.key === row.key ? { ...r, providerCost: formatMoneyInput(r.providerCost) } : r)),
                                          }))
                                        }
                                        placeholder="Net cost"
                                        inputMode="decimal"
                                        disabled={busy}
                                        className="h-8"
                                      />
                                    </td>

                                    <td className="px-3 py-1 align-top min-w-[150px]">
                                      <Input
                                        value={row.deductible}
                                        onChange={(e) =>
                                          setEditor((s) => ({
                                            ...s,
                                            pricingRows: s.pricingRows.map((r) => (r.key === row.key ? { ...r, deductible: sanitizeMoney(e.target.value) } : r)),
                                          }))
                                        }
                                        onBlur={() =>
                                          setEditor((s) => ({
                                            ...s,
                                            pricingRows: s.pricingRows.map((r) => (r.key === row.key ? { ...r, deductible: formatMoneyInput(r.deductible) } : r)),
                                          }))
                                        }
                                        placeholder="Deductible"
                                        inputMode="decimal"
                                        disabled={busy}
                                        className="h-8"
                                      />
                                    </td>

                                    <td className="px-3 py-1 align-top min-w-[240px]">
                                      {rowHasIssues ? <div className="text-xs text-rose-700">{issues.join(" • ")}</div> : <span className="text-xs text-muted-foreground">—</span>}
                                    </td>

                                    <td className="px-3 py-1 align-top text-right min-w-[110px]">
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() =>
                                          setEditor((s) => {
                                            const next = s.pricingRows.filter((r) => r.key !== row.key);
                                            if (next.length === 0) return { ...s, pricingRows: s.pricingRows };
                                            const stillHasDefault = next.some((r) => r.isDefault === true);
                                            if (stillHasDefault) return { ...s, pricingRows: next };
                                            return { ...s, pricingRows: next.map((r, i) => ({ ...r, isDefault: i === next.length - 1 })) };
                                          })
                                        }
                                        disabled={busy || editor.pricingRows.length <= 1}
                                        className="h-7"
                                      >
                                        Remove
                                      </Button>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      );
                    })()}

                    {editor.pricingStructure !== "FINANCE_MATRIX" ? (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() =>
                          setEditor((s) => ({
                            ...s,
                            pricingRows: [
                              ...s.pricingRows,
                              {
                                key: crypto.randomUUID(),
                                isDefault: false,
                                termMonths: "",
                                termMonthsUnlimited: false,
                                termKm: "",
                                termKmUnlimited: false,
                                vehicleMileageMinKm: "",
                                vehicleMileageMaxKm: "",
                                vehicleMileageMaxUnlimited: false,
                                vehicleClass: "ALL",
                                loanAmountMin: "",
                                loanAmountMax: "",
                                financeTermMonths: "",
                                claimLimitType: "",
                                claimLimitAmount: "",
                                deductible: "",
                                providerCost: "",
                              },
                            ],
                          }))
                        }
                        disabled={busy}
                      >
                        Add Pricing Row
                      </Button>
                    ) : null}
                  </div>

                  <div className="mt-6 flex justify-between">
                    <Button variant="outline" onClick={() => { setActiveTab("ELIGIBILITY"); setWizardStep(3); }} disabled={busy}>
                      ← Back: Eligibility
                    </Button>
                    <Button onClick={() => { setActiveTab("ADDONS"); setWizardStep(5); }} disabled={busy}>
                      Next: Add-ons →
                    </Button>
                  </div>
                </div>
              </div>
            ) : null}

            {wizardStep === 6 ? (
              <div className="space-y-4">
                <div className="rounded-2xl border bg-background/40 p-6">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-600 text-white font-bold text-sm">6</div>
                    <div>
                      <div className="font-semibold">Review & Publish</div>
                      <div className="text-sm text-muted-foreground">Review your product details before saving</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="rounded-xl border p-4 bg-card">
                      <div className="text-sm font-semibold text-muted-foreground mb-2">Product</div>
                      <div className="text-lg font-semibold">{editor.name || "—"}</div>
                      <div className="text-sm text-muted-foreground mt-1">{productTypeLabel(editor.productType)}</div>
                      {editor.programCode && <div className="text-xs text-muted-foreground mt-1">Code: {editor.programCode}</div>}
                    </div>

                    <div className="rounded-xl border p-4 bg-card">
                      <div className="text-sm font-semibold text-muted-foreground mb-2">Status</div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={editor.published ? "text-emerald-600 font-semibold" : "text-amber-600 font-semibold"}>
                          {editor.published ? "Published" : "Draft"}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          ({editor.published ? "Visible to dealerships" : "Hidden from dealerships"})
                        </span>
                      </div>
                    </div>

                    <div className="rounded-xl border p-4 bg-card">
                      <div className="text-sm font-semibold text-muted-foreground mb-2">Coverage</div>
                      <div className="text-sm">{editor.coverageDetails || "—"}</div>
                      {editor.exclusions && <div className="text-xs text-muted-foreground mt-2">Exclusions: {editor.exclusions}</div>}
                    </div>

                    <div className="rounded-xl border p-4 bg-card">
                      <div className="text-sm font-semibold text-muted-foreground mb-2">Eligibility</div>
                      <div className="text-sm">
                        {editor.powertrainEligibility === "ALL" ? "All vehicles" : editor.powertrainEligibility}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {editor.eligibilityMaxVehicleAgeYears ? `Max age: ${editor.eligibilityMaxVehicleAgeYears}y` : ""}
                        {editor.eligibilityMaxVehicleAgeYears && editor.eligibilityMaxMileageKm ? " • " : ""}
                        {editor.eligibilityMaxMileageKm ? `Max km: ${Number(editor.eligibilityMaxMileageKm).toLocaleString()}km` : ""}
                        {!editor.eligibilityMaxVehicleAgeYears && !editor.eligibilityMaxMileageKm ? "No restrictions" : ""}
                      </div>
                    </div>

                    <div className="rounded-xl border p-4 bg-card">
                      <div className="text-sm font-semibold text-muted-foreground mb-2">Pricing</div>
                      <div className="text-sm">
                        {editor.pricingStructure === "FLAT" ? "Flat Pricing" :
                         editor.pricingStructure === "MILEAGE" ? "Mileage-Based Pricing" :
                         editor.pricingStructure === "CLASS" ? "Class-Based Pricing" :
                         editor.pricingStructure === "MILEAGE_CLASS" ? "Mileage + Class Pricing" :
                         editor.pricingStructure === "FINANCE_MATRIX" ? "Finance Matrix Pricing" : editor.pricingStructure}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {editor.pricingStructure === "FINANCE_MATRIX" 
                          ? `${editor.financeBands.length} loan band(s)`
                          : `${editor.pricingRows.length} pricing row(s)`}
                      </div>
                    </div>

                    <div className="rounded-xl border p-4 bg-card">
                      <div className="text-sm font-semibold text-muted-foreground mb-2">Add-ons</div>
                      <div className="text-sm">
                        {pendingAddons.filter(a => a.name.trim()).length} add-on(s) configured
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {pendingAddons.filter(a => a.name.trim()).length === 0 
                          ? "No add-ons (optional)" 
                          : "Optional extras for customers"}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border bg-background/40 p-6">
                  <div className="text-sm font-medium mb-4">Publishing Status</div>
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-3">
                      <div className={"w-4 h-4 rounded-full " + (editor.published ? "bg-emerald-500" : "bg-amber-400")} />
                      <div>
                        <div className="text-sm font-medium">
                          {editor.published ? "Published" : "Draft"}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {editor.published 
                            ? "This product is visible to all dealerships" 
                            : "This product is hidden from dealerships. Only you can see it."}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant={editor.published ? "default" : "outline"}
                        onClick={() => {
                          setEditor((s) => ({ ...s, published: true }));
                        }}
                        disabled={busy || !editor.id}
                        className={editor.published ? "bg-emerald-600 hover:bg-emerald-700" : ""}
                      >
                        Published
                      </Button>
                      <Button
                        type="button"
                        variant={!editor.published ? "default" : "outline"}
                        onClick={() => {
                          setEditor((s) => ({ ...s, published: false }));
                        }}
                        disabled={busy}
                      >
                        Draft
                      </Button>
                    </div>
                  </div>
                  {!editor.id && (
                    <div className="text-xs text-muted-foreground mt-3">
                      Publishing status will apply after the product is saved for the first time.
                    </div>
                  )}
                </div>

                <div className="flex justify-between">
                  <Button variant="outline" onClick={() => { setActiveTab("ADDONS"); setWizardStep(5); }} disabled={busy}>
                    ← Back: Add-ons
                  </Button>
                  <Button onClick={() => void onSubmit()} disabled={busy} size="lg">
                    {editor.published ? "Save & Publish" : "Save as Draft"}
                  </Button>
                </div>
              </div>
            ) : null}

            </div>
          </div>
        </div>
      ) : null}

      <div className="mt-10 rounded-2xl border bg-card shadow-card overflow-hidden ring-1 ring-blue-600/10">
        <div className="px-6 py-5 border-b bg-gradient-to-r from-blue-600/10 to-transparent">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="font-semibold text-lg">Products</div>
              <div className="text-sm text-muted-foreground mt-1">Manage your product offerings for the dealer marketplace</div>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-emerald-500" />
                  <div className="text-sm">
                    <span className="font-semibold">{publishedCount}</span>
                    <span className="text-muted-foreground ml-1">Published</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-amber-400" />
                  <div className="text-sm">
                    <span className="font-semibold">{draftCount}</span>
                    <span className="text-muted-foreground ml-1">Draft</span>
                  </div>
                </div>
              </div>
              <Input
                value={search}
                onChange={(e) => setSearch(sanitizeWordsOnly(e.target.value))}
                placeholder="Search products…"
                className="w-[220px]"
                disabled={busy}
              />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as "ALL" | "DRAFT" | "PUBLISHED")}
                className="h-10 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm"
                disabled={busy}
              >
                <option value="ALL">All</option>
                <option value="DRAFT">Draft</option>
                <option value="PUBLISHED">Published</option>
              </select>
            </div>
          </div>
        </div>

        <div className="p-4 md:p-6 space-y-3">
          {filteredProducts.map((p) => {
            const health = pricingHealthByProductId.get(p.id);
            const primary = health?.primary ?? null;
            const months = primary
              ? primary.termMonths === null
                ? "Unlimited"
                : `${primary.termMonths} mo`
              : "—";
            const km = primary
              ? primary.termKm === null
                ? "Unlimited"
                : `${primary.termKm} km`
              : "—";

            const primaryClass = primary && typeof primary.vehicleClass === "string" && primary.vehicleClass.trim() ? primary.vehicleClass.trim() : "";
            const primaryMileageMin = primary && typeof primary.vehicleMileageMinKm === "number" ? primary.vehicleMileageMinKm : 0;
            const primaryMileageMax =
              primary && primary.vehicleMileageMaxKm !== undefined
                ? primary.vehicleMileageMaxKm === null
                  ? null
                  : typeof primary.vehicleMileageMaxKm === "number"
                    ? primary.vehicleMileageMaxKm
                    : undefined
                : undefined;
            const primaryMileageLabel = primary
              ? `${primaryMileageMin.toLocaleString()} - ${primaryMileageMax === null ? "Unlimited" : typeof primaryMileageMax === "number" ? primaryMileageMax.toLocaleString() : "—"} km`
              : "";
            const primaryClaimLimit = primary && typeof primary.claimLimitCents === "number" ? money(primary.claimLimitCents) : "";

            const pricingBadgeClass = health?.ok
              ? "text-[10px] px-2 py-0.5 rounded-md border bg-emerald-50 text-emerald-700 border-emerald-200"
              : "text-[10px] px-2 py-0.5 rounded-md border bg-rose-50 text-rose-700 border-rose-200";

            return (
              <div key={p.id} className="rounded-2xl border bg-background/40 p-5 hover:bg-background/60 transition-colors">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex-1 min-w-[240px]">
                    <div className="flex items-center gap-3">
                      <div className="text-base font-semibold text-foreground">{p.name}</div>
                      <span className={statusBadge(p.published)}>{p.published ? "Published" : "Draft"}</span>
                    </div>
                    <div className="text-sm text-muted-foreground mt-1">{productTypeLabel(p.productType)}</div>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    {health ? (
                      <div className="flex items-center gap-2">
                        <div className={pricingBadgeClass}>{health.ok ? "✓ Pricing OK" : "⚠ Needs attention"}</div>
                        {!health.ok ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-[11px]"
                            onClick={() => beginEditTab(p, "PRICING")}
                            disabled={busy}
                          >
                            Fix
                          </Button>
                        ) : null}
                      </div>
                    ) : null}
                    <Button size="sm" variant="outline" onClick={() => beginEdit(p)} disabled={busy} className="ml-2">
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-rose-200 text-rose-700 hover:bg-rose-50"
                      onClick={() => onDelete(p)}
                      disabled={busy}
                    >
                      Delete
                    </Button>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <div className="text-xs text-muted-foreground font-medium">Terms</div>
                    <div className="text-sm font-medium mt-1">{months} / {km}</div>
                  </div>

                  <div>
                    <div className="text-xs text-muted-foreground font-medium">Provider Cost</div>
                    <div className="text-sm font-semibold text-foreground mt-1">{money(primary?.basePriceCents ?? undefined)}</div>
                  </div>

                  <div>
                    <div className="text-xs text-muted-foreground font-medium">Eligibility</div>
                    <div className="text-sm mt-1">{eligibilitySummary(p)}</div>
                  </div>

                  <div>
                    <div className="text-xs text-muted-foreground font-medium">Coverage</div>
                    <div className="text-sm mt-1 line-clamp-1">
                      {(p.coverageDetails ?? "").trim() || "—"}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {productsQuery.isLoading ? <div className="px-2 py-2 text-sm text-muted-foreground">Loading…</div> : null}
          {productsQuery.isError ? <div className="px-2 py-2 text-sm text-destructive">Failed to load products.</div> : null}
          {!productsQuery.isLoading && !productsQuery.isError && filteredProducts.length === 0 ? (
            <div className="px-2 py-10 text-sm text-muted-foreground">No products found. Create a new product to publish to the marketplace.</div>
          ) : null}
        </div>
      </div>
    </PageShell>
  );
}
