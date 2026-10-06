/**
 * Admin-only reads and writes.
 *
 * Every function here calls requireAdmin() first. None of them is reachable
 * without it, regardless of which page or action called in.
 */
import "server-only";

import { db } from "@/lib/db";
import { ForbiddenError } from "@/lib/errors";

import { requireAdmin } from "./auth";

/** Sellers awaiting review, newest first, then the already-approved ones. */
export async function listSellersForReview() {
  await requireAdmin();

  return db.sellerProfile.findMany({
    select: {
      id: true,
      slug: true,
      displayName: true,
      bio: true,
      location: true,
      websiteUrl: true,
      instagram: true,
      isApproved: true,
      createdAt: true,
      user: { select: { email: true, emailVerified: true, banned: true, id: true } },
      _count: { select: { products: true } },
    },
    orderBy: [{ isApproved: "asc" }, { createdAt: "desc" }],
    take: 100,
  });
}

/**
 * Approve or suspend a seller.
 *
 * Suspending does NOT delete anything: it flips `isApproved`, which removes the
 * shop from the public catalog and portfolio queries while leaving order
 * history intact. Deleting a seller mid-order would orphan real purchases.
 */
export async function setSellerApproval(sellerId: string, isApproved: boolean) {
  const admin = await requireAdmin();

  const seller = await db.sellerProfile.findUnique({
    where: { id: sellerId },
    select: { id: true, user: { select: { emailVerified: true } } },
  });

  if (!seller) throw new ForbiddenError("That seller does not exist.");

  // Approving an unverified address would publish a shop we cannot contact.
  if (isApproved && !seller.user.emailVerified) {
    throw new ForbiddenError("That seller has not confirmed their email address yet.");
  }

  await db.$transaction(async (tx) => {
    await tx.sellerProfile.update({
      where: { id: sellerId },
      data: { isApproved },
    });

    // Suspension must also pull their listings out of the storefront - leaving
    // them ACTIVE would keep them buyable through a direct URL.
    if (!isApproved) {
      await tx.product.updateMany({
        where: { sellerId, status: "ACTIVE" },
        data: { status: "DRAFT" },
      });
    }

    await tx.auditLog.create({
      data: {
        userId: admin.id,
        action: isApproved ? "seller.approved" : "seller.suspended",
        entity: "SellerProfile",
        entityId: sellerId,
      },
    });
  });
}

/** Recent audit entries, for the admin to see what has been happening. */
export async function listAuditLog(limit = 50) {
  await requireAdmin();

  return db.auditLog.findMany({
    select: {
      id: true,
      action: true,
      entity: true,
      entityId: true,
      createdAt: true,
      user: { select: { email: true, role: true } },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}
