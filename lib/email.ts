/**
 * Transactional email.
 *
 * Two transports, chosen by EMAIL_PROVIDER:
 *   CONSOLE - prints to the server terminal. Lets the whole password-reset and
 *             email-verification flow be developed and demoed with no API key.
 *   RESEND  - real delivery.
 *
 * SECURITY: email bodies here carry single-use credentials (reset and
 * verification links). The CONSOLE transport is therefore refused in
 * production by lib/env.ts's NODE_ENV gate on BETTER_AUTH_URL/https, and we
 * never log token values from any other module.
 */
import "server-only";

import { Resend } from "resend";

import { env } from "./env";

export interface SendEmailInput {
  to: string;
  subject: string;
  /** Plain-text body. Always provided - some clients prefer it, and it is what CONSOLE prints. */
  text: string;
  html?: string;
}

let resend: Resend | null = null;
const getResend = () => {
  resend ??= new Resend(env.RESEND_API_KEY);
  return resend;
};

export async function sendEmail({ to, subject, text, html }: SendEmailInput): Promise<void> {
  if (env.EMAIL_PROVIDER === "CONSOLE") {
    // Deliberately loud and easy to spot in a busy dev server log.
    const rule = "=".repeat(72);
    console.log(
      [
        "",
        rule,
        "  EMAIL (dev console transport - not actually sent)",
        rule,
        `  To:      ${to}`,
        `  Subject: ${subject}`,
        rule,
        text.trim(),
        rule,
        "",
      ].join("\n"),
    );
    return;
  }

  const { error } = await getResend().emails.send({
    from: env.EMAIL_FROM,
    to,
    subject,
    text,
    ...(html ? { html } : {}),
  });

  if (error) {
    // Surface the provider message but never the recipient's token-bearing body.
    throw new Error(`Failed to send email "${subject}": ${error.message}`);
  }
}

/** Shared wrapper so every email looks consistent and mentions the sender. */
const layout = (heading: string, body: string, action?: { label: string; url: string }) =>
  [
    heading,
    "",
    body,
    ...(action ? ["", `${action.label}:`, action.url] : []),
    "",
    "--",
    "Keychain Marketplace",
  ].join("\n");

export function passwordResetEmail(url: string): Pick<SendEmailInput, "subject" | "text"> {
  return {
    subject: "Reset your Keychain Marketplace password",
    text: layout(
      "Password reset requested",
      [
        "Someone asked to reset the password for this account.",
        "The link below can be used once and expires in 1 hour.",
        "",
        "If this was not you, you can ignore this email - your password has not changed.",
      ].join("\n"),
      { label: "Reset your password", url },
    ),
  };
}

export function verificationEmail(url: string): Pick<SendEmailInput, "subject" | "text"> {
  return {
    subject: "Confirm your email address",
    text: layout(
      "Confirm your email address",
      "Verify your address to activate your account and start selling.",
      { label: "Confirm email", url },
    ),
  };
}
