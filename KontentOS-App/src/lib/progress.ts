/**
 * Stage progress that never walks backwards.
 *
 * FFmpeg reports progress against the source clock, while a timeline export changes the clock with
 * cuts and gaps. A numeric update can therefore arrive out of order. The UI keeps the furthest
 * stage and fraction it has honestly reached, so a late "complete" event cannot send the bar back
 * to "preparing".
 */
export interface StageProgress<S extends string = string> {
  stage: S;
  /** 0..1 when known, null while the engine has not reported a ratio. */
  fraction: number | null;
  message: string;
}

function rank<S extends string>(stage: S, order: readonly S[]): number {
  const index = order.indexOf(stage);
  return index < 0 ? 0 : index;
}

export function mergeStageProgress<S extends string>(
  previous: StageProgress<S>,
  next: StageProgress<S>,
  order: readonly S[]
): StageProgress<S> {
  const previousRank = rank(previous.stage, order);
  const nextRank = rank(next.stage, order);
  const advanced = nextRank >= previousRank;
  const fraction =
    next.fraction === null
      ? previous.fraction
      : Math.min(1, Math.max(previous.fraction ?? 0, next.fraction));

  return {
    stage: advanced ? next.stage : previous.stage,
    fraction,
    message: advanced ? next.message : previous.message,
  };
}
