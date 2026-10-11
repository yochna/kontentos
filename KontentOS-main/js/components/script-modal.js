// KontentOS — Advanced Gemini AI Scripting & Multi-Format Generator Modal
import { stateStore } from '../state.js';

let modalElement = null;
let currentResultData = null;
let activeTab = 'script';
let isGenerating = false;
let teleprompterInterval = null;
let isPrompterPlaying = false;
let prompterSpeed = 1.2;

const SAMPLE_PROMPTS = [
  '3 AI Tools That Feel Illegal to Know in 2026',
  'The Silent Salary Negotiation Technique Nobody Teaches',
  'Stop Editing Videos for 5 Hours: The 1-Take Creator System',
  'Why 90% of Freelancers Stay Broke (And The 1 Shift)',
  'Day in the Life of a Solopreneur Building in Public'
];

export function openScriptModal(options = {}) {
  const state = stateStore.get();
  const profile = state.creatorProfile || {};

  const defaultTopic = options.topic || SAMPLE_PROMPTS[Math.floor(Math.random() * SAMPLE_PROMPTS.length)];
  const defaultFormat = options.format || '30s Direct-to-Camera';
  const defaultTone = options.tone || profile.voiceArchetype || 'Casual Hinglish / High Energy';
  const defaultNiche = options.niche || profile.proNiche || 'Tech & Productivity';
  const defaultLanguage = options.language || profile.language || 'English / Hinglish';

  if (!modalElement) {
    modalElement = document.createElement('div');
    modalElement.id = 'gemini-script-modal';
    modalElement.className = 'modal-overlay';
    document.body.appendChild(modalElement);
  }

  activeTab = 'script';
  currentResultData = null;

  renderModalContent({
    topic: defaultTopic,
    format: defaultFormat,
    tone: defaultTone,
    niche: defaultNiche,
    language: defaultLanguage
  });

  modalElement.style.display = 'flex';
  document.body.style.overflow = 'hidden';

  // Automatically trigger generation if topic was explicitly passed from card
  if (options.autoGenerate || options.topic) {
    setTimeout(() => {
      triggerGeneration();
    }, 120);
  }
}

export function closeScriptModal() {
  if (modalElement) {
    modalElement.style.display = 'none';
    document.body.style.overflow = '';
    closeTeleprompter();
  }
}

function renderModalContent(formValues) {
  modalElement.innerHTML = `
    <div class="modal-box" style="width: 100%; max-width: 980px; max-height: 92vh; display: flex; flex-direction: column; overflow: hidden; padding: 0; background: var(--bg-surface-card); border: 1px solid var(--border-glass); border-radius: 16px; box-shadow: 0 20px 60px rgba(0,0,0,0.6);">
      
      <!-- Modal Header -->
      <div style="display: flex; justify-content: space-between; align-items: center; padding: 1rem 1.4rem; border-bottom: 1px solid var(--border-subtle); background: var(--bg-surface-high);">
        <div style="display: flex; align-items: center; gap: 0.65rem;">
          <div style="width: 32px; height: 32px; border-radius: 8px; background: var(--accent-primary); display: flex; align-items: center; justify-content: center; font-size: 1.1rem; box-shadow: 0 0 12px var(--accent-primary-glow);">
            ⚡
          </div>
          <div>
            <h3 style="font-size: 1.15rem; font-weight: 800; display: flex; align-items: center; gap: 0.45rem;">
              <span>Gemini AI Script & Multi-Format Studio</span>
              <span class="badge badge-purple" style="font-size: 0.65rem;">GEMINI 3.8 FLASH</span>
            </h3>
            <p style="font-size: 0.76rem; color: var(--text-muted); margin: 0;">
              Generate high-converting short-form video scripts and syndicate across 5 social platforms in seconds.
            </p>
          </div>
        </div>

        <div style="display: flex; align-items: center; gap: 0.5rem;">
          <button id="btn-close-script-modal" class="btn btn-secondary" style="padding: 0.35rem 0.65rem; font-size: 0.85rem; border-radius: 8px;" title="Close">
            ✕
          </button>
        </div>
      </div>

      <!-- Main Body Container (Split into Left Controls & Right Output) -->
      <div style="display: grid; grid-template-columns: 340px 1fr; flex: 1; overflow: hidden;" id="script-modal-layout">
        
        <!-- Left: Generation Controls Panel -->
        <div style="padding: 1.2rem; background: var(--bg-surface-low); border-right: 1px solid var(--border-subtle); overflow-y: auto; display: flex; flex-direction: column; gap: 1rem;">
          
          <!-- Topic / Concept Input -->
          <div>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.35rem;">
              <label style="font-size: 0.8rem; font-weight: 700; color: var(--text-main);">Video Topic / Hook Concept</label>
              <button id="btn-random-topic" class="btn-text" style="font-size: 0.72rem; color: var(--accent-primary); cursor: pointer; background: none; border: none;">
                🎲 Surprise
              </button>
            </div>
            <textarea id="input-script-topic" class="form-input" rows="3" style="width: 100%; font-size: 0.82rem; line-height: 1.4; resize: none; border-radius: 8px;" placeholder="e.g. 3 Creator Systems To 5x Video Production in 2026">${formValues.topic || ''}</textarea>
          </div>

          <!-- Video Format -->
          <div>
            <label style="display: block; font-size: 0.8rem; font-weight: 700; margin-bottom: 0.35rem; color: var(--text-main);">
              Production Format
            </label>
            <select id="select-script-format" class="form-input" style="width: 100%; font-size: 0.82rem; border-radius: 8px;">
              <option value="30s Direct-to-Camera" ${formValues.format.includes('30s') ? 'selected' : ''}>30s Direct-to-Camera (High Retention)</option>
              <option value="15s Viral POV Skit" ${formValues.format.includes('POV') || formValues.format.includes('15s') ? 'selected' : ''}>15s Viral POV Skit (Relatable)</option>
              <option value="45s Step-by-Step Demo" ${formValues.format.includes('Demo') || formValues.format.includes('45s') ? 'selected' : ''}>45s Screen Demo / Tutorial</option>
              <option value="60s Story Reel & Insight" ${formValues.format.includes('Story') || formValues.format.includes('60s') ? 'selected' : ''}>60s Story Reel & Deep Insight</option>
              <option value="20s Fast Jump-Cut Voiceover" ${formValues.format.includes('Voiceover') ? 'selected' : ''}>20s Fast Jump-Cut Voiceover</option>
            </select>
          </div>

          <!-- Voice & Tone -->
          <div>
            <label style="display: block; font-size: 0.8rem; font-weight: 700; margin-bottom: 0.35rem; color: var(--text-main);">
              Tone & Voice
            </label>
            <select id="select-script-tone" class="form-input" style="width: 100%; font-size: 0.82rem; border-radius: 8px;">
              <option value="Casual Hinglish / Viral" ${formValues.tone.includes('Hinglish') ? 'selected' : ''}>Casual Hinglish (Desi Relatable & Viral)</option>
              <option value="Punchy, Viral & Bold" ${formValues.tone.includes('Punchy') || formValues.tone.includes('Bold') ? 'selected' : ''}>Punchy, Viral & Direct (No Fluff)</option>
              <option value="High-Energy Motivator" ${formValues.tone.includes('Energy') ? 'selected' : ''}>High-Energy Motivator</option>
              <option value="Authoritative & Educational" ${formValues.tone.includes('Educational') ? 'selected' : ''}>Authoritative & Educational</option>
              <option value="Humorous & Sarcastic" ${formValues.tone.includes('Humorous') ? 'selected' : ''}>Humorous & Sarcastic</option>
            </select>
          </div>

          <!-- Language -->
          <div>
            <label style="display: block; font-size: 0.8rem; font-weight: 700; margin-bottom: 0.35rem; color: var(--text-main);">
              Language / Dialect
            </label>
            <select id="select-script-language" class="form-input" style="width: 100%; font-size: 0.82rem; border-radius: 8px;">
              <option value="English / Hinglish" selected>English / Hinglish</option>
              <option value="English (Global)">English (US / UK / Global)</option>
              <option value="Hindi">Hindi (Shuddh / Conversational)</option>
              <option value="Spanish">Spanish</option>
            </select>
          </div>

          <!-- Creator Brain Calibration Notice -->
          <div style="background: var(--bg-surface-high); border: 1px solid var(--border-subtle); border-radius: 8px; padding: 0.65rem; font-size: 0.72rem; color: var(--text-muted); line-height: 1.35;">
            <strong style="color: var(--accent-primary);">🧠 Brain Calibrated:</strong> Scripts automatically weave your voice profile, catchphrases, and preferred hook formulas.
          </div>

          <!-- Action Button -->
          <div style="margin-top: auto; padding-top: 0.5rem;">
            <button id="btn-trigger-generate" class="btn btn-primary" style="width: 100%; padding: 0.75rem; font-size: 0.86rem; justify-content: center; border-radius: 10px; font-weight: 800;">
              <span id="btn-generate-spinner">⚡</span>
              <span id="btn-generate-text">Generate Full Suite</span>
            </button>
          </div>
        </div>

        <!-- Right: Generated Output Display Area -->
        <div style="display: flex; flex-direction: column; overflow: hidden; background: var(--bg-surface-card);" id="script-output-container">
          
          <!-- Top Tab Navigation & Action Bar -->
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.65rem 1rem; border-bottom: 1px solid var(--border-subtle); background: var(--bg-surface-high); flex-wrap: wrap; gap: 0.5rem;">
            
            <!-- Platform Tabs -->
            <div style="display: flex; gap: 0.25rem; overflow-x: auto; max-width: 100%;" id="script-tabs-bar">
              <button class="btn ${activeTab === 'script' ? 'btn-primary' : 'btn-secondary'} script-tab-btn" data-tab="script" style="padding: 0.35rem 0.7rem; font-size: 0.76rem; border-radius: 6px; white-space: nowrap;">
                🎬 Video Script
              </button>
              <button class="btn ${activeTab === 'instagram' ? 'btn-primary' : 'btn-secondary'} script-tab-btn" data-tab="instagram" style="padding: 0.35rem 0.7rem; font-size: 0.76rem; border-radius: 6px; white-space: nowrap;">
                📸 Instagram Reel
              </button>
              <button class="btn ${activeTab === 'youtube' ? 'btn-primary' : 'btn-secondary'} script-tab-btn" data-tab="youtube" style="padding: 0.35rem 0.7rem; font-size: 0.76rem; border-radius: 6px; white-space: nowrap;">
                ▶️ YouTube Shorts
              </button>
              <button class="btn ${activeTab === 'linkedin' ? 'btn-primary' : 'btn-secondary'} script-tab-btn" data-tab="linkedin" style="padding: 0.35rem 0.7rem; font-size: 0.76rem; border-radius: 6px; white-space: nowrap;">
                💼 LinkedIn Carousel
              </button>
              <button class="btn ${activeTab === 'twitter' ? 'btn-primary' : 'btn-secondary'} script-tab-btn" data-tab="twitter" style="padding: 0.35rem 0.7rem; font-size: 0.76rem; border-radius: 6px; white-space: nowrap;">
                🐦 X (Twitter) Thread
              </button>
              <button class="btn ${activeTab === 'threads' ? 'btn-primary' : 'btn-secondary'} script-tab-btn" data-tab="threads" style="padding: 0.35rem 0.7rem; font-size: 0.76rem; border-radius: 6px; white-space: nowrap;">
                🧵 Threads / TikTok
              </button>
            </div>

            <!-- Export / Quick Copy Buttons -->
            <div style="display: flex; gap: 0.35rem; align-items: center;" id="script-actions-bar">
              <button id="btn-copy-active-tab" class="btn btn-secondary" style="padding: 0.35rem 0.7rem; font-size: 0.74rem; border-radius: 6px;" title="Copy current view to clipboard">
                📋 Copy
              </button>
              <button id="btn-export-markdown" class="btn btn-secondary" style="padding: 0.35rem 0.7rem; font-size: 0.74rem; border-radius: 6px;" title="Download full multi-format suite (.md)">
                💾 Export .MD
              </button>
              <button id="btn-open-teleprompter" class="btn btn-secondary" style="padding: 0.35rem 0.7rem; font-size: 0.74rem; border-radius: 6px; color: var(--accent-primary);" title="Fullscreen recording teleprompter">
                🎙️ Teleprompter
              </button>
              <button id="btn-send-raw-studio" class="btn btn-primary" style="padding: 0.35rem 0.75rem; font-size: 0.74rem; border-radius: 6px;" title="Load script into Raw-to-Reel Studio">
                ⚡ Send to Studio
              </button>
            </div>
          </div>

          <!-- Dynamic Output Content Viewer -->
          <div style="flex: 1; overflow-y: auto; padding: 1.25rem;" id="script-tab-content">
            ${renderActiveTabPlaceholder()}
          </div>
        </div>

      </div>

    </div>
  `;

  attachModalEvents();
}

function renderActiveTabPlaceholder() {
  return `
    <div style="height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; color: var(--text-muted); padding: 2rem;">
      <div style="font-size: 3rem; margin-bottom: 1rem; opacity: 0.8; animation: bounce 2s infinite;">
        🎬
      </div>
      <h3 style="font-size: 1.15rem; color: var(--text-main); margin-bottom: 0.4rem;">
        Ready to Generate Your Creator Script & Social Suite
      </h3>
      <p style="font-size: 0.82rem; max-width: 440px; line-height: 1.45; margin-bottom: 1.5rem;">
        Click <strong>"Generate Full Suite"</strong> to write a high-retention video script with timed visual cues, plus auto-repurpose it into Reels, Shorts, LinkedIn carousels, and X threads.
      </p>
      <button id="btn-placeholder-generate" class="btn btn-primary" style="padding: 0.6rem 1.4rem; font-size: 0.85rem; border-radius: 8px;">
        ⚡ Generate Now with Gemini
      </button>
    </div>
  `;
}

function renderActiveTabContent() {
  if (!currentResultData) return renderActiveTabPlaceholder();

  const data = currentResultData;
  const script = data.script || {};
  const mf = data.multiFormat || {};

  switch (activeTab) {
    case 'script':
      return `
        <div style="display: flex; flex-direction: column; gap: 1rem;">
          <!-- Title Banner -->
          <div style="display: flex; justify-content: space-between; align-items: flex-start; padding: 0.85rem 1rem; background: var(--bg-surface-low); border: 1px solid var(--border-subtle); border-radius: 10px;">
            <div>
              <span class="badge badge-purple" style="font-size: 0.62rem; margin-bottom: 0.35rem;">
                ${data.format || '30s Short-Form'} • ${data.tone || 'Viral'}
              </span>
              <h3 style="font-size: 1.1rem; font-weight: 800; color: var(--text-main); margin-top: 0.2rem;">
                ${data.title}
              </h3>
            </div>
            <span class="badge badge-neon" style="font-size: 0.65rem;">RETENTION OPTIMIZED</span>
          </div>

          <!-- Section 1: The Hook (0 - 3s) -->
          <div style="background: rgba(255, 0, 85, 0.05); border: 1px solid rgba(255, 0, 85, 0.3); border-radius: 12px; padding: 1rem;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
              <span style="font-size: 0.72rem; font-weight: 800; text-transform: uppercase; color: #ff0055; letter-spacing: 0.04em;">
                ⚡ THE HOOK (0:00 - 0:03s) • SCROLL STOPPER
              </span>
              <span class="badge badge-purple" style="font-size: 0.6rem;">PATTERN INTERRUPT</span>
            </div>
            
            <div style="font-size: 0.78rem; color: var(--text-muted); margin-bottom: 0.45rem; line-height: 1.35; background: var(--bg-surface-card); padding: 0.5rem 0.75rem; border-radius: 6px;">
              <strong>🎥 Visual Cue:</strong> ${script.hook?.visualCue || 'Sudden camera push-in with expressive hand motion.'}
            </div>

            <div style="font-size: 0.78rem; color: var(--text-muted); margin-bottom: 0.65rem; background: var(--bg-surface-card); padding: 0.5rem 0.75rem; border-radius: 6px;">
              <strong>🔤 On-Screen Banner:</strong> <span style="color: var(--accent-primary); font-weight: 700;">${script.hook?.overlayText || 'STOP SCROLLING! 🚨'}</span>
            </div>

            <div style="font-size: 0.95rem; font-weight: 700; color: var(--text-main); line-height: 1.45; padding: 0.75rem 0.9rem; background: var(--bg-surface-high); border-left: 3px solid #ff0055; border-radius: 0 8px 8px 0;">
              "${script.hook?.spokenText || ''}"
            </div>
          </div>

          <!-- Section 2: Core Beats Timeline (0:03 - 0:26s) -->
          <div style="display: flex; flex-direction: column; gap: 0.75rem;">
            <div style="font-size: 0.78rem; font-weight: 800; text-transform: uppercase; color: var(--accent-primary); letter-spacing: 0.04em;">
              🎬 STORYBOARD BEATS & RETENTION PACING
            </div>

            ${(script.beats || []).map((beat, idx) => `
              <div style="background: var(--bg-surface-low); border: 1px solid var(--border-subtle); border-radius: 10px; padding: 0.85rem;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.4rem;">
                  <strong style="font-size: 0.85rem; color: var(--text-main);">${beat.heading || `Beat ${idx + 1}`}</strong>
                  <span class="badge badge-cyan" style="font-size: 0.6rem;">${beat.time || `0:0${(idx+1)*5}`}</span>
                </div>
                
                <div style="font-size: 0.74rem; color: var(--text-muted); margin-bottom: 0.45rem; line-height: 1.35;">
                  <strong>🎥 Visual / B-Roll:</strong> ${beat.visualCue || 'Screen record demonstration with zoom.'}
                </div>

                <div style="font-size: 0.88rem; font-weight: 600; color: var(--text-main); line-height: 1.4; background: var(--bg-surface-high); padding: 0.6rem 0.8rem; border-radius: 6px;">
                  "${beat.spokenText || ''}"
                </div>
              </div>
            `).join('')}
          </div>

          <!-- Section 3: The Call To Action (0:26 - 0:30s) -->
          <div style="background: rgba(0, 240, 255, 0.05); border: 1px solid rgba(0, 240, 255, 0.3); border-radius: 12px; padding: 1rem;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
              <span style="font-size: 0.72rem; font-weight: 800; text-transform: uppercase; color: var(--accent-primary); letter-spacing: 0.04em;">
                📣 CALL TO ACTION & COMMENT TRIGGER (0:26 - 0:30s)
              </span>
              <span class="badge badge-neon" style="font-size: 0.6rem;">VIRAL BAIT</span>
            </div>

            <div style="font-size: 0.76rem; color: var(--text-muted); margin-bottom: 0.45rem;">
              <strong>🎥 Visual Cue:</strong> ${script.cta?.visualCue || 'Point down toward comments with animated arrow.'}
            </div>

            <div style="font-size: 0.92rem; font-weight: 700; color: var(--text-main); line-height: 1.4; padding: 0.75rem 0.9rem; background: var(--bg-surface-high); border-left: 3px solid var(--accent-primary); border-radius: 0 8px 8px 0; margin-bottom: 0.5rem;">
              "${script.cta?.spokenText || ''}"
            </div>

            <div style="font-size: 0.78rem; font-weight: 700; color: var(--accent-secondary); background: var(--bg-surface-card); padding: 0.5rem 0.75rem; border-radius: 6px; display: inline-block;">
              💬 Comment Bait: ${script.cta?.commentBait || 'Comment below for the link!'}
            </div>
          </div>
        </div>
      `;

    case 'instagram':
      const ig = mf.instagram || {};
      return `
        <div style="display: flex; flex-direction: column; gap: 1rem;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <h4 style="font-size: 1rem; color: var(--text-main); display: flex; align-items: center; gap: 0.4rem;">
              <span>📸 Instagram Reel Caption & Hashtags</span>
            </h4>
            <span class="badge badge-purple">OPTIMIZED FOR SAVES & SHARES</span>
          </div>

          <div style="background: var(--bg-surface-low); border: 1px solid var(--border-subtle); border-radius: 12px; padding: 1.25rem;">
            <div style="font-size: 0.88rem; line-height: 1.6; color: var(--text-main); white-space: pre-wrap; font-family: inherit;" id="copyable-ig-caption">
${ig.caption || ''}
            </div>
          </div>

          <div>
            <label style="display: block; font-size: 0.78rem; font-weight: 700; margin-bottom: 0.4rem; color: var(--text-muted);">
              Recommended Hashtags (High Discoverability)
            </label>
            <div style="display: flex; gap: 0.4rem; flex-wrap: wrap;">
              ${(ig.hashtags || []).map(tag => `
                <span class="badge badge-cyan" style="font-size: 0.72rem; padding: 4px 8px; cursor: pointer;" title="Click to copy">#${tag.replace('#', '')}</span>
              `).join('')}
            </div>
          </div>
        </div>
      `;

    case 'youtube':
      const yt = mf.youtube || {};
      return `
        <div style="display: flex; flex-direction: column; gap: 1rem;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <h4 style="font-size: 1rem; color: var(--text-main); display: flex; align-items: center; gap: 0.4rem;">
              <span>▶️ YouTube Shorts Package</span>
            </h4>
            <span class="badge badge-purple">HIGH CTR & SEARCH</span>
          </div>

          <div>
            <label style="display: block; font-size: 0.78rem; font-weight: 700; margin-bottom: 0.35rem; color: var(--text-muted);">
              High-CTR Short Title (< 60 chars)
            </label>
            <div style="font-size: 1rem; font-weight: 800; color: var(--text-main); padding: 0.75rem 1rem; background: var(--bg-surface-low); border: 1px solid var(--border-subtle); border-radius: 8px;">
              ${yt.title || data.title}
            </div>
          </div>

          <div>
            <label style="display: block; font-size: 0.78rem; font-weight: 700; margin-bottom: 0.35rem; color: var(--text-muted);">
              Shorts Description (With Timestamps)
            </label>
            <div style="font-size: 0.84rem; line-height: 1.55; color: var(--text-main); white-space: pre-wrap; padding: 1rem; background: var(--bg-surface-low); border: 1px solid var(--border-subtle); border-radius: 8px;">
${yt.description || ''}
            </div>
          </div>

          <div>
            <label style="display: block; font-size: 0.78rem; font-weight: 700; margin-bottom: 0.4rem; color: var(--text-muted);">
              SEO Video Tags
            </label>
            <div style="display: flex; gap: 0.4rem; flex-wrap: wrap;">
              ${(yt.tags || []).map(tag => `
                <span class="badge badge-purple" style="font-size: 0.72rem; padding: 4px 8px;">${tag}</span>
              `).join('')}
            </div>
          </div>
        </div>
      `;

    case 'linkedin':
      const li = mf.linkedin || {};
      return `
        <div style="display: flex; flex-direction: column; gap: 1rem;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <h4 style="font-size: 1rem; color: var(--text-main); display: flex; align-items: center; gap: 0.4rem;">
              <span>💼 LinkedIn Thought-Leadership Post & Carousel</span>
            </h4>
            <span class="badge badge-neon">B2B & CLIENT ATTRACTION</span>
          </div>

          <div>
            <label style="display: block; font-size: 0.78rem; font-weight: 700; margin-bottom: 0.35rem; color: var(--text-muted);">
              Text Post
            </label>
            <div style="font-size: 0.86rem; line-height: 1.6; color: var(--text-main); white-space: pre-wrap; padding: 1rem; background: var(--bg-surface-low); border: 1px solid var(--border-subtle); border-radius: 8px;">
${li.postText || ''}
            </div>
          </div>

          <div>
            <label style="display: block; font-size: 0.78rem; font-weight: 700; margin-bottom: 0.4rem; color: var(--text-muted);">
              5-Slide Carousel Document Outline
            </label>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 0.6rem;">
              ${(li.slideOutline || []).map((slide, i) => `
                <div style="background: var(--bg-surface-high); border: 1px solid var(--border-subtle); border-radius: 8px; padding: 0.75rem; text-align: center; display: flex; flex-direction: column; justify-content: center; min-height: 90px;">
                  <span style="font-size: 0.65rem; font-weight: 800; color: var(--accent-primary); text-transform: uppercase;">Slide ${i + 1}</span>
                  <p style="font-size: 0.76rem; font-weight: 600; color: var(--text-main); margin-top: 0.3rem; line-height: 1.3;">
                    ${slide.replace(`Slide ${i+1}: `, '')}
                  </p>
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      `;

    case 'twitter':
      const thread = mf.twitterThread || [];
      return `
        <div style="display: flex; flex-direction: column; gap: 0.85rem;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <h4 style="font-size: 1rem; color: var(--text-main); display: flex; align-items: center; gap: 0.4rem;">
              <span>🐦 5-Tweet Viral Thread</span>
            </h4>
            <span class="badge badge-cyan">${thread.length} TWEETS</span>
          </div>

          ${thread.map((tweet, i) => `
            <div style="background: var(--bg-surface-low); border: 1px solid var(--border-subtle); border-radius: 10px; padding: 0.85rem;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.35rem;">
                <span style="font-size: 0.68rem; font-weight: 800; color: var(--accent-primary);">TWEET ${i + 1} OF ${thread.length}</span>
                <button class="btn btn-secondary btn-copy-single-tweet" data-tweet="${encodeURIComponent(tweet)}" style="padding: 0.2rem 0.5rem; font-size: 0.68rem; border-radius: 4px;">
                  Copy
                </button>
              </div>
              <div style="font-size: 0.84rem; line-height: 1.45; color: var(--text-main);">
                ${tweet}
              </div>
            </div>
          `).join('')}
        </div>
      `;

    case 'threads':
      const th = mf.threads || {};
      return `
        <div style="display: flex; flex-direction: column; gap: 1rem;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <h4 style="font-size: 1rem; color: var(--text-main); display: flex; align-items: center; gap: 0.4rem;">
              <span>🧵 Threads / TikTok Casual Post</span>
            </h4>
            <span class="badge badge-purple">CASUAL VIBE</span>
          </div>

          <div style="background: var(--bg-surface-low); border: 1px solid var(--border-subtle); border-radius: 12px; padding: 1.25rem;">
            <div style="font-size: 0.9rem; line-height: 1.6; color: var(--text-main); white-space: pre-wrap;">
${th.text || ''}
            </div>
          </div>
        </div>
      `;

    default:
      return '';
  }
}

function attachModalEvents() {
  const btnClose = modalElement.querySelector('#btn-close-script-modal');
  if (btnClose) btnClose.addEventListener('click', closeScriptModal);

  // Close on backdrop click
  modalElement.addEventListener('click', (e) => {
    if (e.target === modalElement) closeScriptModal();
  });

  // Random topic
  const btnRandom = modalElement.querySelector('#btn-random-topic');
  if (btnRandom) {
    btnRandom.addEventListener('click', () => {
      const promptInput = modalElement.querySelector('#input-script-topic');
      if (promptInput) {
        promptInput.value = SAMPLE_PROMPTS[Math.floor(Math.random() * SAMPLE_PROMPTS.length)];
      }
    });
  }

  // Generate trigger button
  const btnGenerate = modalElement.querySelector('#btn-trigger-generate');
  if (btnGenerate) {
    btnGenerate.addEventListener('click', triggerGeneration);
  }

  const btnPlaceholder = modalElement.querySelector('#btn-placeholder-generate');
  if (btnPlaceholder) {
    btnPlaceholder.addEventListener('click', triggerGeneration);
  }

  // Tab switcher
  modalElement.querySelectorAll('.script-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      activeTab = btn.getAttribute('data-tab');
      modalElement.querySelectorAll('.script-tab-btn').forEach(b => {
        b.classList.remove('btn-primary');
        b.classList.add('btn-secondary');
      });
      btn.classList.add('btn-primary');
      btn.classList.remove('btn-secondary');

      const content = modalElement.querySelector('#script-tab-content');
      if (content) {
        content.innerHTML = renderActiveTabContent();
        attachTabContentEvents();
      }
    });
  });

  // Export & Action Buttons
  const btnCopyActive = modalElement.querySelector('#btn-copy-active-tab');
  if (btnCopyActive) {
    btnCopyActive.addEventListener('click', () => {
      if (!currentResultData) return;
      const textToCopy = getActiveTabText();
      navigator.clipboard.writeText(textToCopy).then(() => {
        btnCopyActive.innerHTML = '✅ Copied!';
        setTimeout(() => { btnCopyActive.innerHTML = '📋 Copy'; }, 1800);
      });
    });
  }

  const btnExportMd = modalElement.querySelector('#btn-export-markdown');
  if (btnExportMd) {
    btnExportMd.addEventListener('click', () => {
      if (!currentResultData) return;
      downloadMarkdownBundle();
    });
  }

  const btnTeleprompter = modalElement.querySelector('#btn-open-teleprompter');
  if (btnTeleprompter) {
    btnTeleprompter.addEventListener('click', () => {
      if (!currentResultData) return;
      openTeleprompterMode();
    });
  }

  const btnSendStudio = modalElement.querySelector('#btn-send-raw-studio');
  if (btnSendStudio) {
    btnSendStudio.addEventListener('click', () => {
      if (!currentResultData) return;
      sendToRawStudio();
    });
  }

  attachTabContentEvents();
}

function attachTabContentEvents() {
  modalElement.querySelectorAll('.btn-copy-single-tweet').forEach(btn => {
    btn.addEventListener('click', () => {
      const tweetText = decodeURIComponent(btn.getAttribute('data-tweet') || '');
      navigator.clipboard.writeText(tweetText).then(() => {
        btn.textContent = '✅';
        setTimeout(() => { btn.textContent = 'Copy'; }, 1500);
      });
    });
  });
}

async function triggerGeneration() {
  if (isGenerating) return;

  const topicInput = modalElement.querySelector('#input-script-topic');
  const formatSelect = modalElement.querySelector('#select-script-format');
  const toneSelect = modalElement.querySelector('#select-script-tone');
  const langSelect = modalElement.querySelector('#select-script-language');

  const topic = (topicInput?.value || '').trim();
  if (!topic) {
    if (topicInput) topicInput.focus();
    return;
  }

  const format = formatSelect?.value || '30s Direct-to-Camera';
  const tone = toneSelect?.value || 'Casual Hinglish / Viral';
  const language = langSelect?.value || 'English / Hinglish';

  const state = stateStore.get();
  const profile = state.creatorProfile || {};

  isGenerating = true;

  const btnGenerate = modalElement.querySelector('#btn-trigger-generate');
  const btnSpinner = modalElement.querySelector('#btn-generate-spinner');
  const btnText = modalElement.querySelector('#btn-generate-text');
  const outputContainer = modalElement.querySelector('#script-tab-content');

  if (btnGenerate) btnGenerate.disabled = true;
  if (btnSpinner) btnSpinner.textContent = '⏳';
  if (btnText) btnText.textContent = 'AI Writing Script & Suite...';

  if (outputContainer) {
    outputContainer.innerHTML = `
      <div style="height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 2rem;">
        <div style="width: 48px; height: 48px; border-radius: 50%; border: 3px solid var(--border-subtle); border-top-color: var(--accent-primary); animation: spin 1s linear infinite; margin-bottom: 1.25rem;"></div>
        <h4 style="font-size: 1.1rem; color: var(--text-main); margin-bottom: 0.35rem;">
          Gemini 3.8 Flash is crafting your viral package...
        </h4>
        <p style="font-size: 0.8rem; color: var(--text-muted); max-width: 400px; line-height: 1.4;">
          Calibrating 0-3s visual hook, pacing beats, comment-bait CTA, and auto-repurposing for Reels, Shorts, LinkedIn & X.
        </p>
      </div>
    `;
  }

  try {
    const res = await fetch('/api/script/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topic,
        format,
        tone,
        language,
        niche: profile.proNiche || 'Tech & Productivity',
        persona: profile.customCatchphrase ? `${profile.customCatchphrase} - ${profile.voiceArchetype}` : ''
      })
    });

    const json = await res.json();
    if (json.success && json.data) {
      currentResultData = json.data;
    } else {
      throw new Error(json.error || 'Failed to generate script');
    }
  } catch (err) {
    console.warn('Using client fallback generator:', err);
    currentResultData = {
      title: topic,
      format,
      tone,
      script: {
        hook: {
          time: '0:00 - 0:03',
          visualCue: 'Sudden camera push-in, expressive face, neon-highlighted subtitle banner.',
          overlayText: 'STOP SCROLLING! 🚨 90% Miss This',
          spokenText: `Listen closely: if you are creating video content in 2026, you need to understand "${topic}".`
        },
        beats: [
          { time: '0:03 - 0:11', heading: 'Beat 1: The Frustrating Reality', visualCue: 'Timeline recording showing manual subtitle struggle.', spokenText: 'Most creators spend 5 hours editing a 30-second reel. Manual caption styling is killing your creative momentum.' },
          { time: '0:11 - 0:20', heading: 'Beat 2: The 1-Click Multiplier', visualCue: 'Highlight automated 1-take video pipeline.', spokenText: 'Instead, record unpolished raw thoughts on your phone. Let AI handle kinetic captions, silence removal, and framing.' },
          { time: '0:20 - 0:26', heading: 'Beat 3: Omnichannel Distribution', visualCue: 'Social media logos illuminate in sequence.', spokenText: 'Then syndicate that single video into Reels, Shorts, TikTok, and LinkedIn in one click.' }
        ],
        cta: {
          time: '0:26 - 0:30',
          visualCue: 'Engaging lean forward pointing down to comment section.',
          spokenText: `Drop a comment below with "SYSTEM" and I will send you the exact template we use to publish 5x faster!`,
          commentBait: 'Comment "SYSTEM" for the free video workflow breakdown! 👇'
        }
      },
      multiFormat: {
        instagram: {
          caption: `📌 Stop burning 5 hours on every reel in 2026!\n\nHere is how to tackle "${topic}" without burning out:\n\n1️⃣ Record raw 1-take thoughts when creative flow peaks\n2️⃣ Automate kinetic captions, pacing cuts & color pop\n3️⃣ Repurpose the core insight into carousels & threads\n\n👇 Save this reel for your next creation sprint! What is your biggest content bottleneck right now?`,
          hashtags: ['contentcreator', 'reelsgrowth', 'videomarketing', 'creatoreconomy', 'kontentos']
        },
        youtube: {
          title: `${topic.slice(0, 52)} 🚨 (Viral Creator Breakdown)`,
          description: `Stop overcomplicating your video production workflow. In this Short, we break down "${topic}" step-by-step.\n\n📌 In This Short:\n0:00 - The Core Trap\n0:10 - The 1-Click Workflow\n0:20 - Omnichannel Distribution\n\n💬 Subscribe for daily creator tools and drop your thoughts in the comments below!`,
          tags: ['Shorts', 'YouTubeShorts', 'CreatorTips', 'VideoMarketing', 'CreatorEconomy']
        },
        linkedin: {
          postText: `The creator economy in 2026 is won on distribution speed, not manual editing fatigue.\n\nHere is the operational breakdown on "${topic}":\n\n• High-leverage creators do not spend half their day manually placing captions.\n• They record unpolished high-signal thoughts, leverage automated workflows, and syndicate.\n• One idea becomes a video, a 5-slide carousel, and a tactical text breakdown.\n\nAre you prioritizing manual production or streamlined distribution this quarter?`,
          slideOutline: [
            `Slide 1: Master Class - ${topic}`,
            'Slide 2: The Bottleneck - Manual Editing Fatigue',
            'Slide 3: The Framework - Raw Input + Automated AI',
            'Slide 4: The Leverage - Multi-Platform Distribution',
            'Slide 5: Save & Share with your creator team'
          ]
        },
        twitterThread: [
          `1/ Everything you need to know about "${topic}" in 2026 (save this thread) 🧵👇`,
          '2/ Point 1: 90% of creators give up because post-production friction drains their creative battery.',
          '3/ Point 2: The solution isn’t working harder—it’s turning raw 1-minute smartphone recordings into polished assets with AI.',
          '4/ Point 3: Syndicate each idea everywhere: Reels for discovery, Shorts for subscriber momentum, and LinkedIn for high-ticket deals.',
          '5/ Want our full viral hook library? Retweet tweet #1 and check out @KontentOS for the complete creator toolkit! ⚡'
        ],
        threads: {
          text: `Unpopular truth about "${topic}" ☕\n\nYou do not need a 4K studio camera or 10 hours in Premiere. You need raw conviction and a frictionless publishing pipeline.\n\nHow much time do you spend editing per week? 👇`
        }
      }
    };
  } finally {
    isGenerating = false;
    if (btnGenerate) btnGenerate.disabled = false;
    if (btnSpinner) btnSpinner.textContent = '⚡';
    if (btnText) btnText.textContent = 'Generate Full Suite';

    if (outputContainer) {
      outputContainer.innerHTML = renderActiveTabContent();
      attachTabContentEvents();
    }
  }
}

function getActiveTabText() {
  if (!currentResultData) return '';
  const data = currentResultData;
  const script = data.script || {};
  const mf = data.multiFormat || {};

  switch (activeTab) {
    case 'script':
      return [
        `# ${data.title} (${data.format || 'Short-Form Script'})`,
        `\n[HOOK (0:00 - 0:03)]`,
        `Visual Cue: ${script.hook?.visualCue || ''}`,
        `Overlay Text: ${script.hook?.overlayText || ''}`,
        `Spoken: "${script.hook?.spokenText || ''}"`,
        `\n[BEATS]`,
        ...(script.beats || []).map((b, i) => `\nBeat ${i+1} (${b.time}):\nVisual: ${b.visualCue}\nSpoken: "${b.spokenText}"`),
        `\n[CALL TO ACTION (0:26 - 0:30)]`,
        `Visual: ${script.cta?.visualCue || ''}`,
        `Spoken: "${script.cta?.spokenText || ''}"`,
        `Comment Trigger: ${script.cta?.commentBait || ''}`
      ].join('\n');

    case 'instagram':
      return `${mf.instagram?.caption || ''}\n\n${(mf.instagram?.hashtags || []).map(t => `#${t.replace('#','')}`).join(' ')}`;

    case 'youtube':
      return `Title: ${mf.youtube?.title || ''}\n\nDescription:\n${mf.youtube?.description || ''}\n\nTags:\n${(mf.youtube?.tags || []).join(', ')}`;

    case 'linkedin':
      return `${mf.linkedin?.postText || ''}\n\nCarousel Slides:\n${(mf.linkedin?.slideOutline || []).join('\n')}`;

    case 'twitter':
      return (mf.twitterThread || []).join('\n\n');

    case 'threads':
      return mf.threads?.text || '';

    default:
      return '';
  }
}

function downloadMarkdownBundle() {
  if (!currentResultData) return;
  const d = currentResultData;
  const s = d.script || {};
  const mf = d.multiFormat || {};

  const mdContent = `# ${d.title} — KontentOS Creator Package
Format: ${d.format || '30s Direct-to-Camera'}
Tone: ${d.tone || 'Viral'}
Date: ${new Date().toLocaleDateString()}

---

## 🎬 1. VIDEO SCRIPT & STORYBOARD

### HOOK (0:00 - 0:03s)
- **Visual Cue:** ${s.hook?.visualCue || ''}
- **On-Screen Text:** ${s.hook?.overlayText || ''}
- **Spoken Line:** "${s.hook?.spokenText || ''}"

### STORYBOARD BEATS
${(s.beats || []).map((b, i) => `
#### ${b.heading || `Beat ${i+1}`} (${b.time})
- **Visual Cue:** ${b.visualCue}
- **Spoken Line:** "${b.spokenText}"
`).join('\n')}

### CALL TO ACTION (0:26 - 0:30s)
- **Visual Cue:** ${s.cta?.visualCue || ''}
- **Spoken Line:** "${s.cta?.spokenText || ''}"
- **Comment Trigger:** ${s.cta?.commentBait || ''}

---

## 📸 2. INSTAGRAM REEL
${mf.instagram?.caption || ''}

**Hashtags:** ${(mf.instagram?.hashtags || []).map(t => `#${t.replace('#','')}`).join(' ')}

---

## ▶️ 3. YOUTUBE SHORTS
**Title:** ${mf.youtube?.title || ''}

**Description:**
${mf.youtube?.description || ''}

**Tags:** ${(mf.youtube?.tags || []).join(', ')}

---

## 💼 4. LINKEDIN POST & CAROUSEL
${mf.linkedin?.postText || ''}

**Carousel Outline:**
${(mf.linkedin?.slideOutline || []).map((slide, i) => `${slide}`).join('\n')}

---

## 🐦 5. X (TWITTER) THREAD
${(mf.twitterThread || []).join('\n\n')}

---

## 🧵 6. THREADS / TIKTOK
${mf.threads?.text || ''}
`;

  const blob = new Blob([mdContent], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${(d.title || 'script').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}-suite.md`;
  a.click();
  URL.revokeObjectURL(url);
}

function sendToRawStudio() {
  if (!currentResultData) return;
  const script = currentResultData.script || {};
  const fullText = [
    script.hook?.spokenText || '',
    ...(script.beats || []).map(b => b.spokenText || ''),
    script.cta?.spokenText || ''
  ].filter(Boolean).join(' ');

  try {
    sessionStorage.setItem('kontentos_active_script', JSON.stringify({
      title: currentResultData.title,
      spokenText: fullText,
      hook: script.hook?.spokenText,
      bannerText: script.hook?.overlayText,
      commentBait: script.cta?.commentBait
    }));
  } catch (e) {
    console.warn('Session storage write error', e);
  }

  closeScriptModal();
  stateStore.setTab('studio');
}

// Fullscreen Teleprompter Engine
function openTeleprompterMode() {
  if (!currentResultData) return;
  const script = currentResultData.script || {};
  const spokenLines = [
    `🚨 [HOOK] "${script.hook?.spokenText || ''}"`,
    ...(script.beats || []).map((b, i) => `\n📍 [BEAT ${i+1}] "${b.spokenText || ''}"`),
    `\n📣 [CTA] "${script.cta?.spokenText || ''}"`
  ].join('\n\n');

  let prompterEl = document.getElementById('kontentos-teleprompter');
  if (!prompterEl) {
    prompterEl = document.createElement('div');
    prompterEl.id = 'kontentos-teleprompter';
    document.body.appendChild(prompterEl);
  }

  prompterEl.innerHTML = `
    <div style="position: fixed; inset: 0; background: #000; color: #fff; z-index: 99999; display: flex; flex-direction: column; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
      <!-- Prompter Top Bar -->
      <div style="padding: 1rem 2rem; background: rgba(20,20,20,0.9); display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #333;">
        <div style="display: flex; align-items: center; gap: 1rem;">
          <span style="font-size: 1.1rem; font-weight: 800; color: var(--accent-primary);">🎙️ PROMPTER MODE</span>
          <span style="font-size: 0.85rem; color: #aaa;">${currentResultData.title}</span>
        </div>

        <!-- Controls -->
        <div style="display: flex; align-items: center; gap: 0.75rem;">
          <button id="btn-prompter-toggle" style="background: var(--accent-primary); color: #000; border: none; padding: 0.5rem 1.25rem; font-size: 0.9rem; font-weight: 800; border-radius: 8px; cursor: pointer;">
            ▶ START SCROLL
          </button>
          
          <div style="display: flex; align-items: center; gap: 0.35rem; background: #222; padding: 0.3rem 0.65rem; border-radius: 6px;">
            <span style="font-size: 0.75rem; color: #888;">Speed:</span>
            <button id="btn-speed-slow" style="background: none; border: none; color: #fff; cursor: pointer; font-size: 0.8rem; font-weight: 700;">1x</button>
            <button id="btn-speed-med" style="background: none; border: none; color: var(--accent-primary); cursor: pointer; font-size: 0.8rem; font-weight: 700;">1.5x</button>
            <button id="btn-speed-fast" style="background: none; border: none; color: #fff; cursor: pointer; font-size: 0.8rem; font-weight: 700;">2x</button>
          </div>

          <button id="btn-prompter-close" style="background: #333; color: #fff; border: none; padding: 0.5rem 0.9rem; font-size: 0.9rem; border-radius: 8px; cursor: pointer;">
            ✕ Close
          </button>
        </div>
      </div>

      <!-- Center Eye-Line Reading Marker -->
      <div style="position: absolute; top: 40%; left: 0; right: 0; height: 120px; border-top: 2px dashed rgba(0, 240, 255, 0.4); border-bottom: 2px dashed rgba(0, 240, 255, 0.4); pointer-events: none; z-index: 10;">
        <div style="position: absolute; right: 20px; top: 8px; color: var(--accent-primary); font-size: 0.75rem; font-weight: 800; text-transform: uppercase;">
          👁️ EYE-LINE FOCUS
        </div>
      </div>

      <!-- Scrolling Script Text Box -->
      <div id="prompter-scroll-view" style="flex: 1; overflow-y: auto; padding: 35vh 15vw 50vh 15vw; scroll-behavior: smooth;">
        <div style="font-size: clamp(2rem, 3.8vw, 3.2rem); font-weight: 800; line-height: 1.5; color: #ffffff; white-space: pre-wrap; text-shadow: 0 2px 10px rgba(0,0,0,0.8);">
${spokenLines}
        </div>
      </div>
    </div>
  `;

  prompterEl.style.display = 'block';

  const btnToggle = prompterEl.querySelector('#btn-prompter-toggle');
  const btnClose = prompterEl.querySelector('#btn-prompter-close');
  const scrollView = prompterEl.querySelector('#prompter-scroll-view');

  isPrompterPlaying = false;

  function togglePrompter() {
    isPrompterPlaying = !isPrompterPlaying;
    if (isPrompterPlaying) {
      if (btnToggle) btnToggle.textContent = '⏸ PAUSE SCROLL';
      teleprompterInterval = setInterval(() => {
        if (scrollView) scrollView.scrollTop += prompterSpeed;
      }, 25);
    } else {
      if (btnToggle) btnToggle.textContent = '▶ RESUME SCROLL';
      clearInterval(teleprompterInterval);
    }
  }

  if (btnToggle) btnToggle.addEventListener('click', togglePrompter);
  if (btnClose) btnClose.addEventListener('click', closeTeleprompter);

  // Speed controls
  prompterEl.querySelector('#btn-speed-slow')?.addEventListener('click', () => { prompterSpeed = 0.8; });
  prompterEl.querySelector('#btn-speed-med')?.addEventListener('click', () => { prompterSpeed = 1.3; });
  prompterEl.querySelector('#btn-speed-fast')?.addEventListener('click', () => { prompterSpeed = 2.0; });
}

function closeTeleprompter() {
  const prompterEl = document.getElementById('kontentos-teleprompter');
  if (prompterEl) {
    clearInterval(teleprompterInterval);
    isPrompterPlaying = false;
    prompterEl.style.display = 'none';
  }
}
