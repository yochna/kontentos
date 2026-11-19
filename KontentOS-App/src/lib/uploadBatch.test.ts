import { describe, expect, it } from 'vitest';
import { planUploadBatch } from './uploadBatch';

const f = (name: string, size = 1024, lastModified = 1) => ({ name, size, lastModified });

describe('planUploadBatch', () => {
  it('keeps valid files in order and reports invalid ones by name', () => {
    const plan = planUploadBatch([f('a.mp4'), f('voice.mp3', 2048), f('b.mov')]);
    expect(plan.files.map((file) => file.name)).toEqual(['a.mp4', 'b.mov']);
    expect(plan.invalid[0]).toMatch(/voice\.mp3/);
  });

  it('drops exact repeats within the picker and against the bench', () => {
    const plan = planUploadBatch([f('a.mp4'), f('a.mp4'), f('b.mp4')], [f('b.mp4')]);
    expect(plan.files.map((file) => file.name)).toEqual(['a.mp4']);
    expect(plan.duplicates).toBe(2);
  });

  it('defers valid files past the three-session server cap', () => {
    const plan = planUploadBatch([f('1.mp4'), f('2.mp4'), f('3.mp4'), f('4.mp4')]);
    expect(plan.files).toHaveLength(3);
    expect(plan.deferred).toBe(1);
  });
});
