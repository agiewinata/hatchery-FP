/**
 * Typed application errors.
 *
 * Deliberately in their own module with NO imports.
 *
 * These classes are needed on both sides of the server/client boundary: the DAL
 * throws them, and the Server Action wrapper catches them to build a message.
 * If they lived in lib/data/*, importing them would drag in lib/db.ts and the
 * Postgres driver - and because the action-state helpers are imported by Client
 * Components, that pulled `pg` into the browser bundle. Keeping them free of
 * dependencies is what stops that.
 */

/** Not signed in. The UI should send them to /login. */
export class UnauthenticatedError extends Error {
  readonly status = 401;
  constructor(message = "You must be signed in to do that.") {
    super(message);
    this.name = "UnauthenticatedError";
  }
}

/**
 * Signed in, but not allowed.
 *
 * Messages on this class are written to be safe to show to the user, so they
 * must never include internal detail (ids, query text, other users' data).
 */
export class ForbiddenError extends Error {
  readonly status = 403;
  constructor(message = "You do not have permission to do that.") {
    super(message);
    this.name = "ForbiddenError";
  }
}

/** The cart could not be turned into an order (stock gone, price changed, empty). */
export class CheckoutError extends Error {
  readonly status = 409;
  constructor(message: string) {
    super(message);
    this.name = "CheckoutError";
  }
}
