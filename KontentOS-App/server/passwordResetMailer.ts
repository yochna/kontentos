import nodemailer from 'nodemailer';

export interface PasswordResetEmail {
  to: string;
  resetUrl: string;
}

export type PasswordResetMailer = (email: PasswordResetEmail) => Promise<void>;

const BREVO_ENDPOINT = 'https://api.brevo.com/v3/smtp/email';

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

export function passwordResetDeliveryProvider(): 'brevo' | 'smtp' | null {
  if ((process.env.BREVO_API_KEY || '').trim()) return 'brevo';
  if ((process.env.SMTP_URL || '').trim()) return 'smtp';
  return null;
}

export function passwordResetDeliveryConfigured(): boolean {
  const from = (process.env.MAIL_FROM || '').trim();
  return Boolean(passwordResetDeliveryProvider() && from && passwordResetBaseUrl());
}

function senderAddress(from: string): { name?: string; email: string } {
  const match = from.match(/^(.*?)\s*<([^<>]+)>$/);
  const email = (match?.[2] || from).trim();
  const name = match?.[1].trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Password reset sender is not configured.');
  }
  return name ? { name, email } : { email };
}

function emailContent(resetUrl: string): { text: string; html: string } {
  const safeUrl = resetUrl.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  return {
    text: `Reset your KontentOS password using this link:\n\n${resetUrl}\n\nThe link expires in 30 minutes. If you did not request this, you can ignore this email.`,
    html: `<p>Reset your KontentOS password using this link:</p><p><a href="${safeUrl}">Choose a new password</a></p><p>The link expires in 30 minutes. If you did not request this, you can ignore this email.</p>`,
  };
}

export const brevoPasswordResetMailer: PasswordResetMailer = async ({ to, resetUrl }) => {
  const apiKey = (process.env.BREVO_API_KEY || '').trim();
  const from = (process.env.MAIL_FROM || '').trim();
  if (!apiKey || !from) throw new Error('Password reset email is not configured.');

  const content = emailContent(resetUrl);
  const response = await fetch(BREVO_ENDPOINT, {
    method: 'POST',
    headers: {
      'api-key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      sender: senderAddress(from),
      to: [{ email: to }],
      subject: 'Reset your KontentOS password',
      textContent: content.text,
      htmlContent: content.html,
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    let detail = '';
    try {
      const body = await response.json() as { message?: string; code?: string };
      detail = body.message || body.code || '';
    } catch {
      detail = '';
    }
    throw new Error(`Brevo rejected the reset email (HTTP ${response.status})${detail ? `: ${detail.slice(0, 240)}` : '.'}`);
  }
};

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
  const content = emailContent(resetUrl);
  try {
    await transport.sendMail({
      from,
      to,
      subject: 'Reset your KontentOS password',
      text: content.text,
      html: content.html,
    });
  } finally {
    transport.close();
  }
};

export const passwordResetMailer: PasswordResetMailer = async (email) => {
  if (passwordResetDeliveryProvider() === 'brevo') return brevoPasswordResetMailer(email);
  return smtpPasswordResetMailer(email);
};
