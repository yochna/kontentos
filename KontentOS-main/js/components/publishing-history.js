// KontentOS — Publishing History Component (Feature #9)
import { api } from '../api.js';

export function openPublishingHistoryModal() {
  const existing = document.getElementById('kontentos-history-modal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'kontentos-history-modal';
  modal.style.cssText = `
    position: fixed; inset: 0; z-index: 9999;
    background: rgba(0, 0, 0, 0.85); backdrop-filter: blur(10px);
    display: flex; align-items: center; justify-content: center; padding: 1.5rem;
  `;

  modal.innerHTML = `
    <div class="card" style="width: 100%; max-width: 950px; max-height: 85vh; display: flex; flex-direction: column; background: var(--bg-surface-card); border: 1px solid var(--border-glass); border-radius: 16px; padding: 1.5rem; overflow: hidden; box-shadow: var(--shadow-lg);">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.25rem; border-bottom: 1px solid var(--border-subtle); padding-bottom: 0.75rem;">
        <div>
          <h2 style="font-size: 1.35rem; display: flex; align-items: center; gap: 8px;">
            <span>🚀</span> Instagram Reels Publishing History
          </h2>
          <p style="color: var(--text-muted); font-size: 0.85rem;">View published Reels, direct live Instagram URLs, captions, and distribution status.</p>
        </div>
        <button id="btn-close-history" class="btn btn-secondary" style="padding: 0.4rem 0.8rem; font-size: 0.85rem;">✕ Close</button>
      </div>

      <div id="history-list-container" style="flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 0.85rem; padding: 4px;">
        <div style="text-align: center; padding: 3rem; color: var(--text-muted);">
          Loading publishing history...
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  const closeBtn = modal.querySelector('#btn-close-history');
  closeBtn.addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove();
  });

  const listContainer = modal.querySelector('#history-list-container');

  async function loadHistory() {
    try {
      const records = await api.getPublishingHistory();
      if (!records || records.length === 0) {
        listContainer.innerHTML = `
          <div style="text-align: center; padding: 3.5rem 1rem; color: var(--text-muted);">
            <div style="font-size: 3rem; margin-bottom: 0.5rem;">📱</div>
            <div style="font-size: 1.1rem; font-weight: 700; color: var(--text-main);">No Published Reels Yet</div>
            <p style="font-size: 0.85rem; max-width: 400px; margin: 0.5rem auto 0 auto;">
              Upload a raw video in the studio, approve your AI-generated caption, and click "Publish to Instagram Reels" to see it logged here.
            </p>
          </div>
        `;
        return;
      }

      listContainer.innerHTML = records
        .map(
          (rec) => `
        <div class="card" style="background: var(--bg-surface-low); border: 1px solid var(--border-subtle); border-radius: 12px; padding: 1rem 1.25rem; display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; flex-wrap: wrap;">
          <div style="flex: 1; min-width: 280px;">
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 0.4rem;">
              <span class="badge badge-neon" style="font-size: 0.68rem;">📸 INSTAGRAM REEL</span>
              <span class="badge ${rec.status === 'published' ? 'badge-neon' : 'badge-purple'}" style="font-size: 0.68rem; text-transform: uppercase;">${rec.status}</span>
              <span style="font-size: 0.72rem; color: var(--text-dim);">${new Date(rec.published_at).toLocaleString()}</span>
            </div>
            <div style="font-weight: 700; font-size: 0.95rem; margin-bottom: 0.35rem; color: var(--accent-primary);">
              ${rec.video_title || 'Instagram Reel'}
            </div>
            <div style="font-size: 0.82rem; color: var(--text-main); white-space: pre-line; max-height: 80px; overflow-y: auto; background: var(--bg-surface-high); padding: 0.5rem; border-radius: 8px; margin-bottom: 0.5rem;">
              ${rec.caption_text || 'No caption text logged'}
            </div>
            ${
              rec.hashtags && rec.hashtags.length > 0
                ? `<div style="display: flex; flex-wrap: wrap; gap: 4px;">
                    ${rec.hashtags.map((tag) => `<span style="font-size: 0.7rem; color: var(--accent-cyan); background: rgba(0,240,255,0.08); padding: 2px 6px; border-radius: 4px;">#${tag}</span>`).join('')}
                   </div>`
                : ''
            }
          </div>

          <div style="display: flex; flex-direction: column; gap: 0.5rem; align-items: flex-end;">
            ${
              rec.url
                ? `<a href="${rec.url}" target="_blank" rel="noopener noreferrer" class="btn btn-primary" style="padding: 0.45rem 1rem; font-size: 0.8rem; text-decoration: none; display: inline-flex; align-items: center; gap: 6px;">
                    <span>🔗 View on Instagram</span>
                   </a>`
                : ''
            }
            <button class="btn btn-secondary btn-delete-history" data-id="${rec.id}" style="padding: 0.35rem 0.75rem; font-size: 0.75rem; color: var(--accent-red);">
              🗑️ Delete Record
            </button>
          </div>
        </div>
      `
        )
        .join('');

      listContainer.querySelectorAll('.btn-delete-history').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-id');
          if (confirm('Delete this publishing history record?')) {
            await api.deletePublishingRecord(id);
            loadHistory();
          }
        });
      });
    } catch (err) {
      listContainer.innerHTML = `<div style="color: var(--accent-red); text-align: center;">Failed to load publishing history: ${err.message}</div>`;
    }
  }

  loadHistory();
}
