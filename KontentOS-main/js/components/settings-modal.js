// KontentOS — User Settings & Location/GPS Management Modal
import { stateStore, GEO_LOCALES } from '../state.js';

export function openSettingsModal() {
  let modal = document.getElementById('user-settings-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'user-settings-modal';
    modal.className = 'modal-overlay';
    document.body.appendChild(modal);
  }

  const state = stateStore.get();
  const profile = state.creatorProfile;
  const currentLocale = GEO_LOCALES[state.geo] || GEO_LOCALES.IN;

  modal.innerHTML = `
    <div class="modal-box" style="max-width: 580px;">
      <!-- Header -->
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; border-bottom: 1px solid var(--border-subtle); padding-bottom: 1rem;">
        <div style="display: flex; align-items: center; gap: 0.5rem;">
          <span style="font-size: 1.3rem;">⚙️</span>
          <h2 style="font-size: 1.35rem;">User & Workspace Settings</h2>
        </div>
        <button id="btn-close-settings" class="btn btn-secondary" style="padding: 0.35rem 0.65rem;">✕</button>
      </div>

      <!-- Section 1: GPS / Geographic Location Detection -->
      <div style="margin-bottom: 1.5rem; background: var(--bg-surface-low); padding: 1.25rem; border-radius: 12px; border: 1px solid var(--border-subtle);">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
          <h3 style="font-size: 1rem; display: flex; align-items: center; gap: 0.4rem;">
            <span>📍 Creator Location & Currency</span>
          </h3>
          <span class="badge badge-neon" style="font-size: 0.65rem;">AUTO-DETECTED</span>
        </div>
        <p style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 1rem;">
          Viral trends, regional benchmark videos, audio tracks, and rate calculations are tailored to your geography.
        </p>

        <div style="display: flex; gap: 0.75rem; align-items: center; margin-bottom: 0.85rem; flex-wrap: wrap;">
          <select id="settings-geo-select" class="form-select" style="flex: 1; min-width: 180px;">
            ${Object.values(GEO_LOCALES).map(locale => `
              <option value="${locale.code}" ${state.geo === locale.code ? 'selected' : ''}>
                ${locale.flag} ${locale.name} (${locale.currency})
              </option>
            `).join('')}
          </select>

          <button id="btn-detect-gps" class="btn btn-secondary" style="font-size: 0.82rem; padding: 0.75rem 0.85rem; white-space: nowrap;">
            <span>🔄 Re-detect via GPS</span>
          </button>
        </div>

        <div style="font-size: 0.75rem; color: var(--text-dim); display: flex; align-items: center; gap: 0.35rem;">
          <span>Detected Source:</span>
          <strong style="color: var(--accent-cyan);">${state.geoSource || 'GPS / Timezone'}</strong>
        </div>
      </div>

      <!-- Section 2: Creator Profile Defaults -->
      <div style="margin-bottom: 1.5rem;">
        <h3 style="font-size: 1rem; margin-bottom: 0.75rem;">Creator Identity</h3>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem;">
          <div>
            <label style="display: block; font-size: 0.78rem; font-weight: 600; margin-bottom: 0.25rem; color: var(--text-muted);">Creator Name</label>
            <input id="settings-input-name" type="text" class="form-input" value="${profile.name}">
          </div>
          <div>
            <label style="display: block; font-size: 0.78rem; font-weight: 600; margin-bottom: 0.25rem; color: var(--text-muted);">Handle</label>
            <input id="settings-input-handle" type="text" class="form-input" value="${profile.handle}">
          </div>
        </div>
      </div>

      <!-- Section 3: Interface Theme -->
      <div style="margin-bottom: 1.5rem;">
        <h3 style="font-size: 1rem; margin-bottom: 0.5rem;">Interface Theme</h3>
        <div style="display: flex; gap: 0.75rem;">
          <button id="btn-set-dark" class="btn ${state.theme === 'dark' ? 'btn-primary' : 'btn-secondary'}" style="flex: 1; padding: 0.65rem;">
            <span>🌌 Dark Mode (Midnight)</span>
          </button>
          <button id="btn-set-light" class="btn ${state.theme === 'light' ? 'btn-primary' : 'btn-secondary'}" style="flex: 1; padding: 0.65rem;">
            <span>☀️ Light Mode (Sahara V3)</span>
          </button>
        </div>
      </div>

      <!-- Save Actions -->
      <div style="display: flex; justify-content: flex-end; gap: 0.75rem; border-top: 1px solid var(--border-subtle); padding-top: 1rem;">
        <button id="btn-save-settings" class="btn btn-primary" style="padding: 0.65rem 1.5rem;">
          <span>Save Changes</span>
        </button>
      </div>
    </div>
  `;

  modal.classList.add('open');

  // Event Listeners
  const closeBtn = modal.querySelector('#btn-close-settings');
  if (closeBtn) closeBtn.addEventListener('click', () => modal.classList.remove('open'));

  const geoSelect = modal.querySelector('#settings-geo-select');
  if (geoSelect) {
    geoSelect.addEventListener('change', (e) => {
      stateStore.setGeo(e.target.value, 'User Settings (Manual)');
    });
  }

  const gpsBtn = modal.querySelector('#btn-detect-gps');
  if (gpsBtn) {
    gpsBtn.addEventListener('click', () => {
      gpsBtn.textContent = '⏳ Detecting...';
      stateStore.requestGpsLocation();
      setTimeout(() => {
        openSettingsModal();
      }, 600);
    });
  }

  const setDarkBtn = modal.querySelector('#btn-set-dark');
  const setLightBtn = modal.querySelector('#btn-set-light');
  if (setDarkBtn) setDarkBtn.addEventListener('click', () => { stateStore.setTheme('dark'); openSettingsModal(); });
  if (setLightBtn) setLightBtn.addEventListener('click', () => { stateStore.setTheme('light'); openSettingsModal(); });

  const saveBtn = modal.querySelector('#btn-save-settings');
  if (saveBtn) {
    saveBtn.addEventListener('click', () => {
      const name = modal.querySelector('#settings-input-name').value;
      const handle = modal.querySelector('#settings-input-handle').value;
      stateStore.updateProfile({ name, handle });
      modal.classList.remove('open');
    });
  }

  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.classList.remove('open');
  });
}
