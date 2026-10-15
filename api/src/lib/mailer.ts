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
  secure: false,
  ignoreTLS: true,
});

export interface MailInput {
  to: string;
  subject: string;
  html: string;
}

export async function sendMail(input: MailInput): Promise<void> {
  await mailer.sendMail({ from: env.SMTP_FROM, ...input });
}
