import { Schema, model } from "mongoose";

// One promo banner on the storefront.
//
// Each banner is its own document instead of a field on Site Settings, so the
// admin can name it, switch it on or off, reorder it, and keep more than the two
// the homepage shows. Nothing here names a product type: every word and every
// image is written by the owner, so the same banners keep working after the
// store switches to a different kind of catalog.
const promoSchema = new Schema(
  {
    // Internal label, so a list of banners stays readable in the dashboard.
    name: { type: String, required: true },

    // Where it appears: "tile" is one of the blocks in the row of tiles,
    // "strip" is the wide block further down the homepage.
    placement: {
      type: String,
      enum: ["tile", "strip"],
      default: "tile",
    },

    // Hidden until the owner fills the banner in and switches it on.
    isActive: { type: Boolean, default: false },

    subtitle: { type: String, default: "" },      // small line above the title
    highlightText: { type: String, default: "" }, // the bold word in the title
    title: { type: String, default: "" },

    image: { type: String, default: "" },         // a banner without an image is skipped
    imageAlt: { type: String, default: "" },
    href: { type: String, default: "" },          // blank falls back to /shop
    buttonText: { type: String, default: "" },

    badgeLabel: { type: String, default: "" },    // e.g. STARTING AT
    badgeValue: { type: String, default: "" },    // e.g. $79.99

    order: { type: Number, default: 0 },          // lower numbers show first
  },
  { timestamps: true }
);

export const Promo = model("Promo", promoSchema);
