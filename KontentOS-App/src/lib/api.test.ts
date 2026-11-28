// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from './api';

describe('password recovery API', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts the reset request without exposing extra account data', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: true,
      message: 'If an account matches that email, a reset link has been requested.',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await api.requestPasswordReset('creator@example.test');

    expect(result.message).toMatch(/if an account matches/i);
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'creator@example.test' }),
    });
  });

  it('posts the single-use token and new password', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: true,
      message: 'Password updated. Sign in with your new password.',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    await api.resetPassword('opaque-reset-token', 'a-new-creator-passphrase');

    expect(fetchMock).toHaveBeenCalledWith('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'opaque-reset-token', password: 'a-new-creator-passphrase' }),
    });
  });

  it('surfaces an invalid or reused reset token', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: 'This reset link is invalid, expired, or already used.',
    }), { status: 400, headers: { 'Content-Type': 'application/json' } })));

    await expect(api.resetPassword('used-token', 'a-new-creator-passphrase'))
      .rejects.toThrow(/invalid, expired, or already used/i);
  });
});
