/**
 * The five warranty types, described in one place.
 *
 * The product form, the product page, the claim rules and every email read from
 * this table, so a type can never mean one thing on the shop and another in the
 * warranty record. `frontend/src/lib/warranty.ts` mirrors it for the UI.
 */
export const WARRANTY_TYPE_VALUES = [
  "manufacturer-warranty",
  "seller-warranty",
  "extended-warranty",
  "other",
  "none",
] as const;

export type WarrantyType = (typeof WARRANTY_TYPE_VALUES)[number];

export interface WarrantyTypeInfo {
  /** Full name used in emails and detail panels. */
  label: string;
  /** Short name used in badges and table cells. */
  short: string;
  /** Who actually carries out the repair or replacement. */
  coveredBy: string;
  /** What the customer should expect after filing a claim. */
  customerAction: string;
  /** False only for "none": the shop promised nothing. */
  hasCoverage: boolean;
  /** True when the shop itself repairs the item instead of forwarding it. */
  repairedByStore: boolean;
}

const WARRANTY_TYPES: Record<WarrantyType, WarrantyTypeInfo> = {
  "manufacturer-warranty": {
    label: "Manufacturer warranty",
    short: "Manufacturer",
    coveredBy: "The product's manufacturer",
    customerAction:
      "File the claim here. The store forwards it to the manufacturer's service centre and keeps you updated.",
    hasCoverage: true,
    repairedByStore: false,
  },
  "seller-warranty": {
    label: "Seller warranty",
    short: "Seller",
    coveredBy: "The store",
    customerAction: "File the claim here. The store repairs or replaces the item directly.",
    hasCoverage: true,
    repairedByStore: true,
  },
  "extended-warranty": {
    label: "Extended warranty",
    short: "Extended",
    coveredBy: "The store, under the extended plan",
    customerAction:
      "File the claim here. The extended plan covers the item beyond the manufacturer's own period.",
    hasCoverage: true,
    repairedByStore: true,
  },
  other: {
    label: "Other warranty",
    short: "Other",
    coveredBy: "As written in the warranty terms",
    customerAction: "File the claim here and follow the terms shown on the product page.",
    hasCoverage: true,
    repairedByStore: false,
  },
  none: {
    label: "No warranty",
    short: "No warranty",
    coveredBy: "",
    customerAction: "This item is sold without warranty coverage.",
    hasCoverage: false,
    repairedByStore: false,
  },
};

/** True when the value is one of the five stored codes. */
export function isWarrantyType(value?: string | null): value is WarrantyType {
  return (WARRANTY_TYPE_VALUES as readonly string[]).includes(String(value));
}

/**
 * Description for a stored code. An unknown code from an older record is shown
 * as "Other warranty" rather than as an empty cell or a crash.
 */
export function describeWarrantyType(type?: string | null): WarrantyTypeInfo {
  return isWarrantyType(type) ? WARRANTY_TYPES[type] : WARRANTY_TYPES.other;
}

/**
 * Coverage only exists when the type says so **and** a period was recorded.
 * Both parts are checked because a product may carry a leftover type with no
 * months, which must never produce a warranty record or accept a claim.
 */
export function hasWarrantyCoverage(
  type?: string | null,
  months?: number | null
): boolean {
  if (!describeWarrantyType(type).hasCoverage) return false;
  return Number(months) > 0;
}

/**
 * How many times one record may be extended.
 *
 * A warranty covers a repair; it is not a subscription. Three extensions is
 * enough to apologise for a long repair, and small enough that a record can
 * never quietly become permanent cover.
 */
export const MAX_WARRANTY_EXTENSIONS = 3;

/** Extension slots a record still has. Never negative. */
export function extensionsLeft(extensions?: { months?: number }[] | null): number {
  const used = Array.isArray(extensions) ? extensions.length : 0;
  return Math.max(0, MAX_WARRANTY_EXTENSIONS - used);
}
