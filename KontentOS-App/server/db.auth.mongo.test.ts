import mongoose from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => {
  const generic = { syncIndexes: vi.fn(async () => undefined) };
  const user = {
    ...generic,
    findOne: vi.fn(),
    updateOne: vi.fn(),
  };
  const session = {
    ...generic,
    findOne: vi.fn(),
    findOneAndUpdate: vi.fn(),
    deleteMany: vi.fn(),
  };
  const passwordReset = {
    ...generic,
    findOneAndUpdate: vi.fn(),
    findOneAndDelete: vi.fn(),
    deleteMany: vi.fn(),
  };
  const models: Record<string, unknown> = { User: user, Session: session, PasswordReset: passwordReset };
  const connection = {
    asPromise: vi.fn(async () => undefined),
    model: vi.fn((name: string) => models[name] || generic),
    close: vi.fn(async () => undefined),
  };
  return { connection, user, session, passwordReset };
});

let db: typeof import('./db.js');

beforeAll(async () => {
  process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/kontentos_auth_mongo_test';
  vi.spyOn(mongoose, 'createConnection').mockReturnValue(fake.connection as any);
  db = await import('./db.js');
  await db.initDatabase();
});

beforeEach(() => {
  vi.clearAllMocks();
});

afterAll(() => {
  vi.restoreAllMocks();
  process.env.MONGODB_URI = '';
});

describe('Mongo authentication writes', () => {
  it('returns the inserted reset row on a first upsert', async () => {
    fake.passwordReset.findOneAndUpdate.mockImplementation(async (_filter, update, options) => (
      options?.new ? update.$set : null
    ));
    const now = new Date('2026-11-28T12:00:00.000Z');

    expect(await db.createPasswordReset('token-hash', 'user_1', 1800, now)).toBe(true);
    expect(fake.passwordReset.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'user_1' }),
      { $set: expect.objectContaining({ id: 'token-hash', user_id: 'user_1' }) },
      { upsert: true, new: true },
    );
  });

  it('revokes reset links before changing the password and then removes sessions', async () => {
    fake.passwordReset.deleteMany.mockResolvedValue({ deletedCount: 1 });
    fake.user.updateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });
    fake.session.deleteMany.mockResolvedValue({ deletedCount: 2 });

    expect(await db.changePasswordAndRevokeSessions('user_1', 'new-password-hash')).toBe(true);
    expect(fake.passwordReset.deleteMany).toHaveBeenCalledWith({ user_id: 'user_1' });
    expect(fake.user.updateOne).toHaveBeenCalledWith(
      { id: 'user_1' },
      { $set: { password_hash: 'new-password-hash', session_epoch: expect.any(String) } },
    );
    expect(fake.session.deleteMany).toHaveBeenCalledWith({ user_id: 'user_1' });
    expect(fake.passwordReset.deleteMany.mock.invocationCallOrder[0]).toBeLessThan(
      fake.user.updateOne.mock.invocationCallOrder[0],
    );
  });

  it('does not change the password when reset-link revocation fails', async () => {
    fake.passwordReset.deleteMany.mockRejectedValue(new Error('Mongo unavailable'));

    await expect(db.changePasswordAndRevokeSessions('user_1', 'new-password-hash')).rejects.toThrow('Mongo unavailable');
    expect(fake.user.updateOne).not.toHaveBeenCalled();
  });
});
