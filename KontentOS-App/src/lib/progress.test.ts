import { describe, expect, it } from 'vitest';
import { mergeStageProgress, type StageProgress } from './progress';

const ORDER = ['reading', 'preparing', 'encoding', 'finalizing', 'done'] as const;
type Stage = (typeof ORDER)[number];
const at = (stage: Stage, fraction: number | null, message: string = stage): StageProgress<Stage> => ({
  stage,
  fraction,
  message,
});

describe('mergeStageProgress', () => {
  it('keeps the furthest stage when a late event reports an earlier one', () => {
    expect(mergeStageProgress(at('encoding', 0.6, 'Rendering'), at('preparing', 0.99, 'Old queue'), ORDER)).toEqual(
      at('encoding', 0.99, 'Rendering')
    );
  });

  it('never lets the fraction walk backwards', () => {
    expect(mergeStageProgress(at('encoding', 0.72), at('encoding', 0.4), ORDER).fraction).toBe(0.72);
  });

  it('treats an unknown ratio as indeterminate without losing the last known number', () => {
    expect(mergeStageProgress(at('encoding', 0.55), at('encoding', null, 'Waiting'), ORDER)).toEqual(
      at('encoding', 0.55, 'Waiting')
    );
  });

  it('lets a done event finish the bar', () => {
    expect(mergeStageProgress(at('finalizing', 0.95), at('done', 1, 'Render finished'), ORDER)).toEqual(
      at('done', 1, 'Render finished')
    );
  });
});
