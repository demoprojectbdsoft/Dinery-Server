import { Product } from "./product.model";
import { ProductReview } from "../review/review.model";
import { Category } from "../category/category.model";
import { SubCategory } from "../subcategory/subcategory.model";
import { ApiError } from "../../utils/apiError";
import { idVariants } from "../../utils/ids";
import { CreateProductInput, UpdateProductInput, GetProductsQuery } from "./product.validator";

/** Sort keys the shop and dashboards can ask for. */
const SORT_OPTIONS: Record<string, Record<string, 1 | -1>> = {
  price_asc: { price: 1 },
  price_desc: { price: -1 },
  rating: { rating: -1 },
  featured: { isFeatured: -1, createdAt: -1 },
  newest: { createdAt: -1 },
};

// Escapes regex special chars so user search input matches literally
function escapeRegex(str: string) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Fetches avg rating + review count for a batch of products in ONE query.
// Returns a Map<productIdString, { avgRating, count }> for fast O(1) lookup.
async function getRatingsMap(productIds: string[]) {
  const stats = await ProductReview.aggregate([
    { $match: { productId: { $in: productIds.flatMap((id) => idVariants(id)) } } },
    { $group: { _id: { $toString: "$productId" }, avgRating: { $avg: "$rating" }, count: { $sum: 1 } } },
  ]);
  return new Map(stats.map((s) => [s._id, s]));
}

// Shapes a raw Mongoose product document into the API response format.
// Accepts an optional ratingsMap to attach live rating/reviewCount from the reviews collection.
function formatProduct(product: any, ratingsMap?: Map<string, any>) {
  const obj = product.toObject ? product.toObject({ flattenMaps: true }) : product;
  const id = obj._id?.toString() ?? obj.id;
  const stat = ratingsMap?.get(id);

  let specifications = obj.specifications;
  if (specifications instanceof Map) {
    specifications = Object.fromEntries(specifications);
  } else if (!specifications || typeof specifications !== "object") {
    specifications = {};
  }

  const isOfferExpired = obj.offerEndDate && new Date(obj.offerEndDate).getTime() <= Date.now();

  // When offer expires: selling price reverts to originalPrice, no discount shown
  const effectivePrice = isOfferExpired && obj.originalPrice ? obj.originalPrice : obj.price;
  const effectiveOriginalPrice = isOfferExpired ? undefined : obj.originalPrice;

  // Calculate discount% only when offer is still active
  const discountPercentage =
    !isOfferExpired && obj.originalPrice && obj.originalPrice > obj.price
      ? Math.round(((obj.originalPrice - obj.price) / obj.originalPrice) * 100)
      : undefined;

  // Resolve category label from populated ref or specifications fallback
  const categoryName =
    obj.categoryId?.name ||
    specifications?.Category ||
    specifications?.category ||
    "";

  // Profit margin % — only meaningful when investPrice is set
  const profitMargin =
    obj.investPrice != null && effectivePrice != null
      ? Math.round(((effectivePrice - obj.investPrice) / effectivePrice) * 100 * 10) / 10
      : undefined;

  const unitProfit =
    obj.investPrice != null && effectivePrice != null
      ? Math.round((effectivePrice - obj.investPrice) * 100) / 100
      : undefined;

  const sellCount = typeof obj.sellCount === "number" ? obj.sellCount : 0;

  const totalProfit =
    unitProfit != null
      ? Math.round(unitProfit * sellCount * 100) / 100
      : undefined;

  return {
    ...obj,
    id,
    badges: Array.isArray(obj.badges) ? obj.badges : [],
    specifications,
    price: effectivePrice,
    originalPrice: effectiveOriginalPrice,
    categories: categoryName ? [categoryName] : [],
    discountPercentage,
    isOfferExpired: Boolean(isOfferExpired),
    investPrice: obj.investPrice,
    profitMargin,
    unitProfit,
    totalProfit,
    sellCount,
    rating: stat ? Math.round(stat.avgRating * 10) / 10 : (obj.rating ?? 0),
    reviewCount: stat ? stat.count : (obj.reviewCount ?? 0),
  };
}

export async function createProduct(data: CreateProductInput) {
  const category = await Category.findById(data.categoryId);
  if (!category) throw new ApiError(404, "Category not found");

  if (data.subCategoryIds?.length) {
    const count = await SubCategory.countDocuments({ _id: { $in: data.subCategoryIds } });
    if (count !== data.subCategoryIds.length) {
      throw new ApiError(404, "One or more subcategories not found");
    }
  }

  const existing = await Product.findOne({ slug: data.slug });
  if (existing) throw new ApiError(409, "Slug already in use");

  // "No warranty" means no coverage, so the period is dropped with it. Without
  // this a product could be saved as `none` with 12 months and still create a
  // warranty record on delivery, because records only look at the period.
  if (data.warrantyType === "none") data.warrantyPeriodMonths = 0;

  const product = await Product.create(data);
  return formatProduct(product);
}

// ─── Filter builders ──────────────────────────────────────────────────────────

/** Matches the linked category, or the legacy specifications.Category label. */
async function buildCategoryCondition(category: string) {
  const cat = await Category.findOne({ $or: [{ slug: category }, { name: category }] });
  const catName = cat?.name || category.replace(/-/g, " ");
  const catRegex = new RegExp(`^${escapeRegex(catName)}$`, "i");

  const matches: any[] = [
    { "specifications.Category": catRegex },
    { "specifications.category": catRegex },
  ];
  if (cat) matches.push({ categoryId: cat._id });

  return { $or: matches };
}

/** Matches the linked subcategory, or the legacy specifications.Subcategory label. */
async function buildSubCategoryCondition(subCategory: string) {
  const sub = await SubCategory.findOne({ $or: [{ slug: subCategory }, { name: subCategory }] });
  const subName = sub?.name || subCategory.replace(/-/g, " ");
  const subRegex = new RegExp(`^${escapeRegex(subName)}$`, "i");

  const matches: any[] = [
    { "specifications.Subcategory": subRegex },
    { "specifications.subcategory": subRegex },
  ];
  if (sub) matches.push({ subCategoryIds: sub._id });

  return { $or: matches };
}

/** Free-text search across title, description, badges and specifications. */
function buildSearchCondition(search: string) {
  const searchRegex = new RegExp(escapeRegex(search.trim()), "i");
  return {
    $or: [
      { title: searchRegex },
      { description: searchRegex },
      { badges: searchRegex },
      { "specifications.$**": searchRegex },
    ],
  };
}

function buildPriceCondition(minPrice?: number, maxPrice?: number) {
  const priceFilter: Record<string, number> = {};
  if (minPrice !== undefined) priceFilter.$gte = minPrice;
  if (maxPrice !== undefined) priceFilter.$lte = maxPrice;
  return { price: priceFilter };
}

/**
 * Discount range filter (e.g. "0-20", "20-40").
 * Discount% is computed on the fly from originalPrice, falling back to the
 * stored discountPercentage field when originalPrice is not set.
 */
function buildDiscountCondition(query: GetProductsQuery) {
  const [minStr, maxStr] = (query.discount || "").split("-");
  const min = query.minDiscount ?? (minStr ? Number(minStr) : 0);
  const max = query.maxDiscount ?? (maxStr ? Number(maxStr) : 100);

  const discountExpr = {
    $cond: [
      { $and: [{ $gt: ["$originalPrice", "$price"] }, { $gt: ["$originalPrice", 0] }] },
      { $round: [{ $multiply: [{ $divide: [{ $subtract: ["$originalPrice", "$price"] }, "$originalPrice"] }, 100] }, 0] },
      { $ifNull: ["$discountPercentage", 0] },
    ],
  };
  return { $expr: { $and: [{ $gte: [discountExpr, min] }, { $lte: [discountExpr, max] }] } };
}

/** Badge filter, e.g. "trending" or "popular". */
function buildBadgeCondition(badge: string) {
  return { badges: new RegExp(`^${escapeRegex(badge.trim())}$`, "i") };
}

/** Only products whose offer price is still lower than the original price. */
function buildOfferCondition() {
  return {
    $and: [
      { originalPrice: { $exists: true, $ne: null } },
      { $expr: { $gt: ["$originalPrice", "$price"] } },
      { $or: [{ offerEndDate: { $exists: false } }, { offerEndDate: null }, { offerEndDate: { $gt: new Date() } }] },
    ],
  };
}

/** Turns the shop query into the list of AND-ed Mongo conditions. */
async function buildFilterConditions(query: GetProductsQuery) {
  const { category, subCategory, search, minPrice, maxPrice, isFeatured, inStock } = query;
  const conditions: any[] = [];

  if (category) conditions.push(await buildCategoryCondition(category));
  if (subCategory) conditions.push(await buildSubCategoryCondition(subCategory));
  if (search?.trim()) conditions.push(buildSearchCondition(search));

  if (minPrice !== undefined || maxPrice !== undefined) {
    conditions.push(buildPriceCondition(minPrice, maxPrice));
  }
  if (query.discount || query.minDiscount !== undefined || query.maxDiscount !== undefined) {
    conditions.push(buildDiscountCondition(query));
  }

  const activeBadge = query.badge || query.badges;
  if (activeBadge?.trim()) conditions.push(buildBadgeCondition(activeBadge));

  if (isFeatured !== undefined) conditions.push({ isFeatured });
  if (inStock !== undefined) conditions.push({ inStock });
  if (query.minRating !== undefined) conditions.push({ rating: { $gte: query.minRating } });
  if (query.hasOffer) conditions.push(buildOfferCondition());

  return conditions;
}

export async function getProducts(query: GetProductsQuery) {
  const { page, limit, sort } = query;

  const conditions = await buildFilterConditions(query);
  const filter = conditions.length > 0 ? { $and: conditions } : {};
  const sortCriteria = SORT_OPTIONS[sort ?? ""] ?? { createdAt: -1 };
  const skip = (page - 1) * limit;

  const [products, total] = await Promise.all([
    Product.find(filter)
      .populate("categoryId", "name slug")
      .populate("subCategoryIds", "name slug")
      .sort(sortCriteria)
      .skip(skip)
      .limit(limit),
    Product.countDocuments(filter),
  ]);

  const ratingsMap = await getRatingsMap(products.map((p) => p._id.toString()));

  return {
    products: products.map((p) => formatProduct(p, ratingsMap)),
    total,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

export async function updateProduct(id: string, data: UpdateProductInput) {
  const current = await Product.findById(id);
  if (!current) throw new ApiError(404, "Product not found");

  // Only the fields that were sent are in `data`, so the two warranty fields are
  // judged on the combination the product will end up with.
  const nextType = data.warrantyType ?? current.warrantyType;
  if (nextType === "none") {
    data.warrantyPeriodMonths = 0;
  } else if ((data.warrantyPeriodMonths ?? 0) > 0 && current.warrantyType === "none") {
    // Adding a period to a product marked as uncovered is a contradiction.
    throw new ApiError(
      400,
      "This product is marked No warranty. Choose a warranty type before setting a period."
    );
  }

  const product = await Product.findByIdAndUpdate(id, data, { new: true });
  if (!product) throw new ApiError(404, "Product not found");
  return formatProduct(product);
}

export async function deleteProduct(id: string) {
  const product = await Product.findByIdAndDelete(id);
  if (!product) throw new ApiError(404, "Product not found");
}

export async function getProductBySlug(slug: string) {
  const product = await Product.findOne({ slug })
    .populate("categoryId", "name slug")
    .populate("subCategoryIds", "name slug");
  if (!product) throw new ApiError(404, "Product not found");
  const ratingsMap = await getRatingsMap([product._id.toString()]);
  return formatProduct(product, ratingsMap);
}