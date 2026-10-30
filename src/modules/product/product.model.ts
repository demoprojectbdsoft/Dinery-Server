import { Schema, model } from "mongoose";

const productSchema = new Schema(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    title: { type: String, required: true },
    slug: { type: String, required: true, unique: true },

    categoryId: { type: Schema.Types.ObjectId, ref: "Category", required: true },
    subCategoryIds: [{ type: Schema.Types.ObjectId, ref: "SubCategory" }],

    price: { type: Number, required: true },
    originalPrice: { type: Number },
    investPrice: { type: Number },   // admin-only: purchase / cost price for profit tracking
    // discountPercentage intentionally NOT stored — computed on read

    image: { type: String, required: true },           // main image
    additionalImages: [{ type: String }],               // gallery

    inStock: { type: Boolean, default: true },
    // Left empty when the product is not stock-tracked: no count, no limit and
    // no decrement is applied to it anywhere in the app.
    stockQuantity: { type: Number },
    sellCount: { type: Number, default: 0 },

    rating: { type: Number },
    reviewCount: { type: Number },

    badges: [{ type: String }],

    sku: { type: String },
    description: { type: String },
    specifications: { type: Schema.Types.Mixed, default: {} },
    isFeatured: { type: Boolean, default: false },
    offerEndDate: { type: Date },
    offerExpired: { type: Boolean, default: false }, // set true by cron once offer lapses

    /**
     * Warranty period for this product, in months.
     * When set, a warranty record is created for each delivered order containing
     * this product. 0 or undefined means the product is not covered by warranty.
     */
    warrantyPeriodMonths: { type: Number, default: 0, min: 0 },
    warrantyType: {
      type: String,
      enum: ["manufacturer-warranty", "seller-warranty", "extended-warranty", "other", "none"],
      default: "manufacturer-warranty",
    },
    warrantyTerms: { type: String },
  },
  {
    timestamps: true,
    toJSON: { flattenMaps: true },
    toObject: { flattenMaps: true },
  }
);

export const Product = model("Product", productSchema);