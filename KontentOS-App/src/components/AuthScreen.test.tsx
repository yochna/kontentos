// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { AuthScreen } from './AuthScreen';
import { api } from '@/lib/api';
import type { User } from '@/lib/types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

let host: HTMLDivElement;
let root: Root;
let onSignedIn: Mock<(user: User) => void>;

beforeEach(() => {
  vi.restoreAllMocks();
  window.history.replaceState({}, '', '/');
  onSignedIn = vi.fn();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  window.history.replaceState({}, '', '/');
});

function render(path: string) {
  window.history.replaceState({}, '', path);
  act(() => root.render(<AuthScreen onSignedIn={onSignedIn} />));
}

function input(label: string): HTMLInputElement {
  const labelNode = Array.from(host.querySelectorAll('label'))
    .find((node) => node.textContent?.trim() === label);
  const field = Array.from(host.querySelectorAll('input'))
    .find((node) => node.id === labelNode?.htmlFor);
  if (!field) throw new Error(`Missing input: ${label}`);
  return field;
}

function type(field: HTMLInputElement, value: string) {
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(field, value);
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function button(label: string): HTMLButtonElement {
  const control = Array.from(host.querySelectorAll('button'))
    .find((node) => node.textContent?.includes(label));
  if (!control) throw new Error(`Missing button: ${label}`);
  return control;
}

async function click(control: HTMLButtonElement) {
  await act(async () => control.click());
}

describe('password recovery screen', () => {
  it('opens recovery and shows the generic request response', async () => {
    const request = vi.spyOn(api, 'requestPasswordReset').mockResolvedValue({
      message: 'If an account matches that email, a password reset link has been requested.',
    });
    render('/');

    await click(button('Forgot password?'));
    expect(window.location.pathname).toBe('/forgot-password');
    type(input('Email'), '  creator@example.test  ');
    await click(button('Send reset link'));

    expect(request).toHaveBeenCalledWith('creator@example.test');
    expect(host.querySelector('[role="status"]')?.textContent).toMatch(/if an account matches that email/i);
  });

  it('shows a truthful configuration error instead of a success notice', async () => {
    vi.spyOn(api, 'requestPasswordReset').mockRejectedValue(
      new Error('Password reset email is not configured on this server. Contact support.'),
    );
    render('/forgot-password');
    type(input('Email'), 'creator@example.test');
    await click(button('Send reset link'));

    expect(host.querySelector('[role="alert"]')?.textContent).toMatch(/not configured/i);
    expect(host.querySelector('[role="status"]')).toBeNull();
  });

  it('explains a missing reset token and offers a new request', async () => {
    render('/reset-password');
    expect(host.textContent).toMatch(/missing its token/i);

    await click(button('Request a new link'));
    expect(window.location.pathname).toBe('/forgot-password');
    expect(host.querySelector('.kt-dialog h2')?.textContent).toBe('Reset your password.');
  });

  it('keeps reset submission disabled until the passwords match and meet the minimum', () => {
    const reset = vi.spyOn(api, 'resetPassword');
    render(`/reset-password?token=${'a'.repeat(43)}`);

    type(input('New password'), 'short');
    type(input('Confirm new password'), 'short');
    expect(button('Update password').disabled).toBe(true);

    type(input('New password'), 'a-new-creator-passphrase');
    type(input('Confirm new password'), 'a-different-passphrase');
    expect(button('Update password').disabled).toBe(true);
    expect(reset).not.toHaveBeenCalled();
  });

  it('consumes the reset link, clears it from history, and does not sign in automatically', async () => {
    const token = 'a'.repeat(43);
    const password = 'a-new-creator-passphrase';
    const reset = vi.spyOn(api, 'resetPassword').mockResolvedValue({
      message: 'Password updated. Sign in with your new password.',
    });
    render(`/reset-password?token=${token}`);
    type(input('New password'), password);
    type(input('Confirm new password'), password);
    await click(button('Update password'));

    expect(reset).toHaveBeenCalledWith(token, password);
    expect(host.querySelector('.kt-dialog h2')?.textContent).toBe('Password updated.');
    expect(host.querySelector('[role="status"]')?.textContent).toMatch(/password updated/i);
    expect(window.location.pathname).toBe('/');
    expect(window.location.search).toBe('');
    expect(onSignedIn).not.toHaveBeenCalled();
  });

  it('shows an expired or reused token error without pretending the password changed', async () => {
    vi.spyOn(api, 'resetPassword').mockRejectedValue(
      new Error('This reset link is invalid, expired, or already used.'),
    );
    render(`/reset-password?token=${'b'.repeat(43)}`);
    type(input('New password'), 'a-new-creator-passphrase');
    type(input('Confirm new password'), 'a-new-creator-passphrase');
    await click(button('Update password'));

    expect(host.querySelector('[role="alert"]')?.textContent).toMatch(/invalid, expired, or already used/i);
    expect(host.querySelector('.kt-dialog h2')?.textContent).toBe('Choose a new password.');
    expect(input('New password')).not.toBeNull();
    expect(onSignedIn).not.toHaveBeenCalled();
  });
});
