import "server-only";
import nodemailer from "nodemailer";

/**
 * Transactional mail:
 * 1. Gmail SMTP (free, sends to any user) when SMTP_USER + SMTP_PASS (Google App Password) are set.
 * 2. Resend HTTP API when RESEND_API_KEY is set.
 * 3. Dev console log when neither is configured outside production.
 */
export async function sendMail(to: string, subject: string, text: string): Promise<void> {
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  if (smtpUser && smtpPass) {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST ?? "smtp.gmail.com",
      port: Number(process.env.SMTP_PORT ?? 465),
      secure: (process.env.SMTP_PORT ?? "465") === "465",
      auth: { user: smtpUser, pass: smtpPass },
    });
    await transporter.sendMail({
      from: process.env.MAIL_FROM ?? `FlowGram <${smtpUser}>`,
      to,
      subject,
      text,
    });
    return;
  }

  const key = process.env.RESEND_API_KEY;
  if (!key) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("Configure SMTP_USER/SMTP_PASS (Gmail SMTP) or RESEND_API_KEY in production");
    }
    console.info(`[mail:dev] to=${to} subject="${subject}"\n${text}`);
    return;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ from: process.env.MAIL_FROM ?? "FlowGram <no-reply@flowgram.app>", to, subject, text }),
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) throw new Error(`mail provider error ${res.status}`);
}
