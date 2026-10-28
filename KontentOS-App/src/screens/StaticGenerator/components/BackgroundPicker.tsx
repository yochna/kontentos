import React, { useRef, useState } from 'react';
import { BACKGROUND_PRESETS } from '../../../data/staticCardPresets';
import { BackgroundPreset } from '../../../types/staticCard';
import { CURATED_STOCK_PHOTOS } from '../../../data/curatedStockPhotos';
import { Icon } from '@/lib/icons';
import { Button } from '@/components/ui';
import { useStore } from '@/lib/store';
import { getSafeImageUrl } from '@/lib/images';

interface Props {
  currentUrl: string;
  overlayDarkness: number;
  blurAmount: number;
  onSelectPreset: (preset: BackgroundPreset) => void;
  onCustomUpload: (dataUrl: string) => void;
  onSelectStockPhoto?: (photo: {
    url: string;
    proxyUrl: string;
    photographer: { name: string; username: string; profileUrl?: string };
  }) => void;
  onUpdateOverlay: (darkness: number) => void;
  onUpdateBlur: (blur: number) => void;
}

export const BackgroundPicker: React.FC<Props> = ({
  currentUrl,
  overlayDarkness,
  blurAmount,
  onSelectPreset,
  onCustomUpload,
  onSelectStockPhoto,
  onUpdateOverlay,
  onUpdateBlur,
}) => {
  const { videos } = useStore();
  const [activeTab, setActiveTab] = useState<'storage' | 'stock' | 'presets' | 'library'>('stock');
  const [isDragging, setIsDragging] = useState(false);
  const [customFileName, setCustomFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Stock Search state with instant pre-loaded curated photos
  const [stockQuery, setStockQuery] = useState('');
  const [stockResults, setStockResults] = useState<any[]>(CURATED_STOCK_PHOTOS);
  const [isLoadingStock, setIsLoadingStock] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [selectedPhotographer, setSelectedPhotographer] = useState<string | null>(null);

  const STOCK_CATEGORIES = [
    { label: 'All', query: '' },
    { label: 'Architecture', query: 'architecture' },
    { label: 'Moody Workspace', query: 'workspace' },
    { label: 'Abstract Neon', query: 'neon' },
    { label: 'Minimalist Nature', query: 'nature' },
    { label: 'Lifestyle', query: 'lifestyle' },
  ];

  const stockReqRef = useRef<AbortController | null>(null);

  const fetchStockPhotos = async (q: string) => {
    // Only the newest query may write results: overlapping searches otherwise race and the
    // slower response overwrites the term the creator just typed.
    stockReqRef.current?.abort();
    const ctrl = new AbortController();
    stockReqRef.current = ctrl;
    setIsLoadingStock(true);
    try {
      const res = await fetch(`/api/static-card/stock-search?query=${encodeURIComponent(q)}&perPage=18`, {
        signal: ctrl.signal,
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.photos) && data.photos.length > 0) {
        setStockResults(data.photos);
      } else {
        const qLower = q.toLowerCase().trim();
        const fallback = qLower
          ? CURATED_STOCK_PHOTOS.filter(
              (p) => p.description.toLowerCase().includes(qLower) || p.category.toLowerCase().includes(qLower)
            )
          : CURATED_STOCK_PHOTOS;
        setStockResults(fallback.length > 0 ? fallback : CURATED_STOCK_PHOTOS);
      }
    } catch (err) {
      if (ctrl.signal.aborted) return;
      console.warn('Failed to fetch stock photos from API, using curated collection:', err);
      const qLower = q.toLowerCase().trim();
      const fallback = qLower
        ? CURATED_STOCK_PHOTOS.filter(
            (p) => p.description.toLowerCase().includes(qLower) || p.category.toLowerCase().includes(qLower)
          )
        : CURATED_STOCK_PHOTOS;
      setStockResults(fallback.length > 0 ? fallback : CURATED_STOCK_PHOTOS);
    } finally {
      if (!ctrl.signal.aborted) setIsLoadingStock(false);
    }
  };

  // Initial fetch for curated stock collection on mount
  React.useEffect(() => {
    fetchStockPhotos('');
    return () => stockReqRef.current?.abort();
  }, []);

  const handleCategoryClick = (cat: { label: string; query: string }) => {
    setActiveCategory(cat.label);
    setStockQuery(cat.query);
    fetchStockPhotos(cat.query);
  };

  const handleStockSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setActiveCategory('Custom');
    fetchStockPhotos(stockQuery);
  };

  const handleSelectStock = (photo: any) => {
    // Route through universal proxy endpoint to guarantee zero CORS canvas tainting and COEP compliance
    const targetUrl = photo.url || photo.thumbUrl;
    const safeProxyUrl = getSafeImageUrl(targetUrl);
    setSelectedPhotographer(photo.photographer?.name || null);

    // Eagerly preload image in browser memory so card canvas preview updates with 0 latency
    try {
      const preloader = new Image();
      preloader.src = safeProxyUrl;
    } catch {}

    if (onSelectStockPhoto) {
      onSelectStockPhoto({
        url: targetUrl,
        proxyUrl: safeProxyUrl,
        photographer: photo.photographer,
      });
    } else {
      onCustomUpload(safeProxyUrl);
    }
  };

  const handleFile = (file: File) => {
    if (!file || !file.type.startsWith('image/')) return;
    setCustomFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      if (result) onCustomUpload(result);
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files?.[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  // Extract valid image thumbnails or assets from local studio storage
  const libraryAssets = videos
    .filter((v) => v.thumbnail_url || v.file_url)
    .map((v) => ({
      id: v.id,
      title: v.title,
      url: v.thumbnail_url || v.file_url,
    }));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-[13px] font-semibold text-ink flex items-center gap-1.5">
          <Icon name="image" size={16} className="text-primary" />
          <span>Background Photo & Atmosphere</span>
        </label>
        <div className="flex items-center gap-1 bg-surface-2 p-0.5 rounded-btn border border-line text-xs">
          <button
            type="button"
            onClick={() => setActiveTab('stock')}
            className={`px-2.5 py-1 rounded-md font-semibold transition-all cursor-pointer flex items-center gap-1 ${
              activeTab === 'stock'
                ? 'bg-primary text-on-primary shadow-sm'
                : 'text-ink-muted hover:text-ink'
            }`}
          >
            <Icon name="search" size={13} />
            <span>Search Stock</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('presets')}
            className={`px-2.5 py-1 rounded-md font-semibold transition-all cursor-pointer ${
              activeTab === 'presets'
                ? 'bg-primary text-on-primary shadow-sm'
                : 'text-ink-muted hover:text-ink'
            }`}
          >
            Presets
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('storage')}
            className={`px-2.5 py-1 rounded-md font-semibold transition-all cursor-pointer ${
              activeTab === 'storage'
                ? 'bg-primary text-on-primary shadow-sm'
                : 'text-ink-muted hover:text-ink'
            }`}
          >
            Upload
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('library')}
            className={`px-2.5 py-1 rounded-md font-semibold transition-all cursor-pointer ${
              activeTab === 'library'
                ? 'bg-primary text-on-primary shadow-sm'
                : 'text-ink-muted hover:text-ink'
            }`}
          >
            Studio Media
          </button>
        </div>
      </div>

      {/* Tab 0: In-App Stock Photography Search (Task 2.2.2) */}
      {activeTab === 'stock' && (
        <div className="space-y-3">
          {/* Search Input Form */}
          <form onSubmit={handleStockSearchSubmit} className="flex gap-1.5">
            <div className="relative flex-1">
              <Icon
                name="search"
                size={16}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-dim"
              />
              <input
                type="text"
                value={stockQuery}
                onChange={(e) => setStockQuery(e.target.value)}
                placeholder="Search stock atmosphere (e.g. moody, neon, office)..."
                className="w-full bg-surface-2 border border-line rounded-btn pl-8 pr-7 py-1.5 text-xs text-ink placeholder:text-ink-dim focus:outline-none focus:border-primary"
              />
              {stockQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setStockQuery('');
                    setActiveCategory('All');
                    fetchStockPhotos('');
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-dim hover:text-ink"
                  title="Clear search"
                >
                  <Icon name="close" size={14} />
                </button>
              )}
            </div>
            <Button
              type="submit"
              size="sm"
              variant="primary"
              disabled={isLoadingStock}
            >
              Search
            </Button>
          </form>

          {/* Popular Category Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar text-xs">
            {STOCK_CATEGORIES.map((cat) => (
              <button
                key={cat.label}
                type="button"
                onClick={() => handleCategoryClick(cat)}
                className={`px-2.5 py-1 rounded-full text-[11px] font-medium whitespace-nowrap transition-all cursor-pointer ${
                  activeCategory === cat.label
                    ? 'bg-primary text-on-primary font-semibold shadow-xs'
                    : 'bg-surface-2 text-ink-muted hover:text-ink hover:bg-surface-3 border border-line'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Responsive Thumbnail Grid */}
          {isLoadingStock ? (
            <div className="py-12 flex flex-col items-center justify-center gap-2 text-ink-muted text-xs bg-surface-2/40 rounded-card border border-line/60">
              <Icon name="progress_activity" size={22} className="animate-spin text-primary" />
              <span>Fetching curated high-resolution atmosphere...</span>
            </div>
          ) : stockResults.length === 0 ? (
            <div className="p-6 rounded-card bg-surface-2/40 border border-line text-center text-xs text-ink-muted">
              <Icon name="image_not_supported" size={24} className="mx-auto mb-1.5 text-ink-dim opacity-70" />
              <p className="font-semibold text-ink">No photos found</p>
              <p className="text-[11px] mt-0.5">Try a different query or select a popular category above.</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2 max-h-56 overflow-y-auto pr-1">
              {stockResults.map((photo) => {
                const targetUrl = photo.url || photo.thumbUrl;
                const safeProxy = getSafeImageUrl(targetUrl);
                const isSelected =
                  currentUrl === photo.proxyUrl ||
                  currentUrl === photo.url ||
                  currentUrl === safeProxy ||
                  (currentUrl && targetUrl && currentUrl.includes(encodeURIComponent(targetUrl)));
                const thumbSrc = photo.thumbUrl || photo.previewUrl || photo.url;

                return (
                  <button
                    key={photo.id}
                    type="button"
                    onClick={() => handleSelectStock(photo)}
                    className={`relative aspect-square rounded-btn overflow-hidden border transition-all cursor-pointer group text-left bg-surface-2 ${
                      isSelected
                        ? 'ring-2 ring-primary border-primary shadow-md'
                        : 'border-line hover:border-line-strong hover:shadow-sm'
                    }`}
                    title={photo.description ? `${photo.description} (by ${photo.photographer?.name})` : `Photo by ${photo.photographer?.name}`}
                  >
                    <img
                      src={thumbSrc}
                      alt={photo.description || `Photo by ${photo.photographer?.name}`}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                      loading="lazy"
                      onError={(e) => {
                        const target = e.currentTarget;
                        if (photo.url && target.src !== photo.url) {
                          target.src = photo.url;
                        }
                      }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent opacity-80 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-1.5 pointer-events-none">
                      <span className="text-[10px] text-white/90 font-medium truncate leading-tight flex items-center gap-1">
                        <Icon name="photo_camera" size={11} className="shrink-0 opacity-75" />
                        <span className="truncate">{photo.photographer?.name}</span>
                      </span>
                    </div>
                    {isSelected && (
                      <div className="absolute top-1 right-1 w-4 h-4 rounded-full bg-primary text-on-primary flex items-center justify-center shadow z-10">
                        <Icon name="check" size={12} />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Zero CORS & Attribution compliance indicator */}
          <div className="flex items-center justify-between text-[11px] text-ink-muted px-0.5 pt-0.5 border-t border-line/60">
            <span className="flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
              <Icon name="shield" size={12} />
              <span>Zero CORS canvas-safe</span>
            </span>
            {selectedPhotographer && (
              <span className="text-[10px] text-ink-dim truncate max-w-[200px]">
                Photo by <strong className="text-ink font-medium">{selectedPhotographer}</strong>
              </span>
            )}
          </div>
        </div>
      )}

      {/* Tab 1: Storage / Local Device Upload */}
      {activeTab === 'storage' && (
        <div className="space-y-2.5">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`w-full py-5 px-4 rounded-card border-2 border-dashed transition-all cursor-pointer flex flex-col items-center justify-center text-center ${
              isDragging
                ? 'border-primary bg-primary-soft'
                : 'border-line bg-surface hover:bg-surface-2 hover:border-line-strong'
            }`}
          >
            <div className="w-10 h-10 rounded-full bg-primary-soft flex items-center justify-center text-primary mb-2">
              <Icon name="folder_open" size={22} />
            </div>
            <div className="text-xs font-semibold text-ink">
              Choose background from your computer / storage
            </div>
            <p className="text-[11px] text-ink-muted mt-0.5">
              Click to browse file explorer or drag and drop any PNG, JPG, or WEBP image
            </p>
            {customFileName && (
              <div className="mt-2.5 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface-2 border border-line text-[11px] text-ink font-mono font-medium">
                <Icon name="check_circle" size={14} className="text-primary" />
                <span>{customFileName}</span>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between">
            <Button
              variant="secondary"
              size="sm"
              icon="drive_folder_upload"
              onClick={() => fileInputRef.current?.click()}
              className="w-full justify-center"
            >
              Select Image from Device Storage
            </Button>
          </div>
        </div>
      )}

      {/* Tab 2: Studio Library Media */}
      {activeTab === 'library' && (
        <div className="space-y-2">
          {libraryAssets.length === 0 ? (
            <div className="p-4 rounded-card bg-surface-2/60 border border-line text-center text-xs text-ink-muted">
              <Icon name="perm_media" size={24} className="mx-auto mb-1 text-ink-dim opacity-60" />
              <span>No uploaded studio assets found yet. Upload a photo from device storage or pick a preset!</span>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2 max-h-48 overflow-y-auto pr-1">
              {libraryAssets.map((asset) => {
                const isSelected = currentUrl === asset.url;
                return (
                  <button
                    key={asset.id}
                    type="button"
                    onClick={() => onCustomUpload(asset.url)}
                    className={`relative aspect-video rounded-btn overflow-hidden border transition-all cursor-pointer group ${
                      isSelected
                        ? 'ring-2 ring-primary border-primary shadow-md'
                        : 'border-line hover:border-line-strong'
                    }`}
                  >
                    <img src={asset.url} alt={asset.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex items-end p-1">
                      <span className="text-[10px] text-white font-medium truncate leading-tight">
                        {asset.title}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Preset Grid */}
      {activeTab === 'presets' && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {BACKGROUND_PRESETS.map((preset) => {
            const isSelected =
              currentUrl === preset.url ||
              (preset.url && currentUrl === getSafeImageUrl(preset.url)) ||
              (preset.url && currentUrl.includes(encodeURIComponent(preset.url)));
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => onSelectPreset(preset)}
                className={`relative aspect-[16/10] rounded-btn border text-left transition-all cursor-pointer overflow-hidden group bg-surface-2 ${
                  isSelected
                    ? 'ring-2 ring-primary border-primary shadow-md'
                    : 'border-line hover:border-line-strong hover:shadow-sm'
                }`}
                title={`${preset.name} - ${preset.subtitle}`}
              >
                {preset.url ? (
                  <img
                    src={preset.thumbUrl || preset.url}
                    alt={preset.name}
                    className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                    loading="lazy"
                    onError={(e) => {
                      const target = e.currentTarget;
                      if (preset.url && target.src !== preset.url) {
                        target.src = preset.url;
                      }
                    }}
                  />
                ) : (
                  <div
                    className="absolute inset-0"
                    style={{ background: preset.gradientFallback || 'linear-gradient(145deg, #111827 0%, #030712 100%)' }}
                  />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent flex flex-col justify-end p-2 z-10 pointer-events-none">
                  <span className="text-xs font-semibold leading-tight text-white drop-shadow-sm">{preset.name}</span>
                  <span className={`text-[10px] leading-tight ${isSelected ? 'text-primary-light font-medium' : 'text-white/70'}`}>
                    {preset.subtitle}
                  </span>
                </div>
                {isSelected && (
                  <div className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-primary text-on-primary flex items-center justify-center shadow z-20">
                    <Icon name="check" size={12} />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Sliders: Dimming & Blur */}
      <div className="pt-1 grid grid-cols-2 gap-3 bg-surface-2/60 p-3 rounded-card border border-line">
        <div className="space-y-1">
          <div className="flex justify-between text-[11px] text-ink-muted">
            <span>Dim Overlay</span>
            <span className="font-mono text-ink font-semibold">{Math.round(overlayDarkness * 100)}%</span>
          </div>
          <input
            type="range"
            min="0.1"
            max="0.9"
            step="0.05"
            value={overlayDarkness}
            onChange={(e) => onUpdateOverlay(parseFloat(e.target.value))}
            className="w-full accent-primary h-1.5 bg-surface-3 rounded-lg cursor-pointer"
          />
        </div>

        <div className="space-y-1">
          <div className="flex justify-between text-[11px] text-ink-muted">
            <span>Atmospheric Blur</span>
            <span className="font-mono text-ink font-semibold">{blurAmount}px</span>
          </div>
          <input
            type="range"
            min="0"
            max="16"
            step="1"
            value={blurAmount}
            onChange={(e) => onUpdateBlur(parseInt(e.target.value, 10))}
            className="w-full accent-primary h-1.5 bg-surface-3 rounded-lg cursor-pointer"
          />
        </div>
      </div>
    </div>
  );
};
