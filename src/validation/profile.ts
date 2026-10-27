import { z } from "zod";

// Mirrors the database CHECK constraint: https, whiteshirt.fun or www.whiteshirt.fun only.
const CELEBRATION_RE = /^https:\/\/(www\.)?whiteshirt\.fun(\/[A-Za-z0-9._~%/-]*)?$/i;

export const celebrationUrlSchema = z
  .string().trim().max(200)
  .refine((v) => CELEBRATION_RE.test(v), "Use your whiteshirt.fun board link (https://whiteshirt.fun/...)");

export const usernameSchema = z
  .string().trim().toLowerCase()
  .regex(/^[a-z0-9_]{3,30}$/, "3-30 characters: lowercase letters, numbers, underscore");
