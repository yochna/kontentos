/**
 * Filter used by html-to-image so editor chrome never leaks into exports.
 */
export function cleanExportFilter(node: HTMLElement): boolean {
  if (!(node instanceof HTMLElement)) return true;
  if (node.dataset?.exportExclude === 'true') return false;
  if (node.dataset?.canvasUi === 'true') return false;
  return true;
}

export function waitForPaint() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

export function wait(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}
