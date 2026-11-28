import nodemailer from 'nodemailer';

export interface PasswordResetEmail {
  to: string;
  resetUrl: string;
}

export type PasswordResetMailer = (email: PasswordResetEmail) => Promise<void>;

export function passwordResetBaseUrl(): string | null {
  const raw = (process.env.APP_BASE_URL || '').trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') return null;
    if (url.username || url.password || url.search || url.hash) return null;
    return url.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

export function passwordResetDeliveryConfigured(): boolean {
  return Boolean(
    (process.env.SMTP_URL || '').trim()
      && (process.env.MAIL_FROM || '').trim()
      && passwordResetBaseUrl(),
  );
}

export const smtpPasswordResetMailer: PasswordResetMailer = async ({ to, resetUrl }) => {
  const smtpUrl = (process.env.SMTP_URL || '').trim();
  const from = (process.env.MAIL_FROM || '').trim();
  if (!smtpUrl || !from) throw new Error('Password reset email is not configured.');

  const transport = nodemailer.createTransport({
    url: smtpUrl,
    requireTLS: true,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });
  const safeUrl = resetUrl.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  try {
    await transport.sendMail({
      from,
      to,
      subject: 'Reset your KontentOS password',
      text: `Reset your KontentOS password using this link:\n\n${resetUrl}\n\nThe link expires in 30 minutes. If you did not request this, you can ignore this email.`,
      html: `<p>Reset your KontentOS password using this link:</p><p><a href="${safeUrl}">Choose a new password</a></p><p>The link expires in 30 minutes. If you did not request this, you can ignore this email.</p>`,
    });
  } finally {
    transport.close();
  }
};
