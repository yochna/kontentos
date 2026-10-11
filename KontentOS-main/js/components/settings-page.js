// KontentOS — Creator Settings Hub & Profile Management Page
import { stateStore, GEO_LOCALES } from '../state.js';
import { openProModal } from './pro-modal.js';
import { api } from '../api.js';

export function renderSettingsPage(container) {
  const state = stateStore.get();
  const profile = state.creatorProfile;
  const currentGeo = state.geo || 'IN';
  const currentLocale = GEO_LOCALES[currentGeo] || GEO_LOCALES.IN;

  const ALL_NICHES = [
    'Entertainment & Comedy',
    'Tech & Startups',
    'Personal Finance & Investing',
    'Fitness, Health & Biohacking',
    'Lifestyle, Fashion & Travel',
    'Education, Career & Productivity'
  ];

  const POPULAR_MICRO_TAGS = [
    'Relatable Daily Skits',
    'POV & Rants',
    'Hostel & College Life Banter',
    'AI Tools & Prompting',
    'Productivity Hacks',
    'Budget Living & Savings',
    'Freelancing & Side Hustles',
    'Aesthetic Mini-Vlogs',
    'Meme Edits & Lip-Syncs',
    'Street Reactions'
  ];

  let selectedTags = profile.microTags && profile.microTags.length > 0 
    ? [...profile.microTags] 
    : ['Relatable Daily Skits', 'POV & Rants', 'AI Tools & Prompting'];

  container.innerHTML = `
    <div class="content-container" style="max-width: 1050px; padding-bottom: 3rem;">
      
      <!-- Top Header -->
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 2rem; flex-wrap: wrap; gap: 1rem;">
        <div>
          <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.25rem;">
            <h1 style="font-size: 2rem;">⚙️ User Settings</h1>
            <span class="badge badge-purple">${profile.isPro ? 'PRO ACCOUNT' : 'FREE TIER'}</span>
          </div>
          <p style="color: var(--text-muted); font-size: 0.92rem;">
            Manage your user profile, onboarding parameters, connected platforms, appearance theme, and billing currency.
          </p>
        </div>

        <div style="display: flex; gap: 0.75rem; align-items: center;">
          <button id="btn-rerun-onboarding" class="btn btn-secondary" style="padding: 0.5rem 1rem; font-size: 0.85rem;">
            <span>🔄 Re-run Onboarding Wizard</span>
          </button>
          <button id="btn-save-all-settings" class="btn btn-primary" style="padding: 0.5rem 1.25rem; font-size: 0.85rem;">
            <span>💾 Save Profile</span>
          </button>
        </div>
      </div>

      <!-- Main Settings Grid -->
      <div class="bento-grid" style="gap: 1.5rem;">
        
        <!-- TOP PROMINENT CARD: "Made with KontentOS" Watermark & Pro Upgrade Engine -->
        <div class="card card-glow" style="grid-column: span 12; background: linear-gradient(135deg, var(--bg-surface-card), var(--bg-surface-high)); border: 1px solid var(--border-glass); padding: 1.25rem 1.5rem; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem;">
          <div style="display: flex; align-items: center; gap: 1rem;">
            <div style="width: 48px; height: 48px; border-radius: 12px; background: rgba(0, 240, 255, 0.12); border: 1px solid var(--border-glass); display: flex; align-items: center; justify-content: center; font-size: 1.5rem;">
              ⚡
            </div>
            <div>
              <div style="display: flex; align-items: center; gap: 0.5rem;">
                <strong style="font-size: 1.1rem; color: var(--text-main);">"Made with KontentOS" Watermark</strong>
                <span class="badge ${profile.isPro ? 'badge-neon' : 'badge-purple'}" style="font-size: 0.65rem;">
                  ${profile.isPro ? '👑 PRO UNLOCKED' : 'FREE TIER ACTIVE'}
                </span>
              </div>
              <p style="font-size: 0.82rem; color: var(--text-muted); margin-top: 2px;">
                ${profile.isPro 
                  ? 'You are on Creator Pro. Watermarks are disabled across all 4K video and high-res image exports.' 
                  : 'Watermark is added to Free exports. Toggle off to upgrade to Creator Pro with 4K exports & zero branding.'}
              </p>
            </div>
          </div>

          <div style="display: flex; align-items: center; gap: 1rem;">
            <span style="font-size: 0.82rem; font-weight: 700; color: var(--text-dim);">
              ${profile.includeWatermark ? 'Watermark Enabled' : 'Watermark Disabled'}
            </span>
            <label class="toggle-switch">
              <input type="checkbox" ${profile.includeWatermark ? 'checked' : ''} id="toggle-setting-watermark">
              <span class="toggle-slider"></span>
            </label>
          </div>
        </div>

        <!-- SECTION 1: Creator Identity & Social Presences (Captured in Step 1) -->
        <div class="card" style="grid-column: span 12;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.25rem; border-bottom: 1px solid var(--border-subtle); padding-bottom: 0.75rem;">
            <div style="display: flex; align-items: center; gap: 0.5rem;">
              <span style="font-size: 1.25rem;">👤</span>
              <h2 style="font-size: 1.2rem;">Creator Identity & Social Presence</h2>
            </div>
            <span class="badge badge-neon">ONBOARDING STEP 1</span>
          </div>

          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 1.25rem;">
            
            <!-- Full Name -->
            <div>
              <label style="font-size: 0.82rem; font-weight: 700; color: var(--text-dim); display: block; margin-bottom: 4px;">
                Full Name / Creator Persona
              </label>
              <input type="text" id="setting-full-name" class="form-input" value="${profile.name || ''}" placeholder="e.g. Aman Sharma" />
            </div>

            <!-- Primary Instagram Handle -->
            <div>
              <label style="font-size: 0.82rem; font-weight: 700; color: var(--text-dim); display: block; margin-bottom: 4px;">
                Instagram Handle
              </label>
              <input type="text" id="setting-ig-handle" class="form-input" value="${profile.instagramHandle || profile.handle || '@creator'}" placeholder="@yourhandle" />
            </div>

            <!-- YouTube Channel -->
            <div>
              <label style="font-size: 0.82rem; font-weight: 700; color: var(--text-dim); display: block; margin-bottom: 4px;">
                YouTube Channel
              </label>
              <input type="text" id="setting-yt-handle" class="form-input" value="${profile.youtubeHandle || '@tech_guy_rahul'}" placeholder="@yourchannel" />
            </div>

            <!-- X (Twitter) Handle -->
            <div>
              <label style="font-size: 0.82rem; font-weight: 700; color: var(--text-dim); display: block; margin-bottom: 4px;">
                𝕏 (Twitter) Handle
              </label>
              <input type="text" id="setting-x-handle" class="form-input" value="${profile.xHandle || '@priya_builds'}" placeholder="@yourhandle" />
            </div>

            <!-- Target Audience Demographics -->
            <div style="grid-column: 1 / -1;">
              <label style="font-size: 0.82rem; font-weight: 700; color: var(--text-dim); display: block; margin-bottom: 4px;">
                Target Audience Persona & Pain Point
              </label>
              <input type="text" id="setting-audience" class="form-input" value="${profile.targetAudience || 'Tech freelancers, solo creators, and remote workers looking to scale in 2026'}" placeholder="e.g. College students, young professionals, indie hackers" />
            </div>

          </div>
        </div>

        <!-- SECTION 2: Niche, Micro-Tags & Language (Captured in Step 2) -->
        <div class="card" style="grid-column: span 12;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.25rem; border-bottom: 1px solid var(--border-subtle); padding-bottom: 0.75rem;">
            <div style="display: flex; align-items: center; gap: 0.5rem;">
              <span style="font-size: 1.25rem;">🎯</span>
              <h2 style="font-size: 1.2rem;">Niche, Micro-Tags & Language</h2>
            </div>
            <span class="badge badge-purple">ONBOARDING STEP 2</span>
          </div>

          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 1.25rem; margin-bottom: 1.25rem;">
            
            <!-- Primary Category Dropdown -->
            <div>
              <label style="font-size: 0.82rem; font-weight: 700; color: var(--text-dim); display: block; margin-bottom: 4px;">
                Primary Niche Category
              </label>
              <select id="setting-category" class="form-select">
                ${ALL_NICHES.map(n => `
                  <option value="${n}" ${profile.selectedVibe === n || profile.niche === n ? 'selected' : ''}>${n}</option>
                `).join('')}
              </select>
            </div>

            <!-- Primary Language / Dialect -->
            <div>
              <label style="font-size: 0.82rem; font-weight: 700; color: var(--text-dim); display: block; margin-bottom: 4px;">
                Primary Language / Script Dialect
              </label>
              <select id="setting-language" class="form-select">
                <option value="Hinglish (Hindi + English)" ${profile.language?.includes('Hinglish') ? 'selected' : ''}>Hinglish (Hindi + English)</option>
                <option value="English (US)" ${profile.language?.includes('US') ? 'selected' : ''}>English (US)</option>
                <option value="English (UK)" ${profile.language?.includes('UK') ? 'selected' : ''}>English (UK)</option>
                <option value="English (Global)" ${profile.language?.includes('Global') ? 'selected' : ''}>English (Global)</option>
                <option value="Hindi" ${profile.language === 'Hindi' ? 'selected' : ''}>Hindi</option>
                <option value="Spanish" ${profile.language === 'Spanish' ? 'selected' : ''}>Spanish</option>
              </select>
            </div>

          </div>

          <!-- Micro-Tags Selector -->
          <div>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
              <label style="font-size: 0.82rem; font-weight: 700; color: var(--text-dim);">
                Active Micro-Niche Tags (Click to toggle)
              </label>
              <span style="font-size: 0.72rem; color: var(--text-dim);">${selectedTags.length} active</span>
            </div>

            <div style="display: flex; gap: 0.45rem; flex-wrap: wrap; margin-bottom: 0.85rem;" id="settings-tags-cloud">
              ${POPULAR_MICRO_TAGS.map(tag => {
                const isSelected = selectedTags.includes(tag);
                return `
                  <button type="button" class="btn ${isSelected ? 'btn-primary' : 'btn-secondary'} btn-setting-tag" data-tag="${tag}" style="padding: 0.35rem 0.75rem; font-size: 0.78rem; border-radius: 999px;">
                    <span>${isSelected ? '✓' : '+'} ${tag}</span>
                  </button>
                `;
              }).join('')}
            </div>

            <div style="display: flex; gap: 0.5rem; max-width: 400px;">
              <input type="text" id="input-custom-tag-setting" class="form-input" placeholder="Add custom tag (e.g. Crypto Hacks)" style="padding: 0.4rem 0.85rem; font-size: 0.82rem;" />
              <button type="button" id="btn-add-custom-tag-setting" class="btn btn-secondary" style="padding: 0.4rem 0.85rem; font-size: 0.82rem; white-space: nowrap;">
                <span>+ Add Tag</span>
              </button>
            </div>
          </div>
        </div>

        <!-- SECTION 3: Content Style, Intent & Voice (Captured in Step 3 & 4) -->
        <div class="card" style="grid-column: span 6;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.25rem; border-bottom: 1px solid var(--border-subtle); padding-bottom: 0.75rem;">
            <div style="display: flex; align-items: center; gap: 0.5rem;">
              <span style="font-size: 1.25rem;">⚡</span>
              <h2 style="font-size: 1.15rem;">Content Tone & Hook Style</h2>
            </div>
            <span class="badge badge-neon">STEPS 3 & 4</span>
          </div>

          <div style="display: flex; flex-direction: column; gap: 1rem;">
            <!-- Voice Archetype -->
            <div>
              <label style="font-size: 0.82rem; font-weight: 700; color: var(--text-dim); display: block; margin-bottom: 4px;">
                Creator Voice Archetype
              </label>
              <select id="setting-voice" class="form-select">
                <option value="High-Energy Motivator" ${profile.voiceArchetype?.includes('High-Energy') ? 'selected' : ''}>🔥 High-Energy Motivator</option>
                <option value="Relatable Casual Storyteller" ${profile.voiceArchetype?.includes('Storyteller') ? 'selected' : ''}>☕ Relatable Casual Storyteller</option>
                <option value="Direct Analytical Authority" ${profile.voiceArchetype?.includes('Analytical') ? 'selected' : ''}>📊 Direct Analytical Authority</option>
                <option value="Sarcastic & Witty" ${profile.voiceArchetype?.includes('Sarcastic') ? 'selected' : ''}>🎭 Sarcastic & Witty</option>
              </select>
            </div>

            <!-- Custom Catchphrase -->
            <div>
              <label style="font-size: 0.82rem; font-weight: 700; color: var(--text-dim); display: block; margin-bottom: 4px;">
                Signature Catchphrase / Opening Hook
              </label>
              <input type="text" id="setting-catchphrase" class="form-input" value="${profile.customCatchphrase || 'Bhai suno!'}" placeholder="e.g. Stop doing this! / Listen up..." />
            </div>

            <!-- Banned Negative Words -->
            <div>
              <label style="font-size: 0.82rem; font-weight: 700; color: var(--text-dim); display: block; margin-bottom: 4px;">
                Banned Corporate Jargon / Words to Avoid
              </label>
              <input type="text" id="setting-banned-words" class="form-input" value="${profile.bannedWords || 'Synergy, Game-changer, Deep dive'}" placeholder="Comma separated words" />
            </div>
          </div>
        </div>

        <!-- SECTION 4: Appearance Theme & Currency Location Settings -->
        <div class="card" style="grid-column: span 6;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.25rem; border-bottom: 1px solid var(--border-subtle); padding-bottom: 0.75rem;">
            <div style="display: flex; align-items: center; gap: 0.5rem;">
              <span style="font-size: 1.25rem;">🎨</span>
              <h2 style="font-size: 1.15rem;">Theme, Currency & Watermark</h2>
            </div>
            <span class="badge badge-purple">SYSTEM PREFS</span>
          </div>

          <div style="display: flex; flex-direction: column; gap: 1rem;">
            
            <!-- Theme Switcher Selector -->
            <div>
              <label style="font-size: 0.82rem; font-weight: 700; color: var(--text-dim); display: block; margin-bottom: 6px;">
                Interface Theme Mode
              </label>
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem;">
                <button type="button" class="btn ${state.theme === 'dark' ? 'btn-primary' : 'btn-secondary'} btn-theme-toggle" data-theme-name="dark" style="padding: 0.6rem; font-size: 0.82rem;">
                  <span>🌌 Midnight Obsidian (Dark)</span>
                </button>
                <button type="button" class="btn ${state.theme === 'light' ? 'btn-primary' : 'btn-secondary'} btn-theme-toggle" data-theme-name="light" style="padding: 0.6rem; font-size: 0.82rem;">
                  <span>☀️ Sahara Linen V3 (Light)</span>
                </button>
              </div>
            </div>

            <!-- Currency Selector -->
            <div>
              <label style="font-size: 0.82rem; font-weight: 700; color: var(--text-dim); display: block; margin-bottom: 4px;">
                Display Currency & Rate Card Format
              </label>
              <select id="setting-currency" class="form-select">
                <option value="IN" ${currentGeo === 'IN' ? 'selected' : ''}>INR (₹) — Indian Rupee</option>
                <option value="US" ${currentGeo === 'US' ? 'selected' : ''}>USD ($) — United States Dollar</option>
                <option value="UK" ${currentGeo === 'UK' ? 'selected' : ''}>GBP (£) — British Pound</option>
                <option value="AE" ${currentGeo === 'AE' ? 'selected' : ''}>AED (AED) — UAE Dirham</option>
              </select>
              <div style="font-size: 0.72rem; color: var(--text-dim); margin-top: 3px;">
                📍 GPS Location Detection: <strong>${state.geoSource || 'Auto-Detected'}</strong>
              </div>
            </div>

          </div>
        </div>

      </div>
    </div>
  `;

  // Attach Settings Events
  const btnSave = container.querySelector('#btn-save-all-settings');
  const inputName = container.querySelector('#setting-full-name');
  const inputIg = container.querySelector('#setting-ig-handle');
  const inputYt = container.querySelector('#setting-yt-handle');
  const inputX = container.querySelector('#setting-x-handle');
  const inputAudience = container.querySelector('#setting-audience');
  const selectCategory = container.querySelector('#setting-category');
  const selectLanguage = container.querySelector('#setting-language');
  const selectVoice = container.querySelector('#setting-voice');
  const inputCatchphrase = container.querySelector('#setting-catchphrase');
  const inputBanned = container.querySelector('#setting-banned-words');
  const selectCurrency = container.querySelector('#setting-currency');
  const toggleWatermark = container.querySelector('#toggle-setting-watermark');
  const btnRerun = container.querySelector('#btn-rerun-onboarding');

  // Tag Cloud Toggles
  container.querySelectorAll('.btn-setting-tag').forEach(btn => {
    btn.addEventListener('click', () => {
      const tag = btn.getAttribute('data-tag');
      if (selectedTags.includes(tag)) {
        selectedTags = selectedTags.filter(t => t !== tag);
      } else {
        selectedTags.push(tag);
      }
      renderSettingsPage(container);
    });
  });

  // Add Custom Tag
  const inputCustomTag = container.querySelector('#input-custom-tag-setting');
  const btnAddCustomTag = container.querySelector('#btn-add-custom-tag-setting');
  if (btnAddCustomTag && inputCustomTag) {
    btnAddCustomTag.addEventListener('click', () => {
      const val = inputCustomTag.value.trim();
      if (val && !selectedTags.includes(val)) {
        selectedTags.push(val);
        inputCustomTag.value = '';
        renderSettingsPage(container);
      }
    });
  }

  // Theme Toggles
  container.querySelectorAll('.btn-theme-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const themeName = btn.getAttribute('data-theme-name');
      stateStore.setTheme(themeName);
      renderSettingsPage(container);
    });
  });

  // Currency Selector
  if (selectCurrency) {
    selectCurrency.addEventListener('change', (e) => {
      stateStore.setGeo(e.target.value, 'User Settings Custom Selection');
    });
  }

  // Watermark Toggle with Pro Payment Trigger
  if (toggleWatermark) {
    toggleWatermark.addEventListener('change', (e) => {
      if (!e.target.checked && !profile.isPro) {
        openProModal({
          onSuccess: () => {
            renderSettingsPage(container);
          },
          onCancel: () => {
            toggleWatermark.checked = true;
            stateStore.updateProfile({ includeWatermark: true });
          }
        });
      } else {
        stateStore.updateProfile({ includeWatermark: e.target.checked });
      }
    });
  }

  // Re-run Onboarding Wizard
  if (btnRerun) {
    btnRerun.addEventListener('click', () => {
      stateStore.setTab('onboarding');
    });
  }

  // Save All Settings
  if (btnSave) {
    btnSave.addEventListener('click', () => {
      const updated = {
        name: inputName ? inputName.value.trim() : profile.name,
        fullName: inputName ? inputName.value.trim() : profile.name,
        instagramHandle: inputIg ? inputIg.value.trim() : profile.instagramHandle,
        handle: inputIg ? inputIg.value.trim() : profile.handle,
        youtubeHandle: inputYt ? inputYt.value.trim() : profile.youtubeHandle,
        xHandle: inputX ? inputX.value.trim() : profile.xHandle,
        targetAudience: inputAudience ? inputAudience.value.trim() : profile.targetAudience,
        selectedVibe: selectCategory ? selectCategory.value : profile.selectedVibe,
        niche: selectCategory ? selectCategory.value : profile.niche,
        language: selectLanguage ? selectLanguage.value : profile.language,
        voiceArchetype: selectVoice ? selectVoice.value : profile.voiceArchetype,
        customCatchphrase: inputCatchphrase ? inputCatchphrase.value.trim() : profile.customCatchphrase,
        bannedWords: inputBanned ? inputBanned.value.trim() : profile.bannedWords,
        microTags: selectedTags
      };

      stateStore.updateProfile(updated);
      btnSave.classList.add('btn-neon');
      btnSave.innerHTML = '<span>✅ Saved Successfully!</span>';
      setTimeout(() => {
        btnSave.classList.remove('btn-neon');
        btnSave.innerHTML = '<span>💾 Save Profile</span>';
      }, 1800);
    });
  }
}
