import { Types } from "mongoose";
import { ProductReview } from "./review.model";
import { User } from "../user/user.model";
import { Product } from "../product/product.model";
import { CreateReviewInput, UpdateReviewInput, GetReviewsQuery } from "./review.validator";
import { ApiError } from "../../utils/apiError";
import { assertOwnerOrAdmin } from "../../utils/authz";
import { idQuery } from "../../utils/ids";
import { isAdminRole } from "../../utils/roles";

/** Sort options exposed by the reviews list. */
function sortStageFor(sort?: string) {
  switch (sort) {
    case "oldest":
      return { createdAt: 1 };
    case "rating_high":
      return { rating: -1, createdAt: -1 };
    case "rating_low":
      return { rating: 1, createdAt: -1 };
    default:
      return { createdAt: -1 }; // newest
  }
}

/**
 * Loads every reviewer and product referenced by one page of reviews in two
 * queries, so rendering a review never triggers its own lookups.
 */
async function loadReviewContext(reviews: any[]) {
  const userIds = reviews
    .map((r) => {
      const uid = r.userId?.toString();
      return Types.ObjectId.isValid(uid) ? new Types.ObjectId(uid) : null;
    })
    .filter(Boolean);
  const users = await User.find({ _id: { $in: userIds } }).lean();
  const userMap = new Map(users.map((u: any) => [u._id.toString(), u]));

  const productIds = reviews
    .map((r) => {
      const pid = r.productId?.toString();
      return Types.ObjectId.isValid(pid) ? new Types.ObjectId(pid) : null;
    })
    .filter(Boolean);
  const products = await Product.find({ _id: { $in: productIds } }).lean();
  const productMap = new Map(products.map((p: any) => [p._id.toString(), p]));

  return { userMap, productMap };
}

// Shapes a raw review doc + user + product into the API response format
function formatReview(r: any, user?: any, product?: any) {
  return {
    id: r._id.toString(),
    productId: r.productId?.toString(),
    productTitle: product?.title || "Product",
    productSlug: product?.slug || product?._id?.toString() || r.productId?.toString(),
    productImage: product?.image || "",
    productPrice: product?.price || 0,
    userId: r.userId?.toString(),
    userName: user?.name || "Anonymous",
    userAvatar: user?.image,
    userEmail: user?.email || "",
    rating: r.rating,
    comment: r.comment,
    images: Array.isArray(r.images) ? r.images : [],
    date: r.createdAt,
  };
}

export async function getReviews(query: GetReviewsQuery) {
  const { productId, userId, rating, search, sort, page, limit } = query;

  // Build base filter — only add fields if provided
  const filter: any = {};
  if (productId) filter.productId = idQuery(productId);
  if (userId) filter.userId = idQuery(userId);
  if (rating) filter.rating = rating;

  const sortStage: any = sortStageFor(sort);

  const skip = (page - 1) * limit;

  // If search is provided we need to join users/products to search across names/titles
  if (search && search.trim()) {
    const searchRegex = new RegExp(search.trim(), "i");

    // Use aggregation to join user and product, then filter by search term
    const pipeline: any[] = [
      { $match: filter },
      {
        $lookup: {
          from: "users",
          let: { uid: { $toObjectId: "$userId" } },
          pipeline: [{ $match: { $expr: { $eq: ["$_id", "$$uid"] } } }, { $project: { name: 1, email: 1, image: 1 } }],
          as: "userDoc",
        },
      },
      { $unwind: { path: "$userDoc", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "products",
          let: { pid: { $toObjectId: "$productId" } },
          pipeline: [{ $match: { $expr: { $eq: ["$_id", "$$pid"] } } }, { $project: { title: 1, slug: 1, image: 1, price: 1 } }],
          as: "productDoc",
        },
      },
      { $unwind: { path: "$productDoc", preserveNullAndEmptyArrays: true } },
      {
        $match: {
          $or: [
            { comment: searchRegex },
            { "userDoc.name": searchRegex },
            { "productDoc.title": searchRegex },
          ],
        },
      },
    ];

    const countPipeline = [...pipeline, { $count: "total" }];
    const dataPipeline = [...pipeline, { $sort: sortStage }, { $skip: skip }, { $limit: limit }];

    const [countResult, reviews] = await Promise.all([
      ProductReview.aggregate(countPipeline),
      ProductReview.aggregate(dataPipeline),
    ]);
    const total = countResult[0]?.total ?? 0;

    return {
      reviews: reviews.map((r: any) =>
        formatReview(r, r.userDoc, r.productDoc)
      ),
      pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    };
  }

  // No search — simple find with sort
  const [reviews, total] = await Promise.all([
    ProductReview.find(filter).sort(sortStage).skip(skip).limit(limit).lean(),
    ProductReview.countDocuments(filter),
  ]);

  // Attach reviewer + product details with two batched lookups
  const { userMap, productMap } = await loadReviewContext(reviews);

  return {
    reviews: reviews.map((r: any) =>
      formatReview(
        r,
        userMap.get(r.userId?.toString()),
        productMap.get(r.productId?.toString())
      )
    ),
    pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  };
}

export async function createReview(data: CreateReviewInput) {
  const [review, user, product] = await Promise.all([
    ProductReview.create(data),
    User.findById(data.userId).lean(),
    Product.findById(data.productId).lean(),
  ]);
  return formatReview(
    { ...review.toObject(), createdAt: (review as any).createdAt },
    user,
    product
  );
}

export async function updateReview(
  id: string,
  data: UpdateReviewInput,
  requesterId?: string,
  requesterRole?: string
) {
  const review = await ProductReview.findById(id);
  if (!review) throw new ApiError(404, "Review not found");

  // Admins cannot submit (and therefore cannot edit) reviews
  if (isAdminRole(requesterRole)) {
    throw new ApiError(403, "Admins cannot edit reviews.");
  }

  // Only the reviewer themselves can edit their own review
  if (String(review.userId) !== String(requesterId)) {
    throw new ApiError(403, "You can only edit your own reviews.");
  }

  const updated = await ProductReview.findByIdAndUpdate(id, data, { new: true })
    .populate("userId", "name email image")
    .populate("productId", "title slug image price");
  if (!updated) throw new ApiError(404, "Review not found");

  return formatReview(updated, (updated as any).userId, (updated as any).productId);
}

export async function deleteReview(id: string, requester?: { id?: string; role?: string }) {
  const review = await ProductReview.findById(id);
  if (!review) throw new ApiError(404, "Review not found");

  // The reviewer can remove their own review; an admin can moderate any review.
  assertOwnerOrAdmin(review.userId, requester, "You can only delete your own reviews.");

  await ProductReview.findByIdAndDelete(id);
}