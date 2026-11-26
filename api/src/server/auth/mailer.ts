/** Sign-in mail. Development delivery is MailHog on SMTP_HOST:SMTP_PORT. */
import { mailer } from "@/lib/mailer";
import { env } from "@/env";
import { BRAND } from "@/domain/platform";

export async function sendSignInLink(to: string, url: string): Promise<void> {
  await mailer.sendMail({
    from: env.SMTP_FROM,
    to,
    subject: `Your ${BRAND} sign-in link`,
    text: `Sign in to ${BRAND}: ${url}\n\nThis link works once and expires shortly.`,
  });
}

/** Requester-portal sign-in: the link plus the 6-digit code, in one email. */
export async function sendRequesterSignInLink(to: string, url: string, code: string): Promise<void> {
  await mailer.sendMail({
    from: env.SMTP_FROM,
    to,
    subject: "Your sign-in link and code",
    text: `Sign in: ${url}\n\nYour 6-digit code: ${code}\n\nThe link and code expire after 15 minutes and work once.`,
  });
}

/** Intake confirmation (G3): receipt + the email-confirmation link (G2). */
export async function sendConfirmationEmail(to: string, caseNumber: string, confirmUrl: string): Promise<void> {
  await mailer.sendMail({
    from: env.SMTP_FROM,
    to,
    subject: "We received your data request",
    text: `We received your request (reference ${caseNumber}).\n\nConfirm your email address: ${confirmUrl}\n\nThis email confirms receipt only and is not legal advice.`,
  });
}
