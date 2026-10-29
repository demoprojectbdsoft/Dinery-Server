import { Category } from "./category.model";
import { SubCategory } from "../subcategory/subcategory.model";
import { Product } from "../product/product.model";
import { ApiError } from "../../utils/apiError";
import { idVariants } from "../../utils/ids";
import { CreateCategoryInput, UpdateCategoryInput } from "./category.validator";

interface GetCategoriesFilter {
  isActive?: boolean;
}

export async function createCategory(data: CreateCategoryInput) {
  const existing = await Category.findOne({ slug: data.slug });
  if (existing) throw new ApiError(409, "Slug already in use");
  return Category.create(data);
}

export async function getCategories(filterInput: GetCategoriesFilter = {}) {
  const filter: Record<string, any> = {};
  if (filterInput.isActive !== undefined) {
    filter.isActive = filterInput.isActive;
  }
  return Category.find(filter).sort({ createdAt: -1 });
}

export async function updateCategory(id: string, data: UpdateCategoryInput) {
  const category = await Category.findByIdAndUpdate(id, data, { new: true });
  if (!category) throw new ApiError(404, "Category not found");
  return category;
}

export async function deleteCategory(id: string) {
  // Block delete if any products belong to this category or its subcategories
  const catMatches = idVariants(id);

  const subCategories = await SubCategory.find({
    categoryId: { $in: catMatches },
  }).select("_id");

  const allSubMatches = subCategories.flatMap((sub) => idVariants(sub._id.toString()));

  const productCount = await Product.countDocuments({
    $or: [
      { categoryId: { $in: catMatches } },
      { subCategoryIds: { $in: allSubMatches } },
    ],
  });
  if (productCount > 0) throw new ApiError(400, "Cannot delete category with active products");

  // Delete all child subcategories first, then the category itself
  await SubCategory.deleteMany({ categoryId: { $in: catMatches } });
  await Category.findByIdAndDelete(id);
}