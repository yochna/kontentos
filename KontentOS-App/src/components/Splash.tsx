import { useEffect, useState } from 'react';
import { Icon } from '@/lib/icons';

const TAGLINE = 'Raw in. Scheduled out.';
// The intro is a greeting, not a loading gate. Its old 3.7s hold was the largest single slice of
// "takes a long time to load"; keep the flourish but let the bench arrive in a little over two.
const HOLD_MS = 2200;

export function Splash({ onDone }: { onDone: () => void }) {
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const total = reduce ? 350 : HOLD_MS;
    const leave = setTimeout(() => setLeaving(true), total - 620);
    const end = setTimeout(onDone, total);
    return () => {
      clearTimeout(leave);
      clearTimeout(end);
    };
  }, [onDone]);

  const skip = () => {
    setLeaving(true);
    setTimeout(onDone, 480);
  };

  // Sparkle particles flung from the wand, each on its own vector.
  const sparks = Array.from({ length: 10 }, (_, i) => {
    const angle = (i / 10) * Math.PI * 2;
    const dist = 60 + ((i * 37) % 70);
    return { dx: Math.cos(angle) * dist, dy: Math.sin(angle) * dist - 10, delay: 650 + i * 55 };
  });

  return (
    <div className={`kt-splash ${leaving ? 'is-leaving' : ''}`} role="status" aria-label="Loading KontentOS">
      <div className="kt-splash-inner">
        <div style={{ position: 'relative', display: 'inline-block' }}>
          <div className="kt-splash-mark">
            Kontent<b>OS</b>
          </div>
          <span className="kt-splash-shine" />
        </div>

        <div className="kt-splash-tag" aria-hidden="true">
          {TAGLINE.split(' ').map((word, wi) => (
            <span key={wi} style={{ display: 'inline-block', whiteSpace: 'pre' }}>
              {word.split('').map((ch, ci) => {
                const globalIndex = TAGLINE.slice(0, TAGLINE.lastIndexOf(word)).length + ci;
                return (
                  <span
                    key={ci}
                    className="ltr"
                    style={{ animationDelay: `${850 + globalIndex * 20}ms` }}
                  >
                    {ch}
                  </span>
                );
              })}
              {wi < TAGLINE.split(' ').length - 1 ? ' ' : ''}
            </span>
          ))}
        </div>

        <Icon name="auto_fix_high" size={40} className="kt-splash-wand" />
        {sparks.map((s, i) => (
          <span
            key={i}
            className="kt-splash-spark"
            style={
              {
                animationDelay: `${s.delay}ms`,
                ['--dx' as string]: `${s.dx}px`,
                ['--dy' as string]: `${s.dy}px`,
              } as React.CSSProperties
            }
          />
        ))}
      </div>

      <button className="kt-splash-skip" onClick={skip}>
        Skip intro
      </button>
    </div>
  );
}
