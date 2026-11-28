import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  passwordResetBaseUrl,
  passwordResetDeliveryConfigured,
  smtpPasswordResetMailer,
} from './passwordResetMailer.js';

const mocks = vi.hoisted(() => ({
  createTransport: vi.fn(),
  sendMail: vi.fn(),
  close: vi.fn(),
}));

vi.mock('nodemailer', () => ({
  default: { createTransport: mocks.createTransport },
}));

const originalEnv = {
  NODE_ENV: process.env.NODE_ENV,
  SMTP_URL: process.env.SMTP_URL,
  MAIL_FROM: process.env.MAIL_FROM,
  APP_BASE_URL: process.env.APP_BASE_URL,
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NODE_ENV = 'test';
  process.env.SMTP_URL = 'smtps://smtp.example.test:465';
  process.env.MAIL_FROM = 'KontentOS <studio@example.test>';
  process.env.APP_BASE_URL = 'https://studio.example.test';
  mocks.sendMail.mockResolvedValue({ messageId: 'synthetic-message' });
  mocks.createTransport.mockReturnValue({
    sendMail: mocks.sendMail,
    close: mocks.close,
  });
});

afterEach(() => {
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
