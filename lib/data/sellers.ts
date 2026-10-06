/**
 * Seller profile / artist portfolio.
 *
 * The public portfolio at /sellers/[slug] is readable by anyone, signed in or
 * not - it is the artist's shop window. Everything that writes to it is scoped
 * to the owning session.
 */
import "server-only";

import { db } from "@/lib/db";
import type { SellerProfileInput } from "@/lib/validation/seller";

import { ForbiddenError, requireUser, requireVerifiedUser } from "./auth";

/** The public portfolio. Deliberately excludes earnings and the owner's email. */
export interface PublicPortfolio {
  slug: string;
  displayName: string;
  bio: string | null;
  avatarUrl: string | null;
  bannerUrl: string | null;
  location: string | null;
  websiteUrl: string | null;
  instagram: string | null;
  joinedAt: Date;
  products: {
    id: string;
    slug: string;
    title: string;
    priceIdr: number;
    fulfilmentType: "PRINT_ON_DEMAND" | "SELLER_STOCKED";
    stockQty: number | null;
    imageUrl: string | null;
  }[];
}

export async function getPublicPortfolio(slug: string): Promise<PublicPortfolio | null> {
  const row = await db.sellerProfile.findFirst({
    // Unapproved sellers have no public page yet.
    where: { slug, isApproved: true },
    select: {
      slug: true,
      displayName: true,
      bio: true,
      avatarUrl: true,
      bannerUrl: true,
      location: true,
      websiteUrl: true,
      instagram: true,
      createdAt: true,
      products: {
        where: { status: "ACTIVE" },
        select: {
          id: true,
          slug: true,
          title: true,
          priceIdr: true,
          fulfilmentType: true,
          stockQty: true,
          artworkUrl: true,
          images: { select: { url: true }, orderBy: { sortOrder: "asc" }, take: 1 },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!row) return null;

  return {
    slug: row.slug,
    displayName: row.displayName,
    bio: row.bio,
    avatarUrl: row.avatarUrl,
    bannerUrl: row.bannerUrl,
    location: row.location,
    websiteUrl: row.websiteUrl,
    instagram: row.instagram,
    joinedAt: row.createdAt,
    products: row.products.map((p) => ({
      id: p.id,
      slug: p.slug,
      title: p.title,
      priceIdr: p.priceIdr,
      fulfilmentType: p.fulfilmentType,
      stockQty: p.stockQty,
      imageUrl: p.images[0]?.url ?? p.artworkUrl ?? null,
    })),
  };
}

/** Does the signed-in user already sell? Used to pick nav items. */
export async function getOwnSellerProfile() {
  const user = await requireUser();

  return db.sellerProfile.findUnique({
    where: { userId: user.id },
    select: {
      id: true,
      slug: true,
      displayName: true,
      bio: true,
      avatarUrl: true,
      bannerUrl: true,
      location: true,
      websiteUrl: true,
      instagram: true,
      isApproved: true,
    },
  });
}

async function assertSlugAvailable(slug: string, exceptUserId?: string) {
  const clash = await db.sellerProfile.findUnique({
    where: { slug },
    select: { userId: true },
  });
  if (clash && clash.userId !== exceptUserId) {
    throw new ForbiddenError("That handle is already taken.");
  }
}

/**
 * Become a seller, or edit an existing profile.
 *
 * Requires a verified email: a seller storefront is a public, money-handling
 * identity, so we insist the address is real first.
 *
 * Note `isApproved` is absent from both branches - a seller cannot approve
 * themselves. Only an admin sets it.
 */
export async function upsertOwnSellerProfile(input: SellerProfileInput) {
  const user = await requireVerifiedUser();
  await assertSlugAvailable(input.slug, user.id);

  const data = {
    slug: input.slug,
    displayName: input.displayName,
    bio: input.bio || null,
    location: input.location || null,
    websiteUrl: input.websiteUrl || null,
    instagram: input.instagram || null,
  };

  const profile = await db.$transaction(async (tx) => {
    const created = await tx.sellerProfile.upsert({
      where: { userId: user.id },
      create: { userId: user.id, ...data },
      update: data,
      select: { id: true, slug: true, isApproved: true },
    });

    // Every seller needs a balance row so earnings have somewhere to land.
    await tx.sellerBalance.upsert({
      where: { sellerId: created.id },
      create: { sellerId: created.id },
      update: {},
    });

    // Promote BUYER -> SELLER. Never demotes, and never touches an ADMIN.
    if (user.role === "BUYER") {
      await tx.user.update({ where: { id: user.id }, data: { role: "SELLER" } });
      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: "seller.profile.created",
          entity: "SellerProfile",
          entityId: created.id,
        },
      });
    }

    return created;
  });

  return profile;
}

/** The seller's own earnings. Scoped to their session. */
export async function getOwnEarnings() {
  const user = await requireUser();

  const seller = await db.sellerProfile.findUnique({
    where: { userId: user.id },
    select: {
      id: true,
      balance: { select: { availableIdr: true, pendingIdr: true, lifetimeIdr: true } },
      payouts: {
        select: { id: true, amountIdr: true, status: true, requestedAt: true, bankName: true },
        orderBy: { requestedAt: "desc" },
        take: 20,
      },
    },
  });

  if (!seller) throw new ForbiddenError("You do not have a seller profile yet.");

  return {
    available: seller.balance?.availableIdr ?? 0,
    pending: seller.balance?.pendingIdr ?? 0,
    lifetime: seller.balance?.lifetimeIdr ?? 0,
    payouts: seller.payouts,
  };
}
