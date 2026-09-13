import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    return await ctx.db
      .query("stores")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();
  },
});

export const create = mutation({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not authenticated");

    const trimmed = name.trim();
    if (!trimmed) throw new Error("Store name is required");
    if (trimmed.length > 60) throw new Error("Store name is too long");

    const existing = await ctx.db
      .query("stores")
      .withIndex("by_user_name", (q) => q.eq("userId", userId).eq("name", trimmed))
      .unique();
    if (existing) throw new Error(`A store named "${trimmed}" already exists`);

    const id = await ctx.db.insert("stores", {
      userId,
      name: trimmed,
      createdAt: Date.now(),
    });
    return id;
  },
});

export const rename = mutation({
  args: { id: v.id("stores"), name: v.string() },
  handler: async (ctx, { id, name }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not authenticated");

    const store = await ctx.db.get(id);
    if (!store || store.userId !== userId) throw new Error("Store not found");

    const trimmed = name.trim();
    if (!trimmed) throw new Error("Store name is required");
    if (trimmed.length > 60) throw new Error("Store name is too long");

    if (trimmed !== store.name) {
      const existing = await ctx.db
        .query("stores")
        .withIndex("by_user_name", (q) => q.eq("userId", userId).eq("name", trimmed))
        .unique();
      if (existing) throw new Error(`A store named "${trimmed}" already exists`);
    }

    await ctx.db.patch(id, { name: trimmed });
    return id;
  },
});

export const remove = mutation({
  args: { id: v.id("stores") },
  handler: async (ctx, { id }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not authenticated");

    const store = await ctx.db.get(id);
    if (!store || store.userId !== userId) throw new Error("Store not found");

    const records = await ctx.db
      .query("salesRecords")
      .withIndex("by_store_date", (q) => q.eq("storeId", id))
      .collect();
    for (const record of records) {
      await ctx.db.delete(record._id);
    }

    await ctx.db.delete(id);
    return id;
  },
});
