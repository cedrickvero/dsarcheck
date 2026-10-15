/** Sign-in mail. Development delivery is MailHog on SMTP_HOST:SMTP_PORT. */
import { mailer } from "@/lib/mailer";
import { env } from "@/env";

export async function sendSignInLink(to: string, url: string): Promise<void> {
  await mailer.sendMail({
    from: env.SMTP_FROM,
    to,
    subject: "Your Privacyspace sign-in link",
    text: `Sign in to Privacyspace: ${url}\n\nThis link works once and expires shortly.`,
  });
}
