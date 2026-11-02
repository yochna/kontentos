import { describe, expect, it } from 'vitest';
import { engineTimeout, readEngineJson } from './engine.js';

describe('engine JSON reader', () => {
  it('reads a clean array', () => {
    expect(readEngineJson('[{"a":1}]')).toEqual([{ a: 1 }]);
  });

  it('reads a fenced array the way a bare parse cannot', () => {
    expect(readEngineJson('```json\n[{"a":1}]\n```')).toEqual([{ a: 1 }]);
  });

  it('reads the answer an engine trails with prose', () => {
    const text = '[{"title":"Hook"}]\n\nThat is 6 ideas covering your brief.';
    expect(readEngineJson<any[]>(text)).toEqual([{ title: 'Hook' }]);
  });

  it('keeps brackets that live inside strings', () => {
    expect(readEngineJson<any>('{"hook":"Stop ] doing this [ now"}')).toEqual({
      hook: 'Stop ] doing this [ now',
    });
  });

  it('keeps escaped quotes inside strings', () => {
    expect(readEngineJson<any>('{"hook":"She said \\"run\\""}')).toEqual({ hook: 'She said "run"' });
  });

  it('returns null rather than throwing on an answer that is not JSON', () => {
    expect(readEngineJson('I could not generate ideas for that topic.')).toBeNull();
    expect(readEngineJson('[{"unclosed":1}')).toBeNull();
    expect(readEngineJson('')).toBeNull();
  });
});

describe('engine attempt ceiling', () => {
  it('passes through an answer that arrives in time', async () => {
    await expect(engineTimeout(Promise.resolve('ok'), 50, 'late')).resolves.toBe('ok');
  });

  it('rejects a hang instead of waiting on an engine that has stopped answering', async () => {
    const hangs = new Promise<string>((resolve) => setTimeout(() => resolve('eventually'), 500));
    await expect(engineTimeout(hangs, 10, 'Timeout with model test')).rejects.toThrow(
      'Timeout with model test'
    );
  });
});
