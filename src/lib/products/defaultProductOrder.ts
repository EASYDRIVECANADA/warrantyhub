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

const APROTECT_PRODUCT_ORDER_BY_NAME = new Map(
  APROTECT_PRODUCT_ORDER.map((name, index) => [name.toLowerCase(), index]),
);

function configuredSortOrder(product: OrderedProduct, configs: Record<string, ProductOrderConfig | undefined>): number | null {
  const order = configs[product.id]?.sort_order;
  return order == null ? null : order;
}

function defaultProductSortOrder(product: OrderedProduct): number {
  const providerId = product.provider_entity_id ?? product.provider_id;
  if (providerId !== APROTECT_PROVIDER_ENTITY_ID) return Number.POSITIVE_INFINITY;
  return APROTECT_PRODUCT_ORDER_BY_NAME.get(product.name.toLowerCase()) ?? Number.POSITIVE_INFINITY;
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
