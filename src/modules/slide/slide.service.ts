import { Slide } from "./slide.model";
import { Product } from "../product/product.model";
import { ApiError } from "../../utils/apiError";
import { CreateSlideInput, UpdateSlideInput } from "./slide.validator";

interface GetSlidesFilter {
  isActive?: boolean;
}

// Shapes a slide + its linked product into the API response format.
// Product fields (name/price/image/href) are NEVER stored on the slide —
// they're read live from the product every time, so they can't go stale.
function formatSlide(slide: any, product: any) {
  const isOfferExpired =
    product?.offerEndDate && new Date(product.offerEndDate).getTime() <= Date.now();
  const effectivePrice = isOfferExpired && product?.originalPrice
    ? product.originalPrice
    : (product?.price ?? 0);
  // The original price is shown whether or not the offer is live.
  const effectiveOriginalPrice = product?.originalPrice;

  return {
    id: slide._id.toString(),
    productId: product?._id?.toString() ?? slide.productId?.toString(),

    tabTitle: slide.tabTitle,
    subtitle: slide.subtitle,
    tagline: slide.tagline,
    targetDate: product?.offerEndDate ?? slide.targetDate,
    order: slide.order,
    isActive: slide.isActive,

    productName: product?.title ?? "",
    price: effectivePrice,
    originalPrice: effectiveOriginalPrice,
    image: product?.image ?? "",
    href: product?.slug ? `/shop/${product.slug}` : "",
  };
}

export async function createSlide(data: CreateSlideInput) {
  const product = await Product.findById(data.productId);
  if (!product) throw new ApiError(404, "Product not found");

  if (data.targetDate) {
    product.offerEndDate = data.targetDate;
    await product.save();
  }

  const slide = await Slide.create(data);
  return formatSlide(slide, product);
}

export async function getSlides(filterInput: GetSlidesFilter = {}) {
  const filter: Record<string, any> = {};
  if (filterInput.isActive !== undefined) {
    filter.isActive = filterInput.isActive;
  }

  const slides = await Slide.find(filter)
    .sort({ order: 1, createdAt: -1 })
    .populate("productId");

  return slides.map((s: any) => formatSlide(s, s.productId));
}

export async function updateSlide(id: string, data: UpdateSlideInput) {
  if (data.productId) {
    const product = await Product.findById(data.productId);
    if (!product) throw new ApiError(404, "Product not found");
  }

  const existingSlide = await Slide.findById(id);
  if (!existingSlide) throw new ApiError(404, "Slide not found");

  const productIdToUpdate = data.productId || existingSlide.productId;
  if (data.targetDate && productIdToUpdate) {
    await Product.findByIdAndUpdate(productIdToUpdate, { offerEndDate: data.targetDate });
  }

  const slide = await Slide.findByIdAndUpdate(id, data, { new: true }).populate("productId");
  if (!slide) throw new ApiError(404, "Slide not found");

  return formatSlide(slide, (slide as any).productId);
}

export async function deleteSlide(id: string) {
  const slide = await Slide.findByIdAndDelete(id);
  if (!slide) throw new ApiError(404, "Slide not found");
}