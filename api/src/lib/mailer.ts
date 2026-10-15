import nodemailer from "nodemailer";
import { env } from "../env";

/**
 * Transactional email (docs/06). Mailhog locally; Postmark/SES in production
 * with per-customer DKIM sending domains.
 *
 * TODO(email slice): table-based templates, one primary CTA, and the required
 * footer ("This email confirms receipt only and is not legal advice.").
 */
export const mailer = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  secure: env.SMTP_SECURE,
  // Certificate verification is controlled by configuration and is refused outright
  // in production by the startup guard. It must never be hardcoded off: doing so
  // silently accepted any certificate, including an attacker's.
  ignoreTLS: env.SMTP_IGNORE_TLS,
});

export interface MailInput {
  to: string;
  subject: string;
  html: string;
}

export async function sendMail(input: MailInput): Promise<void> {
  await mailer.sendMail({ from: env.SMTP_FROM, ...input });
}
