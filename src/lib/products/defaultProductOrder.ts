export type ProductOrderConfig = {
  sort_order?: number | null;
};

type OrderedProduct = {
  id: string;
  name: string;
  provider_entity_id?: string | null;
  provider_id?: string | null;
};

const APROTECT_PROVIDER_ENTITY_ID = "01c7fc25-cc8a-4814-b4e0-ae80f66d865b";
const GLOBAL_WARRANTY_PROVIDER_ENTITY_ID = "9ca091d9-9f15-426e-88ea-d034a85d3114";
const GVC_PREMIUM_WARRANTY_PROVIDER_ENTITY_ID = "a2b7619d-d1bb-4317-9680-30756e330634";
const LIONS_AUTO_PROTECTION_PROVIDER_ENTITY_ID = "66654576-3669-463e-bf93-7da79de325c6";

const APROTECT_PRODUCT_ORDER = [
  "Powertrain Warranty",
  "Essential Warranty",
  "Premium Special Warranty",
  "Luxury Warranty",
  "Diamond Plus Warranty",
  "Driver Program",
  "Pro Warranty",
  "Tire and Rim Protection",
];

const GLOBAL_WARRANTY_PRODUCT_ORDER = [
  "Ultimate Automotive Protection",
  "Ultimate Tire & Rim Protection",
];

const GVC_PREMIUM_WARRANTY_PRODUCT_ORDER = [
  "Essential Bronze",
  "Essential Silver",
  "Essential Gold",
  "Essential Platinum",
  "Diamond",
  "Roadside Assistance",
];

const LIONS_AUTO_PROTECTION_PRODUCT_ORDER = [
  "1 Star Auto",
  "2 Star Auto",
  "2 Star Electric Auto",
  "3 Star Auto",
  "4 Star Top Up Auto",
  "5 Star Auto",
  "Electric Auto",
  "Hybrid Auto",
];

const APROTECT_PRODUCT_ORDER_BY_NAME = new Map(
  APROTECT_PRODUCT_ORDER.map((name, index) => [name.toLowerCase(), index]),
);

const GLOBAL_WARRANTY_PRODUCT_ORDER_BY_NAME = new Map(
  GLOBAL_WARRANTY_PRODUCT_ORDER.map((name, index) => [name.toLowerCase(), index]),
);

const GVC_PREMIUM_WARRANTY_PRODUCT_ORDER_BY_NAME = new Map(
  GVC_PREMIUM_WARRANTY_PRODUCT_ORDER.map((name, index) => [name.toLowerCase(), index]),
);

const LIONS_AUTO_PROTECTION_PRODUCT_ORDER_BY_NAME = new Map(
  LIONS_AUTO_PROTECTION_PRODUCT_ORDER.map((name, index) => [name.toLowerCase(), index]),
);

function configuredSortOrder(product: OrderedProduct, configs: Record<string, ProductOrderConfig | undefined>): number | null {
  const order = configs[product.id]?.sort_order;
  return order == null ? null : order;
}

function defaultProductSortOrder(product: OrderedProduct): number {
  const providerId = product.provider_entity_id ?? product.provider_id;
  if (providerId === APROTECT_PROVIDER_ENTITY_ID) {
    return APROTECT_PRODUCT_ORDER_BY_NAME.get(product.name.toLowerCase()) ?? Number.POSITIVE_INFINITY;
  }
  if (providerId === GLOBAL_WARRANTY_PROVIDER_ENTITY_ID) {
    return GLOBAL_WARRANTY_PRODUCT_ORDER_BY_NAME.get(product.name.toLowerCase()) ?? Number.POSITIVE_INFINITY;
  }
  if (providerId === GVC_PREMIUM_WARRANTY_PROVIDER_ENTITY_ID) {
    return GVC_PREMIUM_WARRANTY_PRODUCT_ORDER_BY_NAME.get(product.name.toLowerCase()) ?? Number.POSITIVE_INFINITY;
  }
  if (providerId === LIONS_AUTO_PROTECTION_PROVIDER_ENTITY_ID) {
    return LIONS_AUTO_PROTECTION_PRODUCT_ORDER_BY_NAME.get(product.name.toLowerCase()) ?? Number.POSITIVE_INFINITY;
  }
  return Number.POSITIVE_INFINITY;
}

export function compareProductsByConfiguredOrder<T extends OrderedProduct>(
  a: T,
  b: T,
  configs: Record<string, ProductOrderConfig | undefined>,
): number {
  const aConfiguredOrder = configuredSortOrder(a, configs);
  const bConfiguredOrder = configuredSortOrder(b, configs);

  if (aConfiguredOrder != null && bConfiguredOrder != null && aConfiguredOrder !== bConfiguredOrder) {
    return aConfiguredOrder - bConfiguredOrder;
  }
  if (aConfiguredOrder != null && bConfiguredOrder == null) return -1;
  if (aConfiguredOrder == null && bConfiguredOrder != null) return 1;

  const aDefaultOrder = defaultProductSortOrder(a);
  const bDefaultOrder = defaultProductSortOrder(b);
  if (aDefaultOrder !== bDefaultOrder) return aDefaultOrder - bDefaultOrder;

  return a.name.localeCompare(b.name);
}
