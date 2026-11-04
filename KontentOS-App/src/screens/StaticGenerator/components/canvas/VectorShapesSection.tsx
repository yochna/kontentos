import React, { useMemo, useState } from 'react';
import { VECTOR_SHAPES, type VectorCategory } from '../../../../data/vectorShapesCatalog';
import type { CanvasCustomElement } from '../../../../types/canvasScene';
import { useCanvasInteraction } from '../../hooks/useCanvasInteraction';
import { CustomShapeRenderer } from './CustomShapeRenderer';
import { Tooltip } from '@/components/ui/tooltip';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

const TABS: Array<VectorCategory | 'All'> = ['All', 'Shapes', 'Vectors', 'Badges', 'Lines'];

export const VectorShapesSection: React.FC = () => {
  const [tab, setTab] = useState<VectorCategory | 'All'>('All');
  const addShape = useCanvasInteraction((s) => s.addShape);
  const setToast = useCanvasInteraction((s) => s.setToast);

  const shapes = useMemo(
    () => (tab === 'All' ? VECTOR_SHAPES : VECTOR_SHAPES.filter((shape) => shape.category === tab)),
    [tab]
  );

  return (
    <div className="space-y-2">
      {/* Category filter over one shared shape grid, so the grid stays driven by `tab` rather than TabsContent. */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as VectorCategory | 'All')}>
        <TabsList
          variant="pill"
          aria-label="Shape categories"
          className="w-full flex-wrap gap-1 rounded-none bg-transparent p-0"
        >
          {TABS.map((entry) => (
            <TabsTrigger
              key={entry}
              variant="pill"
              value={entry}
              className="rounded-md border border-transparent bg-white/5 px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-slate-400 data-[state=inactive]:text-slate-400 data-[state=inactive]:hover:bg-white/10 data-[state=inactive]:hover:text-slate-400 data-[state=active]:border-cyan-400/30 data-[state=active]:bg-cyan-500/20 data-[state=active]:shadow-none data-[state=active]:text-cyan-200"
            >
              {entry}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="grid grid-cols-3 gap-1.5 max-h-[230px] overflow-y-auto pr-0.5">
        {shapes.map((shape) => {
          const preview: CanvasCustomElement = {
            id: shape.id,
            kind: shape.kind,
            shapeType: shape.shapeType,
            fill: shape.fill,
            text: shape.text,
            color: '#ffffff',
            strokeWidth: 6,
            radius: 12,
          };
          const isLine = shape.category === 'Lines';
          return (
            <Tooltip content={shape.label}>
              <button
                key={shape.id}
                type="button"
                onClick={() => {
                  addShape(
                    {
                      shapeType: shape.shapeType,
                      kind: shape.kind,
                      fill: shape.fill,
                      defaultWidth: shape.defaultWidth,
                      defaultHeight: shape.defaultHeight,
                      text: shape.text,
                    },
                    undefined,
                    undefined
                  );
                  setToast(`${shape.label} added`);
                }}
                className="group aspect-square rounded-lg border border-white/10 bg-white/[0.035] hover:border-cyan-400/40 hover:bg-cyan-400/[0.07] p-1.5 flex items-center justify-center transition-colors"
              >
                <div className={`w-full ${isLine ? 'h-3' : 'h-full'} flex items-center justify-center`}>
                  <CustomShapeRenderer
                    element={preview}
                    width={44}
                    height={isLine ? 8 : 40}
                  />
                </div>
              </button>
            </Tooltip>
          );
        })}
      </div>
    </div>
  );
};

export default VectorShapesSection;
