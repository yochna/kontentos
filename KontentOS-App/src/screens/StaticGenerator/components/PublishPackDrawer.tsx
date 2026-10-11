import React, { useState, useMemo } from 'react';
import { Icon } from '@/lib/icons';
import { Button, Card, Eyebrow, IconButton, Badge } from '@/components/ui';
import { StaticCardState } from '../../../types/staticCard';
import { generateAccessibleAltText } from '../utils/altTextGenerator';

interface PublishPackDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  state: StaticCardState;
  onOpenPublishToCalendar?: () => void;
}

type TabKey = 'all' | 'copy' | 'caption' | 'alt-text';

export const PublishPackDrawer: React.FC<PublishPackDrawerProps> = ({
  isOpen,
  onClose,
  state,
  onOpenPublishToCalendar,
}) => {
  const [activeTab, setActiveTab] = useState<TabKey>('all');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

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

  // Extract hashtags from social caption or generate fallback contextual hashtags
  const hashtags = useMemo(() => {
    const matched = captionText.match(/#[A-Za-z0-9_\u0590-\u05ff]+/g);
    if (matched && matched.length > 0) {
      return Array.from(new Set(matched));
    }
    const topicKeywords = cleanHeadline
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, '')
      .split(/\s+/)
      .filter((w) => w.length > 3)
      .slice(0, 3);
    return ['#kontentos', '#visualstory', ...topicKeywords.map((k) => `#${k}`)];
  }, [captionText, cleanHeadline]);

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
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm transition-opacity animate-in fade-in duration-200"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="publish-pack-title"
    >
      <div
        className="w-full sm:max-w-xl h-full bg-surface border-l border-line flex flex-col shadow-2xl overflow-hidden animate-in slide-in-from-right duration-250"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drawer Header */}
        <div className="p-5 border-b border-line bg-surface/90 backdrop-blur-md flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary-soft flex items-center justify-center text-primary border border-primary/20">
              <Icon name="inventory_2" size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 id="publish-pack-title" className="text-base font-bold text-ink">
                  Publish Pack
                </h2>
                <Badge tone="primary">Ready to Post</Badge>
              </div>
              <p className="text-xs text-ink-muted">
                1-click text copying for social schedulers & captions
              </p>
            </div>
          </div>
          <IconButton name="close" label="Close drawer" onClick={onClose} />
        </div>

        {/* Master Actions Button Bar */}
        <div className="p-4 bg-app/80 border-b border-line shrink-0 space-y-2">
          {onOpenPublishToCalendar && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenPublishToCalendar();
              }}
              className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-primary text-on-primary font-semibold hover:bg-primary-hover shadow-md transition-all cursor-pointer group"
            >
              <div className="flex items-center gap-2.5">
                <Icon name="calendar_month" size={20} />
                <span className="text-sm">
                  Export to Calendar
                </span>
              </div>
              <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full font-sans">
                {state.format === 'carousel-slide' ? `${state.slides?.length || 5} Drops` : 'Instant Drop'}
              </span>
            </button>
          )}

          <button
            type="button"
            onClick={() => handleCopy(completePost, 'master')}
            className={`w-full flex items-center justify-between px-4 py-2.5 rounded-xl border text-ink font-semibold hover:bg-surface-2 transition-all cursor-pointer group ${
              onOpenPublishToCalendar ? 'bg-surface border-line' : 'bg-primary text-on-primary hover:bg-primary-hover shadow-md'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Icon name={copiedKey === 'master' ? 'check_circle' : 'content_copy'} size={18} />
              <span className="text-sm">
                {copiedKey === 'master' ? '✓ Complete Post Copied to Clipboard!' : 'Copy All as Complete Post'}
              </span>
            </div>
            <span className="text-xs bg-ink/10 dark:bg-white/10 px-2 py-0.5 rounded-full font-mono">
              {completePost.length} chars
            </span>
          </button>
        </div>

        {/* Tab Filter Navigation */}
        <div className="flex items-center gap-1.5 px-5 py-2.5 border-b border-line bg-surface shrink-0 overflow-x-auto">
          {[
            { id: 'all', label: 'All Cards', icon: 'dashboard' },
            { id: 'copy', label: 'Hook & Body', icon: 'title' },
            { id: 'caption', label: 'Caption & Tags', icon: 'chat' },
            { id: 'alt-text', label: 'Accessibility Alt-Text', icon: 'visibility' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as TabKey)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                activeTab === tab.id
                  ? 'bg-primary-soft text-primary border border-primary/30'
                  : 'text-ink-muted hover:text-ink hover:bg-surface-2'
              }`}
            >
              <Icon name={tab.icon} size={15} />
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Scrollable Asset Cards Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* 1. Headline Hook Card */}
          {(activeTab === 'all' || activeTab === 'copy') && (
            <Card className="p-4 bg-surface hover:border-ink-muted/30 transition-all">
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-line">
                <div className="flex items-center gap-2">
                  <Eyebrow>1. Headline Hook</Eyebrow>
                  <span className="text-[11px] text-ink-muted">
                    {cleanHeadline.split(/\s+/).filter(Boolean).length} words
                  </span>
                </div>
                <Button
                  size="sm"
                  variant={copiedKey === 'headline' ? 'soft' : 'secondary'}
                  icon={copiedKey === 'headline' ? 'check' : 'content_copy'}
                  onClick={() => handleCopy(cleanHeadline, 'headline')}
                  className={copiedKey === 'headline' ? 'text-emerald-500 border-emerald-500/40' : ''}
                >
                  {copiedKey === 'headline' ? 'Copied' : 'Copy'}
                </Button>
              </div>
              <p className="text-sm font-semibold text-ink leading-relaxed select-text bg-app/50 p-2.5 rounded-lg border border-line/60">
                {cleanHeadline || <span className="text-ink-muted italic">No headline entered</span>}
              </p>
            </Card>
          )}

          {/* 2. Body Takeaway Card */}
          {(activeTab === 'all' || activeTab === 'copy') && (
            <Card className="p-4 bg-surface hover:border-ink-muted/30 transition-all">
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-line">
                <div className="flex items-center gap-2">
                  <Eyebrow>2. Body Takeaway</Eyebrow>
                  <span className="text-[11px] text-ink-muted">
                    {cleanBody.split(/\s+/).filter(Boolean).length} words
                  </span>
                </div>
                <Button
                  size="sm"
                  variant={copiedKey === 'body' ? 'soft' : 'secondary'}
                  icon={copiedKey === 'body' ? 'check' : 'content_copy'}
                  onClick={() => handleCopy(cleanBody, 'body')}
                  className={copiedKey === 'body' ? 'text-emerald-500 border-emerald-500/40' : ''}
                >
                  {copiedKey === 'body' ? 'Copied' : 'Copy'}
                </Button>
              </div>
              <p className="text-xs text-ink leading-relaxed select-text bg-app/50 p-2.5 rounded-lg border border-line/60 whitespace-pre-line">
                {cleanBody || <span className="text-ink-muted italic">No body text entered</span>}
              </p>
            </Card>
          )}

          {/* 3. Full Social Caption Card */}
          {(activeTab === 'all' || activeTab === 'caption') && (
            <Card className="p-4 bg-surface hover:border-ink-muted/30 transition-all">
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-line">
                <div className="flex items-center gap-2">
                  <Eyebrow>3. Full Social Caption</Eyebrow>
                  <span className="text-[11px] text-ink-muted font-mono">
                    {captionText.length} chars
                  </span>
                </div>
                <Button
                  size="sm"
                  variant={copiedKey === 'caption' ? 'soft' : 'secondary'}
                  icon={copiedKey === 'caption' ? 'check' : 'content_copy'}
                  onClick={() => handleCopy(captionText, 'caption')}
                  className={copiedKey === 'caption' ? 'text-emerald-500 border-emerald-500/40' : ''}
                >
                  {copiedKey === 'caption' ? 'Copied' : 'Copy'}
                </Button>
              </div>
              <p className="text-xs text-ink leading-relaxed select-text bg-app/50 p-2.5 rounded-lg border border-line/60 whitespace-pre-line max-h-48 overflow-y-auto">
                {captionText || (
                  <span className="text-ink-muted italic">
                    No social caption entered. Generate one with AI or type in the studio editor.
                  </span>
                )}
              </p>
            </Card>
          )}

          {/* 4. Extracted Hashtags Card */}
          {(activeTab === 'all' || activeTab === 'caption') && (
            <Card className="p-4 bg-surface hover:border-ink-muted/30 transition-all">
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-line">
                <div className="flex items-center gap-2">
                  <Eyebrow>4. Extracted Hashtags</Eyebrow>
                  <span className="text-[11px] text-ink-muted">
                    {hashtags.length} tags
                  </span>
                </div>
                <Button
                  size="sm"
                  variant={copiedKey === 'hashtags' ? 'soft' : 'secondary'}
                  icon={copiedKey === 'hashtags' ? 'check' : 'content_copy'}
                  onClick={() => handleCopy(hashtagsString, 'hashtags')}
                  className={copiedKey === 'hashtags' ? 'text-emerald-500 border-emerald-500/40' : ''}
                >
                  {copiedKey === 'hashtags' ? 'Copied All' : 'Copy All'}
                </Button>
              </div>
              <div className="flex flex-wrap gap-1.5 p-2.5 bg-app/50 rounded-lg border border-line/60">
                {hashtags.map((tag, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleCopy(tag, `tag-${idx}`)}
                    className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md bg-surface border border-line hover:border-primary/50 text-primary font-mono transition-colors cursor-pointer"
                    title="Click to copy single hashtag"
                  >
                    <span>{tag}</span>
                    {copiedKey === `tag-${idx}` && (
                      <Icon name="check" size={12} className="text-emerald-500" />
                    )}
                  </button>
                ))}
              </div>
            </Card>
          )}

          {/* 5. Automated Accessibility Alt-Text Card (Task 1.4.2) */}
          {(activeTab === 'all' || activeTab === 'alt-text') && (
            <Card className="p-4 bg-surface hover:border-ink-muted/30 transition-all">
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-line">
                <div className="flex items-center gap-2">
                  <Eyebrow>5. Accessible Alt-Text</Eyebrow>
                  <span className="text-[11px] text-ink-muted font-mono">{altText.length} chars</span>
                  <Badge tone="neutral">Screen Readers & SEO</Badge>
                </div>
                <Button
                  size="sm"
                  variant={copiedKey === 'alt' ? 'soft' : 'secondary'}
                  icon={copiedKey === 'alt' ? 'check' : 'content_copy'}
                  onClick={() => handleCopy(altText, 'alt')}
                  className={copiedKey === 'alt' ? 'text-emerald-500 border-emerald-500/40' : ''}
                >
                  {copiedKey === 'alt' ? 'Copied' : 'Copy'}
                </Button>
              </div>
              <p className="text-xs text-ink leading-relaxed select-text bg-app/50 p-2.5 rounded-lg border border-line/60 italic">
                "{altText}"
              </p>
              <p className="text-[11px] text-ink-muted mt-2">
                Paste directly into Instagram or LinkedIn's <strong>"Add Alt Text"</strong> field before posting to maximize search accessibility and SEO indexing.
              </p>
            </Card>
          )}
        </div>

        {/* Drawer Footer */}
        <div className="p-4 border-t border-line bg-surface shrink-0 flex items-center justify-between">
          <span className="text-xs text-ink-muted">
            Format: <strong className="text-ink">{state.format}</strong> ({state.aspectRatio})
          </span>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </div>
  );
};
