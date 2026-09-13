import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const dateValidator = v.string();
const amountValidator = v.number();

function validateInputs(date: string, amounts: { totalSales: number; cash: number; online: number; financed: number }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Invalid date");
  for (const [key, value] of Object.entries(amounts)) {
    if (!Number.isFinite(value) || value < 0) {
      throw new Error(`"${key}" must be a number greater than or equal to 0`);
    }
  }
}

export const listRange = query({
  args: { from: dateValidator, to: dateValidator },
  handler: async (ctx, { from, to }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    const all = await ctx.db
      .query("salesRecords")
      .withIndex("by_user_date", (q) =>
        q.eq("userId", userId).gte("date", from).lte("date", to),
      )
      .collect();
    return all.sort((a, b) => (a.date === b.date ? b.updatedAt - a.updatedAt : b.date.localeCompare(a.date)));
  },
});

export const totals = query({
  args: { from: dateValidator, to: dateValidator },
  handler: async (ctx, { from, to }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return { totalSales: 0, cash: 0, online: 0, financed: 0 };
    const rows = await ctx.db
      .query("salesRecords")
      .withIndex("by_user_date", (q) =>
        q.eq("userId", userId).gte("date", from).lte("date", to),
      )
      .collect();
    return rows.reduce(
      (acc, r) => ({
        totalSales: acc.totalSales + r.totalSales,
        cash: acc.cash + r.cash,
        online: acc.online + r.online,
        financed: acc.financed + r.financed,
      }),
      { totalSales: 0, cash: 0, online: 0, financed: 0 },
    );
  },
});

export const upsert = mutation({
  args: {
    storeId: v.id("stores"),
    date: dateValidator,
    totalSales: amountValidator,
    cash: amountValidator,
    online: amountValidator,
    financed: amountValidator,
    note: v.optional(v.string()),
  },
  handler: async (ctx, { storeId, date, totalSales, cash, online, financed, note }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not authenticated");

    validateInputs(date, { totalSales, cash, online, financed });

    const store = await ctx.db.get(storeId);
    if (!store || store.userId !== userId) throw new Error("Store not found");

    const now = Date.now();
    const existing = await ctx.db
      .query("salesRecords")
      .withIndex("by_store_date", (q) => q.eq("storeId", storeId).eq("date", date))
      .unique();

    const cleanNote = note?.trim() ? note.trim().slice(0, 2000) : undefined;

    if (existing) {
      await ctx.db.patch(existing._id, {
        totalSales,
        cash,
        online,
        financed,
        note: cleanNote,
        updatedAt: now,
      });
      return existing._id;
    }

    return await ctx.db.insert("salesRecords", {
      userId,
      storeId,
      date,
      totalSales,
      cash,
      online,
      financed,
      note: cleanNote,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const remove = mutation({
  args: { id: v.id("salesRecords") },
  handler: async (ctx, { id }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not authenticated");

    const record = await ctx.db.get(id);
    if (!record || record.userId !== userId) throw new Error("Record not found");

    await ctx.db.delete(id);
    return id;
  },
});
