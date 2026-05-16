export type ProductTypeFilter = {
  value: string;
  label: string;
  aliases: string[];
};

export const PRODUCT_TYPE_FILTERS: ProductTypeFilter[] = [
  { value: "VSC", label: "Extended Warranty", aliases: ["VSC", "EXTENDED_WARRANTY", "warranty"] },
  { value: "GAP", label: "Gap Insurance", aliases: ["GAP"] },
  { value: "Tire & Rim", label: "Tire and Rim", aliases: ["Tire & Rim", "TIRE_RIM", "tire_rim"] },
  { value: "PPF", label: "PPF", aliases: ["PPF"] },
];

export function matchesProductTypeFilter(productType: string, selectedType: string) {
  const filter = PRODUCT_TYPE_FILTERS.find((item) => item.value === selectedType);
  return filter ? filter.aliases.includes(productType) : true;
}
