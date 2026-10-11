// KontentOS — Creator Brain Profile & AI Tone DNA Hub
import { stateStore, GEO_LOCALES } from '../state.js';
import { api } from '../api.js';

export function renderCreatorBrain(container) {
  const state = stateStore.get();
  const profile = state.creatorProfile;
  const locale = GEO_LOCALES[state.geo] || GEO_LOCALES.IN;

  // Local Tone Tuning State
  let energyLevel = profile.energyLevel || 85;
  let humorLevel = profile.humorLevel || 60;
  let directness = profile.directness || 90;
  let generatedSample = null;
  let isGeneratingSample = false;

  const render = () => {
    container.innerHTML = `
      <div class="content-container" style="max-width: 1150px;">
        <!-- Header -->
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 2rem; flex-wrap: wrap; gap: 1rem;">
          <div>
            <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.25rem;">
              <h1 style="font-size: 2rem;">🧠 Creator Brain & Signature DNA</h1>
              <span class="badge badge-neon">ONLINE & LEARNING</span>
            </div>
            <p style="color: var(--text-muted); font-size: 0.95rem;">
              Your centralized AI memory bank. Calibrate your brand voice, train custom hooks, and generate scripts in your exact tone.
            </p>
          </div>

          <div style="display: flex; gap: 0.75rem;">
            <button id="btn-edit-brain" class="btn btn-secondary">
              <span>⚙️ Reset Setup Wizard</span>
            </button>
            <button id="btn-save-dna" class="btn btn-primary">
              <span>💾 Save Voice DNA</span>
            </button>
          </div>
        </div>

        <!-- Bento Grid: Brain Metrics & Voice DNA Tuning -->
        <div class="bento-grid" style="margin-bottom: 2rem;">
          <!-- Left: Voice Archetype & Interactive Sliders -->
          <div class="card card-glow" style="grid-column: span 7;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.25rem;">
              <h3 style="font-size: 1.2rem;">🎙️ Voice DNA & Tone Calibration</h3>
              <span class="badge badge-purple">${profile.voiceArchetype || 'Dynamic Creator'}</span>
            </div>

            <div style="display: flex; flex-direction: column; gap: 1.25rem;">
              <!-- Tone Sliders -->
              <div style="background: var(--bg-surface-low); padding: 1.15rem; border-radius: 12px; border: 1px solid var(--border-subtle);">
                <div style="display: flex; justify-content: space-between; margin-bottom: 0.35rem;">
                  <span style="font-size: 0.85rem; font-weight: 700; color: var(--text-main);">Energy & Delivery Tempo</span>
                  <span id="label-energy-val" style="font-size: 0.85rem; font-weight: 800; color: var(--accent-primary);">${energyLevel}% (Fast & Punchy)</span>
                </div>
                <input type="range" id="slider-energy" min="20" max="100" value="${energyLevel}" style="width: 100%; accent-color: var(--accent-primary);">
              </div>

              <div style="background: var(--bg-surface-low); padding: 1.15rem; border-radius: 12px; border: 1px solid var(--border-subtle);">
                <div style="display: flex; justify-content: space-between; margin-bottom: 0.35rem;">
                  <span style="font-size: 0.85rem; font-weight: 700; color: var(--text-main);">Humor & Sarcasm Density</span>
                  <span id="label-humor-val" style="font-size: 0.85rem; font-weight: 800; color: var(--accent-secondary);">${humorLevel}% (Balanced Irony)</span>
                </div>
                <input type="range" id="slider-humor" min="0" max="100" value="${humorLevel}" style="width: 100%; accent-color: var(--accent-secondary);">
              </div>

              <div style="background: var(--bg-surface-low); padding: 1.15rem; border-radius: 12px; border: 1px solid var(--border-subtle);">
                <div style="display: flex; justify-content: space-between; margin-bottom: 0.35rem;">
                  <span style="font-size: 0.85rem; font-weight: 700; color: var(--text-main);">Directness & No-BS Factor</span>
                  <span id="label-directness-val" style="font-size: 0.85rem; font-weight: 800; color: var(--accent-cyan);">${directness}% (Straight to Point)</span>
                </div>
                <input type="range" id="slider-directness" min="30" max="100" value="${directness}" style="width: 100%; accent-color: var(--accent-cyan);">
              </div>

              <!-- Catchphrase & Hook Formula -->
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                <div style="background: var(--bg-surface-low); padding: 1rem; border-radius: 12px; border: 1px solid var(--border-subtle);">
                  <label style="font-size: 0.75rem; text-transform: uppercase; color: var(--accent-gold); font-weight: 700; display: block; margin-bottom: 0.35rem;">
                    Signature Catchphrase
                  </label>
                  <input type="text" id="input-catchphrase" class="form-input" value="${profile.customCatchphrase || 'Bhai suno!'}" style="font-weight: 700; font-size: 0.95rem;">
                </div>
                <div style="background: var(--bg-surface-low); padding: 1rem; border-radius: 12px; border: 1px solid var(--border-subtle);">
                  <label style="font-size: 0.75rem; text-transform: uppercase; color: var(--accent-cyan); font-weight: 700; display: block; margin-bottom: 0.35rem;">
                    Hook Archetype
                  </label>
                  <select id="select-hook-archetype" class="form-select" style="font-size: 0.88rem;">
                    <option value="Contrarian Hot Take" ${profile.hookFormula === 'Contrarian Hot Take' ? 'selected' : ''}>Contrarian Hot Take ("Stop doing X")</option>
                    <option value="Curiosity Gap" ${profile.hookFormula === 'Curiosity Gap' ? 'selected' : ''}>Curiosity Gap ("The 1 trick")</option>
                    <option value="Relatable Storytelling" ${profile.hookFormula === 'Relatable Storytelling' ? 'selected' : ''}>Relatable Storytelling ("POV: You...")</option>
                    <option value="Step-by-Step System" ${profile.hookFormula === 'Step-by-Step System' ? 'selected' : ''}>Step-by-Step System ("3 Tools...")</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          <!-- Right: Interactive Tone Sandbox & Voice Tester -->
          <div class="card" style="grid-column: span 5; display: flex; flex-direction: column; justify-content: space-between;">
            <div>
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                <h3 style="font-size: 1.15rem;">🧪 Live Persona Tester</h3>
                <span class="badge badge-neon">AI SIMULATOR</span>
              </div>

              <div style="margin-bottom: 1rem;">
                <label style="display: block; font-size: 0.8rem; color: var(--text-muted); margin-bottom: 0.35rem; font-weight: 600;">
                  Enter any topic or idea to test your voice:
                </label>
                <div style="display: flex; gap: 0.5rem;">
                  <input type="text" id="input-test-topic" class="form-input" placeholder="e.g. AI tools, remote work, morning routine" value="3 productivity hacks for creators" style="font-size: 0.88rem;">
                  <button id="btn-test-voice" class="btn btn-primary" style="white-space: nowrap;" ${isGeneratingSample ? 'disabled' : ''}>
                    ${isGeneratingSample ? '<span>⏳ Synthesizing...</span>' : '<span>⚡ Test Voice</span>'}
                  </button>
                </div>
              </div>

              <!-- Output Box -->
              <div style="background: var(--bg-surface-low); border: 1px solid var(--border-subtle); border-radius: 12px; padding: 1.15rem; min-height: 180px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
                  <span style="font-size: 0.75rem; text-transform: uppercase; color: var(--text-dim); font-weight: 700;">
                    Voice Preview Output
                  </span>
                  ${generatedSample ? '<span class="badge badge-purple" style="font-size: 0.65rem;">100% MATCH</span>' : ''}
                </div>
                <div style="font-size: 0.92rem; line-height: 1.6; color: ${generatedSample ? 'var(--text-main)' : 'var(--text-dim)'}; font-style: ${generatedSample ? 'normal' : 'italic'};">
                  ${generatedSample || `Click "Test Voice" above to watch AI generate a short 15-second viral video script calibrated strictly to your Catchphrase ("${profile.customCatchphrase || 'Bhai suno!'}"), Energy (${energyLevel}%), and Hook style.`}
                </div>
              </div>
            </div>

            <!-- Memory Stats Footprint -->
            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.5rem; text-align: center; margin-top: 1.25rem;">
              <div style="background: var(--bg-surface-low); padding: 0.65rem; border-radius: 8px; border: 1px solid var(--border-subtle);">
                <div style="font-size: 1.2rem; font-weight: 800; color: var(--accent-primary-light);">42</div>
                <div style="font-size: 0.68rem; color: var(--text-dim); text-transform: uppercase;">Learned Hooks</div>
              </div>
              <div style="background: var(--bg-surface-low); padding: 0.65rem; border-radius: 8px; border: 1px solid var(--border-subtle);">
                <div style="font-size: 1.2rem; font-weight: 800; color: var(--accent-secondary);">12</div>
                <div style="font-size: 0.68rem; color: var(--text-dim); text-transform: uppercase;">Winning Archetypes</div>
              </div>
              <div style="background: var(--bg-surface-low); padding: 0.65rem; border-radius: 8px; border: 1px solid var(--border-subtle);">
                <div style="font-size: 1.2rem; font-weight: 800; color: var(--accent-cyan);">98.4%</div>
                <div style="font-size: 0.68rem; color: var(--text-dim); text-transform: uppercase;">Tone Alignment</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    // Event Listeners
    container.querySelector('#slider-energy')?.addEventListener('input', (e) => {
      energyLevel = parseInt(e.target.value);
      stateStore.updateProfile({ energyLevel }, true);
      const label = container.querySelector('#label-energy-val');
      if (label) label.textContent = `${energyLevel}% (Fast & Punchy)`;
    });
    container.querySelector('#slider-humor')?.addEventListener('input', (e) => {
      humorLevel = parseInt(e.target.value);
      stateStore.updateProfile({ humorLevel }, true);
      const label = container.querySelector('#label-humor-val');
      if (label) label.textContent = `${humorLevel}% (Balanced Irony)`;
    });
    container.querySelector('#slider-directness')?.addEventListener('input', (e) => {
      directness = parseInt(e.target.value);
      stateStore.updateProfile({ directness }, true);
      const label = container.querySelector('#label-directness-val');
      if (label) label.textContent = `${directness}% (Straight to Point)`;
    });
    container.querySelector('#input-catchphrase')?.addEventListener('change', (e) => {
      stateStore.updateProfile({ customCatchphrase: e.target.value });
    });
    container.querySelector('#select-hook-archetype')?.addEventListener('change', (e) => {
      stateStore.updateProfile({ hookFormula: e.target.value });
    });

    container.querySelector('#btn-save-dna')?.addEventListener('click', () => {
      const btn = container.querySelector('#btn-save-dna');
      if (btn) btn.innerHTML = '<span>✅ Saved Voice DNA!</span>';
      setTimeout(() => { render(); }, 1200);
    });

    container.querySelector('#btn-edit-brain')?.addEventListener('click', () => {
      stateStore.setTab('onboarding');
    });

    container.querySelector('#btn-test-voice')?.addEventListener('click', async () => {
      const topicInput = container.querySelector('#input-test-topic');
      const topic = topicInput?.value || 'productivity hacks';
      isGeneratingSample = true;
      render();

      try {
        const catchphrase = profile.customCatchphrase || 'Bhai suno!';
        const prompt = `Write a viral 15-second short-form video script for Instagram Reel/TikTok on the topic: "${topic}".
Use catchphrase: "${catchphrase}".
Voice Tone: Energy ${energyLevel}%, Humor ${humorLevel}%, Directness ${directness}%. Hook Archetype: ${profile.hookFormula || 'Contrarian'}.
Keep it concise, high-retention, and action-oriented under 50 words.`;

        const res = await api.generateGeminiText(prompt);
        generatedSample = res.text || `"${catchphrase} Stop scrolling! Here are 3 instant tricks to master ${topic} before anyone else."`;
      } catch (err) {
        generatedSample = `"${profile.customCatchphrase || 'Bhai suno!'} Stop wasting 3 hours every morning on ${topic}. Here is the exact system that saves 10 hours a week."`;
      } finally {
        isGeneratingSample = false;
        render();
      }
    });
  };

  render();
}

