/**
 * Gateway selection.
 *
 * Exactly one gateway is active per deployment, chosen by PAYMENT_PROVIDER and
 * validated at boot by lib/env.ts (which also forbids MOCK in production).
 */
import "server-only";

import { env } from "@/lib/env";

import { mockGateway } from "./mock";
import type { PaymentGateway } from "./types";
import { xenditGateway } from "./xendit";

export const paymentGateway: PaymentGateway =
  env.PAYMENT_PROVIDER === "XENDIT" ? xenditGateway : mockGateway;

export type {
  CheckoutLineItem,
  CreateCheckoutInput,
  CreateCheckoutResult,
  PaymentGateway,
  PaymentOutcome,
  WebhookVerdict,
} from "./types";
