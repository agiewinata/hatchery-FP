/**
 * Studio design Data Access Layer.
 *
 * Same shape as the rest of lib/data: server-only, guards that throw, DTOs
 * built explicitly, and every owner-scoped write expressed as a WHERE clause
 * rather than an if-statement - so a mismatched owner yields `count: 0` instead
 * of touching somebody else's row.
 *
 * One function here is deliberately unauthenticated: `getPublicDesign`. It
 * filters on `visibility: "PUBLIC"` inside the query itself, exactly as
 * `getPublicProduct` filters on `status: "ACTIVE"`, so an unpublished design
 * cannot be reached by guessing a slug.
 */
import "server-only";

import { db } from "@/lib/db";
import { ForbiddenError } from "@/lib/errors";
import { slugWithSuffix } from "@/lib/slug";
import type { StudioParams } from "@/lib/studio/templates";
import type { Outline } from "@/lib/studio/types";
import {
  MAX_DESIGNS_PER_USER,
  outlineSchema,
  paramsSchema,
  type DesignInput,
  type DesignVisibilityInput,
} from "@/lib/validation/studio";

import { requireAdmin, requireUser } from "./auth";

export interface DesignSummary {
  id: string;
  title: string;
  slug: string;
  templateId: string;
  visibility: DesignVisibilityInput;
  updatedAt: Date;
}

export interface DesignDetail extends DesignSummary {
  outline: Outline;
  params: StudioParams;
}

/** A shared design, as a stranger may see it. */
export interface PublicDesign {
  title: string;
  slug: string;
  outline: Outline;
  params: StudioParams;
  createdAt: Date;
  /**
   * The maker's public shop name, or null.
   *
   * NEVER `user.name`. For a plain buyer that is a real person's legal name,
   * and they shared a shape, not their identity - the same reason
   * PublicPortfolio omits the owner's email. Only a seller, who has already
   * chosen a public display name, is attributed.
   */
  makerName: string | null;
  makerSlug: string | null;
}

/**
 * Turn the two Json columns back into typed values.
 *
 * Parsed rather than cast: `outline` and `params` are schemaless in Postgres,
 * so a row written by an older version of this code is untrusted input here.
 * Throwing a typed error beats letting malformed data reach the renderer.
 */
function parseStored(row: { outline: unknown; params: unknown }): {
  outline: Outline;
  params: StudioParams;
} {
  const outline = outlineSchema.safeParse(row.outline);
  const params = paramsSchema.safeParse(row.params);

  if (!outline.success || !params.success) {
    throw new ForbiddenError("That design was saved in a format we can no longer read.");
  }

  return { outline: outline.data, params: params.data };
}

// ===========================================================================
// Owner-scoped reads
// ===========================================================================

export async function listOwnDesigns(): Promise<DesignSummary[]> {
  const user = await requireUser();

  const rows = await db.studioDesign.findMany({
    where: { userId: user.id },
    select: {
      id: true,
      title: true,
      slug: true,
      templateId: true,
      visibility: true,
      updatedAt: true,
    },
    orderBy: { updatedAt: "desc" },
    take: MAX_DESIGNS_PER_USER,
  });

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    slug: row.slug,
    templateId: row.templateId,
    visibility: row.visibility,
    updatedAt: row.updatedAt,
  }));
}

/** One of the caller's own designs. Null when it is not theirs - not an error. */
export async function getOwnDesign(designId: string): Promise<DesignDetail | null> {
  const user = await requireUser();

  // The `userId` term IS the authorization check. Without it this is an IDOR.
  const row = await db.studioDesign.findFirst({
    where: { id: designId, userId: user.id },
    select: {
      id: true,
      title: true,
      slug: true,
      templateId: true,
      visibility: true,
      updatedAt: true,
      outline: true,
      params: true,
    },
  });

  if (!row) return null;

  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    templateId: row.templateId,
    visibility: row.visibility,
    updatedAt: row.updatedAt,
    ...parseStored(row),
  };
}

// ===========================================================================
// Public read
// ===========================================================================

export async function getPublicDesign(slug: string): Promise<PublicDesign | null> {
  const row = await db.studioDesign.findFirst({
    where: { slug, visibility: "PUBLIC" },
    select: {
      title: true,
      slug: true,
      outline: true,
      params: true,
      createdAt: true,
      user: {
        select: {
          sellerProfile: { select: { displayName: true, slug: true, isApproved: true } },
        },
      },
    },
  });

  if (!row) return null;

  // Attribute only an approved shop. An unapproved or absent seller profile
  // means the design is shown with no author at all.
  const seller = row.user.sellerProfile?.isApproved ? row.user.sellerProfile : null;

  return {
    title: row.title,
    slug: row.slug,
    createdAt: row.createdAt,
    makerName: seller?.displayName ?? null,
    makerSlug: seller?.slug ?? null,
    ...parseStored(row),
  };
}

// ===========================================================================
// Writes
// ===========================================================================

export async function createDesign(input: DesignInput): Promise<{ id: string; slug: string }> {
  const user = await requireUser();

  // Bound stored geometry per account. The per-outline point cap limits one
  // row; this limits how many rows one person can accumulate.
  const existing = await db.studioDesign.count({ where: { userId: user.id } });
  if (existing >= MAX_DESIGNS_PER_USER) {
    throw new ForbiddenError(
      `You can keep up to ${MAX_DESIGNS_PER_USER} designs. Delete one to make room.`,
    );
  }

  // Retry on the unique constraint rather than pre-checking, the way
  // newOrderNumber does: a pre-check races, a retry does not.
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await db.studioDesign.create({
        data: {
          userId: user.id,
          title: input.title,
          slug: slugWithSuffix(input.title),
          // Taken from the parsed params so the column can never disagree with
          // the stored parameter shape.
          templateId: input.params.templateId,
          outline: input.outline,
          params: input.params,
        },
        select: { id: true, slug: true },
      });
    } catch (error) {
      if (!isUniqueViolation(error) || attempt === 4) throw error;
    }
  }

  throw new ForbiddenError("Could not save that design. Please try again.");
}

export async function updateDesign(designId: string, input: DesignInput): Promise<void> {
  const user = await requireUser();

  // updateMany, not update: the userId scope becomes part of the WHERE clause,
  // so another user's id simply matches nothing.
  const result = await db.studioDesign.updateMany({
    where: { id: designId, userId: user.id },
    data: {
      title: input.title,
      templateId: input.params.templateId,
      outline: input.outline,
      params: input.params,
    },
  });

  if (result.count === 0) throw new ForbiddenError("That design is not yours to edit.");
}

export async function setDesignVisibility(
  designId: string,
  visibility: DesignVisibilityInput,
): Promise<void> {
  const user = await requireUser();

  const result = await db.studioDesign.updateMany({
    where: { id: designId, userId: user.id },
    data: { visibility },
  });

  if (result.count === 0) throw new ForbiddenError("That design is not yours to share.");
}

export async function deleteDesign(designId: string): Promise<void> {
  const user = await requireUser();

  const result = await db.studioDesign.deleteMany({
    where: { id: designId, userId: user.id },
  });

  if (result.count === 0) throw new ForbiddenError("That design is not yours to delete.");
}

// ===========================================================================
// Admin
// ===========================================================================

/** Published designs, newest first, for moderation. */
export async function listPublicDesignsForReview(limit = 50) {
  await requireAdmin();

  return db.studioDesign.findMany({
    where: { visibility: "PUBLIC" },
    select: {
      id: true,
      title: true,
      slug: true,
      createdAt: true,
      user: { select: { email: true } },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

/**
 * Take a shared design down.
 *
 * Sets it back to PRIVATE rather than deleting: the maker keeps their work, the
 * public link stops resolving. Audited beside the seller-approval entries,
 * because an admin acting on someone else's content should leave a trace.
 */
export async function adminUnpublishDesign(designId: string): Promise<void> {
  const admin = await requireAdmin();

  await db.$transaction(async (tx) => {
    const result = await tx.studioDesign.updateMany({
      where: { id: designId, visibility: "PUBLIC" },
      data: { visibility: "PRIVATE" },
    });

    if (result.count === 0) throw new ForbiddenError("That design is not published.");

    await tx.auditLog.create({
      data: {
        userId: admin.id,
        action: "studio.design.unpublished",
        entity: "StudioDesign",
        entityId: designId,
      },
    });
  });
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}
