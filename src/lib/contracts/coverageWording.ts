import type { CoverageDetails, CoverageItem } from "../products/types";

export interface CoverageWording {
  coveredComponents: string;
  excludedComponents: string;
  limitedComponents: string;
  coveredWording: string;
  excludedWording: string;
  limitedWording: string;
  fullWording: string;
}

function formatComponentList(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  const last = items[items.length - 1];
  const rest = items.slice(0, -1);
  return `${rest.join(", ")}, and ${last}`;
}

function getCoverageItems(details: CoverageDetails | null | undefined): {
  included: CoverageItem[];
  excluded: CoverageItem[];
  limited: CoverageItem[];
} {
  const included: CoverageItem[] = [];
  const excluded: CoverageItem[] = [];
  const limited: CoverageItem[] = [];

  if (!details) {
    return { included, excluded, limited };
  }

  const allItems = details.items || [];

  for (const item of allItems) {
    if (item.status === "included") {
      included.push(item);
    } else if (item.status === "not_included") {
      excluded.push(item);
    } else if (item.status === "term_specific") {
      limited.push(item);
    }
  }

  return { included, excluded, limited };
}

export function generateCoverageWording(details: CoverageDetails | null | undefined): CoverageWording {
  const { included, excluded, limited } = getCoverageItems(details);

  const includedNames = included.map((i) => i.name.trim()).filter(Boolean);
  const excludedNames = excluded.map((i) => i.name.trim()).filter(Boolean);
  const limitedNames = limited.map((i) => i.name.trim()).filter(Boolean);

  const coveredComponents = formatComponentList(includedNames);
  const excludedComponents = formatComponentList(excludedNames);
  const limitedComponents = formatComponentList(limitedNames);

  let coveredWording = "";
  let excludedWording = "";
  let limitedWording = "";

  if (includedNames.length > 0) {
    if (includedNames.length === 1) {
      coveredWording = `${coveredComponents} is`;
    } else {
      coveredWording = `The following components are covered under this warranty: ${coveredComponents}.`;
    }
  }

  if (excludedNames.length > 0) {
    if (excludedNames.length === 1) {
      excludedWording = `${excludedComponents} is`;
    } else {
      excludedWording = `The following components are NOT covered under this warranty: ${excludedComponents}.`;
    }
  }

  if (limitedNames.length > 0) {
    limitedWording = `The following components are covered subject to specific terms and conditions as outlined in this warranty agreement: ${limitedComponents}.`;
  }

  const fullParts: string[] = [];

  if (coveredWording) {
    fullParts.push(`COVERED COMPONENTS:\n${coveredWording}`);
  }

  if (excludedWording) {
    fullParts.push(`\nEXCLUSIONS:\n${excludedWording}`);
  }

  if (limitedWording) {
    fullParts.push(`\nLIMITED COVERAGE:\n${limitedWording}`);
  }

  return {
    coveredComponents,
    excludedComponents,
    limitedComponents,
    coveredWording,
    excludedWording,
    limitedWording,
    fullWording: fullParts.join("\n"),
  };
}
