/**
 * URL slug helpers.
 *
 * Pure and dependency-free, so both the product actions and the studio DAL can
 * share one definition. They previously had a copy each, which is how two
 * slugs for the same title quietly stop matching.
 */
import { randomBytes } from "node:crypto";

/**
 * Turn arbitrary text into a candidate slug.
 *
 * The result is still schema-validated by callers: this normalises, it does not
 * authorise. NFKD first so accented characters degrade to their base letters
 * rather than being deleted wholesale.
 */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/**
 * A slug with random entropy appended.
 *
 * Used where the slug appears in a shareable URL. Server-generated and
 * non-sequential so nobody can squat a desirable name, impersonate another
 * maker, or enumerate other people's designs by counting upward.
 */
export function slugWithSuffix(title: string, fallback = "design"): string {
  const base = slugify(title) || fallback;
  const suffix = randomBytes(3).toString("hex");
  // Leave room for the suffix inside the 80-character budget.
  return `${base.slice(0, 72)}-${suffix}`;
}
