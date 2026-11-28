import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  brevoPasswordResetMailer,
  passwordResetBaseUrl,
  passwordResetDeliveryConfigured,
  passwordResetMailer,
  smtpPasswordResetMailer,
} from './passwordResetMailer.js';

const mocks = vi.hoisted(() => ({
  createTransport: vi.fn(),
  sendMail: vi.fn(),
  close: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock('nodemailer', () => ({
  default: { createTransport: mocks.createTransport },
}));

const originalEnv = {
  NODE_ENV: process.env.NODE_ENV,
  SMTP_URL: process.env.SMTP_URL,
  BREVO_API_KEY: process.env.BREVO_API_KEY,
  MAIL_FROM: process.env.MAIL_FROM,
  APP_BASE_URL: process.env.APP_BASE_URL,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', mocks.fetch);
  process.env.NODE_ENV = 'test';
  process.env.SMTP_URL = 'smtps://smtp.example.test:465';
  delete process.env.BREVO_API_KEY;
  process.env.MAIL_FROM = 'KontentOS <studio@example.test>';
  process.env.APP_BASE_URL = 'https://studio.example.test';
  mocks.sendMail.mockResolvedValue({ messageId: 'synthetic-message' });
  mocks.createTransport.mockReturnValue({
    sendMail: mocks.sendMail,
    close: mocks.close,
  });
  mocks.fetch.mockResolvedValue({ ok: true, status: 201 });
});

afterEach(() => {
  vi.unstubAllGlobals();
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe('password reset delivery', () => {
  it('requires every delivery setting before claiming recovery is configured', () => {
    expect(passwordResetDeliveryConfigured()).toBe(true);
    delete process.env.MAIL_FROM;
    expect(passwordResetDeliveryConfigured()).toBe(false);
  });

  it('accepts Brevo without SMTP and prefers its HTTPS API', async () => {
    delete process.env.SMTP_URL;
    process.env.BREVO_API_KEY = 'synthetic-brevo-key';
    expect(passwordResetDeliveryConfigured()).toBe(true);

    const resetUrl = 'https://studio.example.test/reset-password?token=abc';
    await passwordResetMailer({ to: 'creator@example.test', resetUrl });

    expect(mocks.fetch).toHaveBeenCalledOnce();
    const [url, init] = mocks.fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.brevo.com/v3/smtp/email');
    expect(init.headers).toMatchObject({ 'api-key': 'synthetic-brevo-key' });
    expect(JSON.parse(String(init.body))).toMatchObject({
      sender: { name: 'KontentOS', email: 'studio@example.test' },
      to: [{ email: 'creator@example.test' }],
      subject: 'Reset your KontentOS password',
      textContent: expect.stringContaining(resetUrl),
      htmlContent: expect.stringContaining(`href="${resetUrl}"`),
    });
    expect(mocks.createTransport).not.toHaveBeenCalled();

    delete process.env.BREVO_API_KEY;
    expect(passwordResetDeliveryConfigured()).toBe(false);
  });

  it('surfaces Brevo refusals without exposing the API key', async () => {
    process.env.BREVO_API_KEY = 'synthetic-brevo-key';
    mocks.fetch.mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ message: 'Unauthorized' }),
    });

    await expect(brevoPasswordResetMailer({
      to: 'creator@example.test',
      resetUrl: 'https://studio.example.test/reset-password?token=abc',
    })).rejects.toThrow(/Brevo.*401.*Unauthorized/);
    try {
      await brevoPasswordResetMailer({
        to: 'creator@example.test',
        resetUrl: 'https://studio.example.test/reset-password?token=abc',
      });
    } catch (error) {
      expect(String(error)).not.toContain('synthetic-brevo-key');
    }
  });

  it('rejects a plaintext public app origin in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.APP_BASE_URL = 'http://studio.example.test';
    expect(passwordResetBaseUrl()).toBeNull();
    expect(passwordResetDeliveryConfigured()).toBe(false);
  });

  it('requires SMTP TLS and closes the transport after sending', async () => {
    const resetUrl = 'https://studio.example.test/reset-password?token=abc';
    await smtpPasswordResetMailer({ to: 'creator@example.test', resetUrl });

    expect(mocks.createTransport).toHaveBeenCalledWith(expect.objectContaining({
      url: 'smtps://smtp.example.test:465',
      requireTLS: true,
    }));
    expect(mocks.sendMail).toHaveBeenCalledWith(expect.objectContaining({
      to: 'creator@example.test',
      subject: 'Reset your KontentOS password',
      text: expect.stringContaining(resetUrl),
      html: expect.stringContaining(`href="${resetUrl}"`),
    }));
    expect(mocks.close).toHaveBeenCalledOnce();
  });

  it('refuses to open a transport without SMTP credentials', async () => {
    delete process.env.SMTP_URL;
    await expect(smtpPasswordResetMailer({
      to: 'creator@example.test',
      resetUrl: 'https://studio.example.test/reset-password?token=abc',
    })).rejects.toThrow(/not configured/i);
    expect(mocks.createTransport).not.toHaveBeenCalled();
  });
});
