// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { Progress } from './progress';
import { Slider } from './slider';

/**
 * Radix puts the slider semantics on the thumb, not the root, and it takes the accessible name from
 * the thumb too. None of that shows up in a screenshot, so it is pinned here. Mounting rather than
 * stringifying: aria-valuenow only exists once the thumb has registered itself in the collection.
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// jsdom ships no ResizeObserver, and Radix measures every thumb with one.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

function mount(node: React.ReactElement) {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() => root.render(node));
  return host;
}

describe('slider semantics', () => {
  const host = mount(
    <Slider
      value={48}
      min={16}
      max={160}
      step={4}
      onValueChange={() => {}}
      label="Timeline zoom"
      formatValue={(v) => `${v} pixels per second`}
    />,
  );

  it('names the thumb it puts the value on', () => {
    const thumb = host.querySelector('[role="slider"]');
    expect(thumb).not.toBeNull();
    expect(thumb!.getAttribute('aria-label')).toBe('Timeline zoom');
    expect(thumb!.getAttribute('aria-valuemin')).toBe('16');
    expect(thumb!.getAttribute('aria-valuenow')).toBe('48');
    expect(thumb!.getAttribute('aria-valuemax')).toBe('160');
    expect(thumb!.getAttribute('aria-valuetext')).toBe('48 pixels per second');
  });

  it('leaves no native range input behind', () => {
    expect(host.querySelector('input[type="range"]')).toBeNull();
  });
});

describe('progress semantics', () => {
  it('reports the bar as a progressbar with a name', () => {
    const host = mount(<Progress value={42} label="Upload" />);
    const bar = host.querySelector('[role="progressbar"]');
    expect(bar).not.toBeNull();
    expect(bar!.getAttribute('aria-valuenow')).toBe('42');
    expect(bar!.getAttribute('aria-label')).toBe('Upload');
  });
});
