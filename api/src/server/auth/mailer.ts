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
