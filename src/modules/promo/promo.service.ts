import { Promo } from "./promo.model";
import { ApiError } from "../../utils/apiError";
import { CreatePromoInput, UpdatePromoInput } from "./promo.validator";

interface GetPromosFilter {
  isActive?: boolean;
  placement?: "tile" | "strip";
}

// A banner is the only place its words and image come from, so there is nothing
// to join: the response is the stored document plus a plain `id`.
function formatPromo(promo: any) {
  return {
    id: promo._id.toString(),
    _id: promo._id.toString(),
    name: promo.name,
    placement: promo.placement,
    isActive: promo.isActive,
    subtitle: promo.subtitle,
    highlightText: promo.highlightText,
    title: promo.title,
    image: promo.image,
    imageAlt: promo.imageAlt,
    href: promo.href,
    buttonText: promo.buttonText,
    badgeLabel: promo.badgeLabel,
    badgeValue: promo.badgeValue,
    order: promo.order,
    createdAt: promo.createdAt,
    updatedAt: promo.updatedAt,
  };
}

export async function getPromos(filterInput: GetPromosFilter = {}) {
  const filter: Record<string, unknown> = {};
  if (filterInput.isActive !== undefined) filter.isActive = filterInput.isActive;
  if (filterInput.placement) filter.placement = filterInput.placement;

  // `order` decides the sequence; the newest banner wins a tie.
  const promos = await Promo.find(filter).sort({ order: 1, createdAt: -1 });
  return promos.map(formatPromo);
}

export async function createPromo(data: CreatePromoInput) {
  const promo = await Promo.create(data);
  return formatPromo(promo);
}

export async function updatePromo(id: string, data: UpdatePromoInput) {
  const promo = await Promo.findByIdAndUpdate(id, data, {
    new: true,
    runValidators: true,
  });
  if (!promo) throw new ApiError(404, "Promo banner not found");

  return formatPromo(promo);
}

export async function deletePromo(id: string) {
  const promo = await Promo.findByIdAndDelete(id);
  if (!promo) throw new ApiError(404, "Promo banner not found");
}
