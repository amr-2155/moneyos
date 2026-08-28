import { z } from "zod";
import { isValidDateStr } from "../../lib/dates.js";

export const transferCreateSchema = z.object({
  fromAccountId: z.string().min(1, "fromAccountId is required"),
  toAccountId: z.string().min(1, "toAccountId is required"),
  amount: z.string().regex(/^\d+(\.\d+)?$/, "Amount must be a non-negative decimal string"),
  date: z.string().refine(isValidDateStr, "Date must be a valid YYYY-MM-DD date"),
  notes: z.string().trim().max(1000, "Notes are too long").optional(),
});

export const transferListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const transferIdParamsSchema = z.object({
  id: z.string().min(1),
});
