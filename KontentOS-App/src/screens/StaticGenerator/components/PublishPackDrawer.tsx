import React, { useState, useMemo } from 'react';
import { Icon } from '@/lib/icons';
import { Button, IconButton } from '@/components/ui';
import { notify } from '@/components/ui/toast';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { StaticCardState } from '../../../types/staticCard';
import { formatLabel } from './FormatTabs';
import { generateAccessibleAltText } from '../utils/altTextGenerator';

interface PublishPackDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  state: StaticCardState;
  onOpenPublishToCalendar?: () => void;
}

type TabKey = 'all' | 'copy' | 'caption' | 'alt-text';

const wordCount = (text: string) => text.split(/\s+/).filter(Boolean).length;

/** One block of the pack: a name, how big it is, the text, and the button that copies it. */
function PackCard({
  label,
  meta,
  text,
  emptyText,
  hint,
  copied,
  onCopy,
  scroll,
}: {
  label: string;
  meta: string;
  text: string;
  emptyText: string;
  hint?: string;
  copied: boolean;
  onCopy: () => void;
  scroll?: boolean;
}) {
  return (
    <section className="rounded-card border border-line bg-surface">
      <div className="flex items-center justify-between gap-3 border-b border-line px-3.5 py-2">
        <div className="flex min-w-0 items-baseline gap-2">
          <h3 className="text-[12.5px] font-semibold text-ink">{label}</h3>
          <span className="text-[11px] text-ink-dim">{meta}</span>
        </div>
        <Button
          size="sm"
          variant={copied ? 'soft' : 'ghost'}
          icon={copied ? 'check' : 'content_copy'}
          onClick={onCopy}
        >
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
      <div className="space-y-2 p-3.5">
        {text ? (
          <p
            className={`select-text whitespace-pre-line rounded-btn border border-line bg-app/50 p-2.5 text-[12.5px] leading-relaxed text-ink ${
              scroll ? 'max-h-48 overflow-y-auto' : ''
            }`}
          >
            {text}
          </p>
        ) : (
          <p className="rounded-btn border border-dashed border-line p-2.5 text-[12.5px] text-ink-dim">
            {emptyText}
          </p>
        )}
        {hint && <p className="text-[11px] text-ink-dim">{hint}</p>}
      </div>
    </section>
  );
}

export const PublishPackDrawer: React.FC<PublishPackDrawerProps> = ({
  isOpen,
  onClose,
  state,
  onOpenPublishToCalendar,
}) => {
  const [activeTab, setActiveTab] = useState<TabKey>('all');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const slideCount = state.slides?.length ?? 0;
  const isDeck = state.format === 'carousel-slide' && slideCount > 0;

  // Clean strings without accentuation brackets [bracket]
  const cleanHeadline = useMemo(
    () => (state.headline || '').replace(/\[([^\]]+)\]/g, '$1').trim(),
    [state.headline]
  );

  const cleanBody = useMemo(
    () => (state.supportingText || '').replace(/\[([^\]]+)\]/g, '$1').trim(),
    [state.supportingText]
  );

  const captionText = useMemo(() => (state.socialCaption || '').trim(), [state.socialCaption]);

  // Whatever tags the caption already carries, and nothing more — a made-up set of generic tags would
  // be published as the creator's own voice.
  const hashtags = useMemo(() => {
    const matched = captionText.match(/#[A-Za-z0-9_\u0590-\u05ff]+/g);
    return matched ? Array.from(new Set(matched)) : [];
  }, [captionText]);

  const hashtagsString = useMemo(() => hashtags.join(' '), [hashtags]);

  // Alt-Text synthesis for accessibility and social platform alt tags (Task 1.4.2)
  const altText = useMemo(() => generateAccessibleAltText(state), [state]);

  // Master complete post formatted for LinkedIn / Instagram / X
  const completePost = useMemo(() => {
    const parts: string[] = [];
    if (cleanHeadline) parts.push(cleanHeadline);
    if (cleanBody) parts.push(cleanBody);
    if (captionText) {
      parts.push(captionText);
    } else if (hashtags.length > 0) {
      parts.push(hashtagsString);
    }
    return parts.join('\n\n');
  }, [cleanHeadline, cleanBody, captionText, hashtags, hashtagsString]);

  const handleCopy = async (text: string, key: string) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => {
        setCopiedKey((curr) => (curr === key ? null : curr));
      }, 2000);
    } catch (err) {
      console.error('Failed to copy to clipboard', err);
      notify.bad('The browser blocked the clipboard. Select the text and copy it yourself.');
    }
  };

  if (!isOpen) return null;

  return (
    <Dialog open onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent placement="right" hideClose className="w-full sm:max-w-xl">
        {/* Drawer Header */}
        <div className="shrink-0 border-b border-line bg-surface/90 p-5 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <DialogTitle className="text-[15px] font-semibold text-ink">Publish pack</DialogTitle>
            <p className="mt-1 text-xs text-ink-muted">
              The words from this card, split into the blocks a scheduler asks for.
            </p>
          </div>
          <IconButton name="close" label="Close drawer" onClick={onClose} />
        </div>

        {/* Actions */}
        <div className="shrink-0 space-y-2 border-b border-line bg-app/80 p-4">
          {onOpenPublishToCalendar && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenPublishToCalendar();
              }}
              className="kt-focus flex w-full cursor-pointer items-center justify-between gap-3 rounded-btn bg-primary px-3.5 py-2.5 text-[13px] font-semibold text-on-primary transition-colors hover:bg-primary-hover"
            >
              <span className="flex items-center gap-2">
                <Icon name="calendar_month" size={17} />
                <span>Send to Calendar</span>
              </span>
              <span className="text-[11px] font-normal opacity-80">
                {isDeck ? `${slideCount} slides` : 'single card'}
              </span>
            </button>
          )}

          <button
            type="button"
            onClick={() => handleCopy(completePost, 'master')}
            className={`kt-focus flex w-full cursor-pointer items-center justify-between gap-3 rounded-btn border px-3.5 py-2.5 text-[13px] font-semibold transition-colors ${
              onOpenPublishToCalendar
                ? 'border-line bg-surface text-ink hover:border-line-strong'
                : 'border-primary bg-primary text-on-primary hover:bg-primary-hover'
            }`}
          >
            <span className="flex items-center gap-2">
              <Icon name={copiedKey === 'master' ? 'check' : 'content_copy'} size={17} />
              <span>{copiedKey === 'master' ? 'Copied the whole post' : 'Copy the whole post'}</span>
            </span>
            <span className="font-mono text-[11px] font-normal opacity-80">{completePost.length} chars</span>
          </button>
        </div>

        {/* Tab Filter Navigation — the asset cards below are many-to-many with the tabs ('all' reuses
            every card), so they stay driven by activeTab instead of TabsContent. */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabKey)} className="contents">
          <TabsList
            variant="pill"
            aria-label="Publish pack views"
            className="w-full shrink-0 gap-1.5 overflow-x-auto rounded-none border-b border-line bg-surface px-5 py-2.5"
          >
            {[
              { id: 'all', label: 'Everything', icon: 'dashboard' },
              { id: 'copy', label: 'Card text', icon: 'title' },
              { id: 'caption', label: 'Caption & tags', icon: 'chat_bubble_outline' },
              { id: 'alt-text', label: 'Alt text', icon: 'visibility' },
            ].map((tab) => (
              <TabsTrigger
                key={tab.id}
                variant="pill"
                value={tab.id}
                className="rounded-lg border border-transparent px-3 py-1.5 text-xs data-[state=inactive]:hover:bg-surface-2 data-[state=active]:border-primary/30 data-[state=active]:bg-primary-soft data-[state=active]:shadow-none data-[state=active]:text-primary"
              >
                <Icon name={tab.icon} size={15} />
                <span>{tab.label}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {/* Scrollable Asset Cards Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {(activeTab === 'all' || activeTab === 'copy') && (
            <PackCard
              label="Headline"
              meta={`${wordCount(cleanHeadline)} words`}
              text={cleanHeadline}
              emptyText="Nothing on this card yet — write it above."
              copied={copiedKey === 'headline'}
              onCopy={() => handleCopy(cleanHeadline, 'headline')}
            />
          )}

          {(activeTab === 'all' || activeTab === 'copy') && (
            <PackCard
              label="Body"
              meta={`${wordCount(cleanBody)} words`}
              text={cleanBody}
              emptyText="Nothing under the headline yet."
              copied={copiedKey === 'body'}
              onCopy={() => handleCopy(cleanBody, 'body')}
            />
          )}

          {(activeTab === 'all' || activeTab === 'caption') && (
            <PackCard
              label="Caption"
              meta={`${captionText.length} chars`}
              text={captionText}
              emptyText="Write supplies this. Nothing has written it for this card yet."
              copied={copiedKey === 'caption'}
              onCopy={() => handleCopy(captionText, 'caption')}
              scroll
            />
          )}

          {(activeTab === 'all' || activeTab === 'caption') && (
            <section className="rounded-card border border-line bg-surface">
              <div className="flex items-center justify-between gap-3 border-b border-line px-3.5 py-2">
                <div className="flex min-w-0 items-baseline gap-2">
                  <h3 className="text-[12.5px] font-semibold text-ink">Hashtags</h3>
                  <span className="text-[11px] text-ink-dim">
                    {hashtags.length > 0 ? `${hashtags.length} pulled from the caption` : 'none in the caption'}
                  </span>
                </div>
                <Button
                  size="sm"
                  variant={copiedKey === 'hashtags' ? 'soft' : 'ghost'}
                  icon={copiedKey === 'hashtags' ? 'check' : 'content_copy'}
                  onClick={() => handleCopy(hashtagsString, 'hashtags')}
                >
                  {copiedKey === 'hashtags' ? 'Copied' : 'Copy all'}
                </Button>
              </div>
              <div className="flex flex-wrap gap-1.5 p-3.5">
                {hashtags.length === 0 ? (
                  <p className="text-[12.5px] text-ink-dim">No # appears in the caption, so there is nothing here.</p>
                ) : (
                  hashtags.map((tag, idx) => {
                    const justCopied = copiedKey === `tag-${idx}`;
                    return (
                      <button
                        key={`${tag}-${idx}`}
                        type="button"
                        onClick={() => handleCopy(tag, `tag-${idx}`)}
                        title="Copy this tag"
                        className={`cursor-pointer rounded-full border px-2 py-0.5 font-mono text-[11px] transition-colors ${
                          justCopied
                            ? 'border-primary bg-primary-soft text-primary'
                            : 'border-line bg-app/50 text-ink-muted hover:border-line-strong hover:text-ink'
                        }`}
                      >
                        {tag}
                      </button>
                    );
                  })
                )}
              </div>
            </section>
          )}

          {(activeTab === 'all' || activeTab === 'alt-text') && (
            <PackCard
              label="Alt text"
              meta={altText ? `${altText.length} chars` : 'nothing to describe'}
              text={altText}
              emptyText="The card has no words yet, so there is nothing to describe."
              hint="Assembled from the words on this card and the photo credit — it cannot see the picture, so check it before you paste."
              copied={copiedKey === 'alt'}
              onCopy={() => handleCopy(altText, 'alt')}
            />
          )}
        </div>

        {/* Drawer Footer */}
        <div className="shrink-0 flex items-center justify-between gap-3 border-t border-line bg-surface p-4">
          <span className="text-[11px] text-ink-dim">
            {formatLabel(state.format)} · {state.aspectRatio}
          </span>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
