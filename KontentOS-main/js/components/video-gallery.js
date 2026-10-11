// KontentOS — Video Gallery Component (Feature #10)
import { api } from '../api.js';
import { openScheduleModal } from './schedule-planner.js';

export function openVideoGalleryModal(onSelectVideo) {
  const existing = document.getElementById('kontentos-gallery-modal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'kontentos-gallery-modal';
  modal.style.cssText = `
    position: fixed; inset: 0; z-index: 9999;
    background: rgba(0, 0, 0, 0.85); backdrop-filter: blur(10px);
    display: flex; align-items: center; justify-content: center; padding: 1.5rem;
  `;

  modal.innerHTML = `
    <div class="card" style="width: 100%; max-width: 900px; max-height: 85vh; display: flex; flex-direction: column; background: var(--bg-surface-card); border: 1px solid var(--border-glass); border-radius: 16px; padding: 1.5rem; overflow: hidden; box-shadow: var(--shadow-lg);">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.25rem; border-bottom: 1px solid var(--border-subtle); padding-bottom: 0.75rem;">
        <div>
          <h2 style="font-size: 1.35rem; display: flex; align-items: center; gap: 8px;">
            <span>🎞️</span> Video Library & Gallery
          </h2>
          <p style="color: var(--text-muted); font-size: 0.85rem;">Manage your uploaded video assets, inspect status, or load into Reel Studio.</p>
        </div>
        <button id="btn-close-gallery" class="btn btn-secondary" style="padding: 0.4rem 0.8rem; font-size: 0.85rem;">✕ Close</button>
      </div>

      <!-- Search & Filters -->
      <div style="display: flex; gap: 0.75rem; margin-bottom: 1.25rem; flex-wrap: wrap;">
        <input type="text" id="gallery-search-input" class="form-input" placeholder="🔍 Search videos by title..." style="flex: 1; min-width: 200px; font-size: 0.85rem;" />
        <select id="gallery-status-filter" class="form-select" style="width: auto; min-width: 140px; font-size: 0.85rem;">
          <option value="all">All Statuses</option>
          <option value="ready">Ready (Processed)</option>
          <option value="uploading">Uploading</option>
          <option value="failed">Failed</option>
        </select>
      </div>

      <!-- Gallery Grid -->
      <div id="gallery-grid-container" style="flex: 1; overflow-y: auto; display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 1rem; padding: 4px;">
        <div style="grid-column: 1 / -1; text-align: center; padding: 2rem; color: var(--text-muted);">
          Loading your video library...
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  const closeBtn = modal.querySelector('#btn-close-gallery');
  closeBtn.addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove();
  });

  const searchInput = modal.querySelector('#gallery-search-input');
  const filterSelect = modal.querySelector('#gallery-status-filter');
  const gridContainer = modal.querySelector('#gallery-grid-container');

  let allVideos = [];

  async function loadVideos() {
    try {
      allVideos = await api.listVideos();
      renderGrid();
    } catch (err) {
      gridContainer.innerHTML = `<div style="grid-column: 1 / -1; color: var(--accent-red); text-align: center;">Failed to load videos: ${err.message}</div>`;
    }
  }

  function renderGrid() {
    const query = (searchInput.value || '').toLowerCase();
    const statusFilter = filterSelect.value;

    const filtered = allVideos.filter((v) => {
      const matchesQuery = v.title.toLowerCase().includes(query);
      const matchesStatus = statusFilter === 'all' || v.status === statusFilter;
      return matchesQuery && matchesStatus;
    });

    if (filtered.length === 0) {
      gridContainer.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 3rem 1rem; color: var(--text-muted);">
          <div style="font-size: 2.5rem; margin-bottom: 0.5rem;">📹</div>
          <div style="font-weight: 700;">No videos found</div>
          <div style="font-size: 0.8rem; margin-top: 4px;">Upload your first clip in the Raw-to-Reel Studio.</div>
        </div>
      `;
      return;
    }

    gridContainer.innerHTML = filtered
      .map(
        (v) => `
        <div class="card" style="background: var(--bg-surface-low); border: 1px solid var(--border-subtle); border-radius: 12px; overflow: hidden; display: flex; flex-direction: column; justify-content: space-between; transition: transform 0.2s ease;">
          <div style="height: 140px; background: #000; position: relative; display: flex; align-items: center; justify-content: center; overflow: hidden;">
            ${
              v.file_url
                ? `<video src="${v.file_url}" muted preload="metadata" style="width: 100%; height: 100%; object-fit: cover;"></video>`
                : `<div style="font-size: 2.5rem;">🎬</div>`
            }
            <span class="badge ${v.status === 'ready' ? 'badge-neon' : 'badge-purple'}" style="position: absolute; top: 8px; right: 8px; font-size: 0.65rem; text-transform: uppercase;">
              ${v.status}
            </span>
          </div>

          <div style="padding: 0.85rem; flex: 1; display: flex; flex-direction: column; justify-content: space-between;">
            <div>
              <div style="font-weight: 700; font-size: 0.9rem; margin-bottom: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${v.title}">
                ${v.title}
              </div>
              <div style="font-size: 0.72rem; color: var(--text-dim); display: flex; justify-content: space-between; margin-bottom: 0.75rem;">
                <span>${v.aspect_ratio || '9:16'}</span>
                <span>${new Date(v.created_at).toLocaleDateString()}</span>
              </div>
            </div>

            <div style="display: flex; gap: 0.4rem;">
              <button class="btn btn-primary btn-select-video" data-id="${v.id}" style="flex: 1; padding: 0.35rem; font-size: 0.75rem;">
                Load in Studio
              </button>
              <button class="btn btn-secondary btn-schedule-video" data-id="${v.id}" style="padding: 0.35rem 0.6rem; font-size: 0.75rem; background: rgba(99, 102, 241, 0.15); border: 1px solid rgba(99, 102, 241, 0.35); color: #a5b4fc; cursor: pointer; font-weight: 600;" title="Schedule to Calendar">
                📅 Schedule
              </button>
              <button class="btn btn-secondary btn-delete-video" data-id="${v.id}" style="padding: 0.35rem 0.5rem; font-size: 0.75rem; color: var(--accent-red);" title="Delete video">
                🗑️
              </button>
            </div>
          </div>
        </div>
      `
      )
      .join('');

    // Bind schedule buttons
    gridContainer.querySelectorAll('.btn-schedule-video').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-id');
        const vid = filtered.find((item) => item.id === id);
        if (vid) {
          modal.remove();
          openScheduleModal({
            videoId: vid.id,
            title: vid.title,
            thumbnailUrl: vid.thumbnail_url,
            fileUrl: vid.file_url,
          });
        }
      });
    });

    // Bind select buttons
    gridContainer.querySelectorAll('.btn-select-video').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const vid = filtered.find((item) => item.id === id);
        if (vid && onSelectVideo) {
          onSelectVideo(vid);
          modal.remove();
        }
      });
    });

    // Bind delete buttons
    gridContainer.querySelectorAll('.btn-delete-video').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-id');
        if (confirm('Are you sure you want to delete this video and its generated captions?')) {
          await api.deleteVideo(id);
          allVideos = allVideos.filter((v) => v.id !== id);
          renderGrid();
        }
      });
    });
  }

  searchInput.addEventListener('input', renderGrid);
  filterSelect.addEventListener('change', renderGrid);

  loadVideos();
}
