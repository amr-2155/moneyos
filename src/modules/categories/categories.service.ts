import { and, eq, isNull, or } from "drizzle-orm";
import type { Db } from "../../db/client.js";
import { categories, type Category } from "../../db/schema.js";
import { AppError } from "../../lib/errors.js";

export interface CategoryView {
  id: string;
  name: string;
  type: Category["type"];
  parentId: string | null;
  icon: string | null;
  color: string | null;
  system: boolean;
  isArchived: boolean;
}

function toView(category: Category): CategoryView {
  return {
    id: category.id,
    name: category.name,
    type: category.type,
    parentId: category.parentId,
    icon: category.icon,
    color: category.color,
    system: category.userId === null,
    isArchived: category.isArchived,
  };
}

export class CategoryService {
  constructor(private readonly db: Db) {}

  /** Lists active system categories plus the user's own categories. */
  async list(userId: string): Promise<CategoryView[]> {
    const rows = await this.db
      .select()
      .from(categories)
      .where(and(or(isNull(categories.userId), eq(categories.userId, userId)), eq(categories.isArchived, false)))
      .all();
    return rows.map(toView);
  }

  async create(
    userId: string,
    input: { name: string; type: Category["type"]; parentId?: string; icon?: string; color?: string },
  ): Promise<CategoryView> {
    const parentId = input.parentId ?? null;
    if (parentId) {
      await this.getSystemOrOwnedCategory(userId, parentId);
    }
    const created = await this.db
      .insert(categories)
      .values({
        userId,
        name: input.name,
        type: input.type,
        parentId,
        icon: input.icon ?? null,
        color: input.color ?? null,
      })
      .returning();
    return toView(created[0]!);
  }

  async update(
    userId: string,
    categoryId: string,
    patch: { name?: string; icon?: string | null; color?: string | null; parentId?: string | null },
  ): Promise<CategoryView> {
    const category = await this.getUserCategory(userId, categoryId);
    if (patch.parentId !== undefined && patch.parentId !== null) {
      await this.getSystemOrOwnedCategory(userId, patch.parentId);
    }
    const updated = await this.db
      .update(categories)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(categories.id, category.id), eq(categories.userId, userId)))
      .returning();
    return toView(updated[0]!);
  }

  async archive(userId: string, categoryId: string): Promise<CategoryView> {
    const category = await this.getUserCategory(userId, categoryId);
    const updated = await this.db
      .update(categories)
      .set({ isArchived: true, updatedAt: new Date() })
      .where(and(eq(categories.id, category.id), eq(categories.userId, userId)))
      .returning();
    return toView(updated[0]!);
  }

  /** Returns a user-owned category or throws 403/404 for system categories. */
  async getUserCategory(userId: string, categoryId: string): Promise<Category> {
    const category = await this.db
      .select()
      .from(categories)
      .where(and(eq(categories.id, categoryId), eq(categories.userId, userId)))
      .get();
    if (!category) {
      const system = await this.db
        .select()
        .from(categories)
        .where(and(eq(categories.id, categoryId), isNull(categories.userId)))
        .get();
      if (system) {
        throw AppError.forbidden("System categories are read-only");
      }
      throw AppError.notFound("Category not found");
    }
    return category;
  }

  /**
   * Returns a category usable by the user: either a system category or the
   * user's own. Used for validating parent references and transaction links.
   */
  async getSystemOrOwnedCategory(userId: string, categoryId: string): Promise<Category> {
    const category = await this.db
      .select()
      .from(categories)
      .where(
        and(eq(categories.id, categoryId), or(isNull(categories.userId), eq(categories.userId, userId))),
      )
      .get();
    if (!category) {
      throw AppError.notFound("Category not found");
    }
    if (category.isArchived) {
      throw AppError.badRequest("Category is archived");
    }
    return category;
  }
}
