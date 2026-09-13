import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const get = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    return await ctx.db
      .query("appSettings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
  },
});

export const setCurrency = mutation({
  args: { currency: v.string() },
  handler: async (ctx, { currency }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not authenticated");

    const code = currency.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(code)) throw new Error("Invalid currency code");

    const existing = await ctx.db
      .query("appSettings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, { currency: code });
      return existing._id;
    }
    return await ctx.db.insert("appSettings", { userId, currency: code });
  },
});
