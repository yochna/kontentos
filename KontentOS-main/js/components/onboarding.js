// KontentOS — 4-Step New User Onboarding Wizard with Expanded Micro-Niche Catalog
import { stateStore, GEO_LOCALES } from '../state.js';

let currentStep = 1;
let selectedMicroTags = ['Relatable Daily Skits', 'POV & Rants'];
let activeCategory = 'Entertainment & Comedy';

export function renderOnboarding(container) {
  const state = stateStore.get();
  const profile = state.creatorProfile;
  const locale = GEO_LOCALES[state.geo] || GEO_LOCALES.IN;

  container.innerHTML = `
    <div class="content-container" style="max-width: 860px; margin: 0 auto; padding-top: 1rem;">
      <!-- Step Header Card -->
      <div class="card card-glow" style="background: var(--bg-surface-card); border-radius: 24px; padding: 2.5rem 2rem;">
        
        <!-- Step Indicator -->
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem;">
          <div id="wizard-step-label" style="font-size: 0.8rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: var(--accent-primary);">
            Step ${currentStep} of 4 — ${getStepLabel(currentStep)}
          </div>
          <div style="display: flex; gap: 6px; width: 140px;" id="wizard-progress-bars">
            <div style="height: 4px; flex: 1; border-radius: 4px; background: ${currentStep >= 1 ? 'var(--accent-primary)' : 'var(--border-subtle)'};"></div>
            <div style="height: 4px; flex: 1; border-radius: 4px; background: ${currentStep >= 2 ? 'var(--accent-primary)' : 'var(--border-subtle)'};"></div>
            <div style="height: 4px; flex: 1; border-radius: 4px; background: ${currentStep >= 3 ? 'var(--accent-primary)' : 'var(--border-subtle)'};"></div>
            <div style="height: 4px; flex: 1; border-radius: 4px; background: ${currentStep >= 4 ? 'var(--accent-primary)' : 'var(--border-subtle)'};"></div>
          </div>
        </div>

        <!-- Dynamic Step Content Area -->
        <div id="step-render-area">
          ${renderStepContent(currentStep, profile, locale)}
        </div>

        <!-- Wizard Navigation Footer -->
        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 2.5rem; border-top: 1px solid var(--border-subtle); padding-top: 1.5rem;">
          <button id="btn-wizard-back" class="btn btn-secondary" style="padding: 0.65rem 1.25rem; ${currentStep === 1 ? 'display: none;' : ''}">
            <span>← Back</span>
          </button>
          
          <button id="btn-save-draft" class="btn btn-secondary" style="padding: 0.65rem 1.25rem; ${currentStep > 1 ? 'display: none;' : ''}">
            <span>Save Draft</span>
          </button>

          <div style="display: flex; gap: 0.75rem;">
            ${currentStep < 4 ? `
              <button id="btn-wizard-next" class="btn btn-primary" style="padding: 0.75rem 2rem; font-size: 0.95rem;">
                <span>Continue →</span>
              </button>
            ` : `
              <button id="btn-wizard-finish" class="btn btn-primary" style="padding: 0.75rem 2.25rem; font-size: 1rem;">
                <span>Initialize Creator Brain ⚡</span>
              </button>
            `}
          </div>
        </div>
      </div>
    </div>
  `;

  attachStepEvents(container);
}

function getStepLabel(step) {
  switch (step) {
    case 1: return 'Basic Info';
    case 2: return 'Niche Details';
    case 3: return 'Use Case';
    case 4: return 'Content Style';
    default: return '';
  }
}

const CATEGORY_TAG_MAP = {
  'Entertainment & Comedy': [
    'Relatable Daily Skits',
    'POV & Rants',
    'Hostel & College Life Banter',
    'Street & Public Reactions',
    'Meme Edits & Lip-Syncs',
    'Couple & Friendship Comedy',
    'Bollywood & Cinema Memes',
    'Movie & Web Series Reviews',
    'Cricket & Sports Banter',
    'Food & Street Food Vlogs',
    'Pet Chaos & Funny Animals',
    'Roasts & Parodies',
    'Aesthetic Mini-Vlogs',
    'Life Hacks & Relatable Fails',
    'Gaming Moments & Clips',
    'Late Night Thoughts'
  ],
  'Tech & Startups': [
    'AI Tools & Prompting',
    'Software Engineering & Coding',
    'No-Code & Automation',
    'Productivity & Notion Systems',
    'SaaS & Startup Growth',
    'Gadget & Smartphone Reviews',
    'Cybersecurity & Ethical Hacking',
    'Web3 & Crypto Insights',
    'Developer Humor & Tech Fails'
  ],
  'Finance & Wealth': [
    'Personal Finance & Budgeting',
    'Stock Market & Trading',
    'Side Hustles & Freelancing',
    'E-Commerce & Dropshipping',
    'Career Hacks & Salary Negotiation',
    'Real Estate & Property',
    'Crypto & Bitcoin',
    'Money Myths & Scams'
  ],
  'Fitness & Health': [
    'Fat Loss & Transformation',
    'Quick Home Workouts',
    'Healthy Meal Prep & Nutrition',
    'Gym Motivation & Form Tips',
    'Mental Health & Meditation',
    'Biohacking & Sleep Optimization',
    'Grooming & Daily Style'
  ],
  'Design & Creativity': [
    'UX/UI Design Tips',
    'Video Editing & CapCut Hacks',
    'Graphic Design & Branding',
    'Photography & Camera Angles',
    '3D & Motion Graphics',
    'Creative Freelancing'
  ],
  'Education & Career': [
    'English Fluency & Communication',
    'Job Interview Prep & Resumes',
    'Study Hacks & Exam Motivation',
    'Remote Work & Freelancing',
    'Book Summaries & Wisdom',
    'Public Speaking & Leadership'
  ]
};

function renderStepContent(step, profile, locale) {
  switch (step) {
    case 1:
      return `
        <div>
          <h1 style="font-size: clamp(1.6rem, 4vw, 2.4rem); margin-bottom: 0.5rem; letter-spacing: -0.02em;">Basic Info</h1>
          <p style="color: var(--text-muted); font-size: 0.95rem; margin-bottom: 1.5rem;">
            Let's start with the essentials to configure your Creator OS workspace.
          </p>

          <div style="display: flex; flex-direction: column; gap: 1.25rem;">
            <div>
              <label style="display: block; font-size: 0.85rem; font-weight: 600; margin-bottom: 0.4rem; color: var(--text-main);">Full Name</label>
              <input id="input-step-name" type="text" class="form-input" value="${profile.name || ''}" placeholder="Enter your full name" autofocus>
            </div>

            <div>
              <label style="display: block; font-size: 0.85rem; font-weight: 600; margin-bottom: 0.65rem; color: var(--text-main);">Social Presence</label>
              <div style="display: flex; flex-direction: column; gap: 0.65rem;">
                <div style="display: flex; align-items: center; gap: 0.5rem; background: var(--bg-surface-low); padding: 0.35rem 0.75rem; border-radius: 10px; border: 1px solid var(--border-subtle);">
                  <span style="font-size: 1.1rem;">📸</span>
                  <input id="input-step-ig" type="text" class="form-input" style="background: transparent; border: none; padding: 0.5rem 0;" value="${profile.handle || ''}" placeholder="Instagram handle (@username)">
                </div>

                <div style="display: flex; align-items: center; gap: 0.5rem; background: var(--bg-surface-low); padding: 0.35rem 0.75rem; border-radius: 10px; border: 1px solid var(--border-subtle);">
                  <span style="font-size: 1.1rem;">▶️</span>
                  <input id="input-step-yt" type="text" class="form-input" style="background: transparent; border: none; padding: 0.5rem 0;" placeholder="YouTube channel URL or handle">
                </div>

                <div style="display: flex; align-items: center; gap: 0.5rem; background: var(--bg-surface-low); padding: 0.35rem 0.75rem; border-radius: 10px; border: 1px solid var(--border-subtle);">
                  <span style="font-size: 1.1rem;">𝕏</span>
                  <input id="input-step-x" type="text" class="form-input" style="background: transparent; border: none; padding: 0.5rem 0;" placeholder="X (Twitter) handle (@username)">
                </div>
              </div>
            </div>

            <div>
              <label style="display: block; font-size: 0.85rem; font-weight: 600; margin-bottom: 0.4rem; color: var(--text-main);">Target Audience Segment</label>
              <select id="select-step-audience" class="form-select">
                <option value="General Entertainment & Mass Audience">General Entertainment & Mass Audience (Casual / Viral)</option>
                <option value="College Students & Gen-Z">College Students & Gen-Z (Youth)</option>
                <option value="Tech Founders & Developers">Tech Founders, Developers & Solopreneurs</option>
                <option value="Working Professionals & Career Seekers">Working Professionals & Career Seekers</option>
                <option value="Finance & Wealth Seekers">Finance & Wealth Seekers</option>
                <option value="Fitness & Health Seekers">Fitness & Lifestyle Optimizers</option>
              </select>
            </div>
          </div>
        </div>
      `;

    case 2:
      const categories = [
        { id: 'entertainment', name: 'Entertainment & Comedy', icon: '🎭', desc: 'Mass viral, skits, memes, rants, banter' },
        { id: 'tech', name: 'Tech & Startups', icon: '💻', desc: 'AI, coding, SaaS, gadgets, automation' },
        { id: 'finance', name: 'Finance & Wealth', icon: '📈', desc: 'Investing, trading, side hustles, budgeting' },
        { id: 'fitness', name: 'Fitness & Health', icon: '💪', desc: 'Workouts, fat loss, diet, biohacking' },
        { id: 'design', name: 'Design & Creativity', icon: '🎨', desc: 'UX/UI, editing, motion, branding' },
        { id: 'education', name: 'Education & Career', icon: '📚', desc: 'Job hacks, speaking, study tips' }
      ];

      const currentTags = CATEGORY_TAG_MAP[activeCategory] || CATEGORY_TAG_MAP['Entertainment & Comedy'];

      return `
        <div>
          <h1 style="font-size: clamp(1.6rem, 4vw, 2.4rem); margin-bottom: 0.5rem; letter-spacing: -0.02em;">Define Your Niche & Style</h1>
          <p style="color: var(--text-muted); font-size: 0.95rem; margin-bottom: 1.5rem;">
            Select your primary category and micro-tags to calibrate your viral recommendation engine.
          </p>

          <!-- Primary Categories Grid -->
          <div style="margin-bottom: 2rem;">
            <label style="display: block; font-size: 0.85rem; font-weight: 600; margin-bottom: 0.75rem; color: var(--text-main);">
              Primary Category
            </label>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 0.75rem;">
              ${categories.map(cat => {
                const isSelected = activeCategory === cat.name;
                return `
                  <div class="category-choice card ${isSelected ? 'active-card' : ''}" data-cat="${cat.name}" style="cursor: pointer; padding: 1rem; border-color: ${isSelected ? 'var(--accent-primary)' : 'var(--border-subtle)'}; background: ${isSelected ? 'var(--bg-surface-high)' : 'var(--bg-surface-low)'}; transition: all 0.2s ease;">
                    <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.25rem;">
                      <span style="font-size: 1.4rem;">${cat.icon}</span>
                      <strong style="font-size: 0.95rem; color: ${isSelected ? 'var(--accent-primary)' : 'var(--text-main)'};">${cat.name}</strong>
                    </div>
                    <div style="font-size: 0.75rem; color: var(--text-muted);">${cat.desc}</div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>

          <!-- Micro-Niche Tag Pills (Dynamic for Category) -->
          <div>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem; flex-wrap: wrap; gap: 0.5rem;">
              <label style="font-size: 0.85rem; font-weight: 600; color: var(--text-main);">
                Micro-Niche Tags for <span style="color: var(--accent-primary);">${activeCategory}</span>
              </label>
              <span class="badge badge-purple" style="font-size: 0.7rem;">
                Selected: <strong id="tag-count" style="margin-left: 2px;">${selectedMicroTags.length}</strong> / 5
              </span>
            </div>

            <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 1.25rem;" id="micro-tags-container">
              ${currentTags.map(tag => {
                const isSelected = selectedMicroTags.includes(tag);
                return `
                  <button type="button" class="micro-tag-btn btn ${isSelected ? 'btn-primary' : 'btn-secondary'}" data-tag="${tag}" style="border-radius: 999px; font-size: 0.82rem; padding: 0.45rem 0.95rem;">
                    ${isSelected ? '✓ ' : ''}${tag}
                  </button>
                `;
              }).join('')}
            </div>

            <!-- Custom Tag Input -->
            <div style="display: flex; gap: 0.5rem; max-width: 100%;">
              <input id="input-custom-tag" type="text" class="form-input" style="padding: 0.5rem 0.75rem; font-size: 0.85rem;" placeholder="+ Type custom tag & press Enter">
              <button id="btn-add-custom-tag" type="button" class="btn btn-secondary" style="padding: 0.5rem 0.85rem; font-size: 0.82rem; white-space: nowrap;">
                Add Tag
              </button>
            </div>
          </div>
        </div>
      `;

    case 3:
      const useCases = [
        { id: 'viral', title: 'Going Viral & Entertainment', desc: 'Focus on high-reach formats, trending audio, and rapid engagement loops.', icon: '📢' },
        { id: 'authority', title: 'Building Authority & Niche Growth', desc: 'Create educational, deep-dive content to establish domain leadership.', icon: '🏆' },
        { id: 'monetize', title: 'Monetizing Brand Deals', desc: 'Optimize profile for sponsorships, calculate rate cards, and manage deals.', icon: '🤝' },
        { id: 'automation', title: 'Automating Content Production', desc: 'Leverage AI auto-subtitles, batch editing, and 1-click publishing.', icon: '🤖' }
      ];

      return `
        <div>
          <h1 style="font-size: clamp(1.6rem, 4vw, 2.4rem); margin-bottom: 0.5rem; letter-spacing: -0.02em;">What are you using KontentOS for?</h1>
          <p style="color: var(--text-muted); font-size: 0.95rem; margin-bottom: 1.5rem;">
            Select your primary objective. We'll optimize your workspace layout and AI suggestions.
          </p>

          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 1rem;">
            ${useCases.map(uc => `
              <div class="use-case-choice card" data-usecase="${uc.id}" style="cursor: pointer; padding: 1.25rem; display: flex; flex-direction: column; justify-content: space-between; min-height: 140px; background: var(--bg-surface-low); border: 1px solid var(--border-subtle); transition: all 0.2s ease;">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.75rem;">
                  <span style="font-size: 1.6rem;">${uc.icon}</span>
                  <div class="selection-circle" style="width: 20px; height: 20px; border-radius: 50%; border: 2px solid var(--border-subtle);"></div>
                </div>
                <div>
                  <h3 style="font-size: 1.05rem; margin-bottom: 0.35rem;">${uc.title}</h3>
                  <p style="font-size: 0.8rem; color: var(--text-muted); line-height: 1.35;">${uc.desc}</p>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `;

    case 4:
      const styles = [
        { id: 'short_form', title: 'Short-form Vertical', sub: '(Reels / Shorts / TikTok)', icon: '📱' },
        { id: 'long_form', title: 'Long-form Video', sub: 'Deep dives & tutorials', icon: '🎬' },
        { id: 'threads', title: 'Educational Threads & Articles', sub: 'Formatted carousels & text', icon: '📄' },
        { id: 'vlogs', title: 'Vlogs & Lifestyle Moods', sub: 'Daily life & aesthetic b-roll', icon: '☕' }
      ];

      return `
        <div>
          <h1 style="font-size: clamp(1.6rem, 4vw, 2.4rem); margin-bottom: 0.5rem; letter-spacing: -0.02em;">What do you like to create?</h1>
          <p style="color: var(--text-muted); font-size: 0.95rem; margin-bottom: 1.5rem;">
            Select your primary format. This configures your default raw-to-reel templates and subtitle styles.
          </p>

          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 1rem;">
            ${styles.map(st => `
              <div class="style-choice card" data-style="${st.id}" style="cursor: pointer; padding: 1.25rem; display: flex; flex-direction: column; justify-content: space-between; min-height: 130px; background: var(--bg-surface-low); border: 1px solid var(--border-subtle); transition: all 0.2s ease;">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.75rem;">
                  <span style="font-size: 1.6rem;">${st.icon}</span>
                  <div class="selection-circle" style="width: 20px; height: 20px; border-radius: 50%; border: 2px solid var(--border-subtle);"></div>
                </div>
                <div>
                  <h3 style="font-size: 1.05rem; margin-bottom: 0.25rem;">${st.title}</h3>
                  <p style="font-size: 0.8rem; color: var(--text-muted);">${st.sub}</p>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
  }
}

function attachStepEvents(container) {
  const nameInput = container.querySelector('#input-step-name');
  const igInput = container.querySelector('#input-step-ig');
  
  if (nameInput) {
    nameInput.addEventListener('input', (e) => {
      stateStore.updateProfile({ name: e.target.value }, true);
    });
  }

  if (igInput) {
    igInput.addEventListener('input', (e) => {
      stateStore.updateProfile({ handle: e.target.value }, true);
    });
  }

  // Step 2: Category Choice Click
  container.querySelectorAll('.category-choice').forEach(card => {
    card.addEventListener('click', () => {
      activeCategory = card.getAttribute('data-cat');
      stateStore.updateProfile({ proNiche: activeCategory }, true);
      renderOnboarding(container);
    });
  });

  // Step 2: Micro Tags Toggle Click
  container.querySelectorAll('.micro-tag-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tag = btn.getAttribute('data-tag');
      if (selectedMicroTags.includes(tag)) {
        selectedMicroTags = selectedMicroTags.filter(t => t !== tag);
      } else {
        if (selectedMicroTags.length < 5) {
          selectedMicroTags.push(tag);
        } else {
          alert('You can select up to 5 micro-niche tags.');
          return;
        }
      }
      renderOnboarding(container);
    });
  });

  // Step 2: Custom Tag Add
  const customTagInput = container.querySelector('#input-custom-tag');
  const btnAddCustomTag = container.querySelector('#btn-add-custom-tag');

  function addCustomTag() {
    if (customTagInput && customTagInput.value.trim()) {
      const newTag = customTagInput.value.trim();
      if (!selectedMicroTags.includes(newTag)) {
        if (selectedMicroTags.length < 5) {
          selectedMicroTags.push(newTag);
          if (!CATEGORY_TAG_MAP[activeCategory]) CATEGORY_TAG_MAP[activeCategory] = [];
          CATEGORY_TAG_MAP[activeCategory].unshift(newTag);
          customTagInput.value = '';
          renderOnboarding(container);
        } else {
          alert('You can select up to 5 micro-niche tags.');
        }
      }
    }
  }

  if (btnAddCustomTag) btnAddCustomTag.addEventListener('click', addCustomTag);
  if (customTagInput) {
    customTagInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        addCustomTag();
      }
    });
  }

  // Step 3: Use case choice
  container.querySelectorAll('.use-case-choice').forEach(card => {
    card.addEventListener('click', () => {
      const uc = card.getAttribute('data-usecase');
      stateStore.updateProfile({ mode: uc === 'viral' ? 'viral' : 'pro' }, true);
      container.querySelectorAll('.use-case-choice').forEach(c => {
        c.style.borderColor = 'var(--border-subtle)';
        c.querySelector('.selection-circle').style.background = 'transparent';
        c.querySelector('.selection-circle').style.borderColor = 'var(--border-subtle)';
      });
      card.style.borderColor = 'var(--accent-primary)';
      card.querySelector('.selection-circle').style.background = 'var(--accent-primary)';
      card.querySelector('.selection-circle').style.borderColor = 'var(--accent-primary)';
    });
  });

  // Step 4: Style choice
  container.querySelectorAll('.style-choice').forEach(card => {
    card.addEventListener('click', () => {
      container.querySelectorAll('.style-choice').forEach(c => {
        c.style.borderColor = 'var(--border-subtle)';
        c.querySelector('.selection-circle').style.background = 'transparent';
        c.querySelector('.selection-circle').style.borderColor = 'var(--border-subtle)';
      });
      card.style.borderColor = 'var(--accent-primary)';
      card.querySelector('.selection-circle').style.background = 'var(--accent-primary)';
      card.querySelector('.selection-circle').style.borderColor = 'var(--accent-primary)';
    });
  });

  // Wizard Navigation Buttons
  const nextBtn = container.querySelector('#btn-wizard-next');
  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      if (nameInput) stateStore.updateProfile({ name: nameInput.value }, true);
      if (igInput) stateStore.updateProfile({ handle: igInput.value }, true);
      stateStore.updateProfile({ proSubNiche: selectedMicroTags.join(', ') }, true);

      if (currentStep < 4) {
        currentStep++;
        renderOnboarding(container);
      }
    });
  }

  const backBtn = container.querySelector('#btn-wizard-back');
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      if (currentStep > 1) {
        currentStep--;
        renderOnboarding(container);
      }
    });
  }

  const finishBtn = container.querySelector('#btn-wizard-finish');
  if (finishBtn) {
    finishBtn.addEventListener('click', () => {
      stateStore.updateProfile({ proSubNiche: selectedMicroTags.join(', ') }, true);
      finishBtn.innerHTML = '<span>⚡ Initializing Workspace...</span>';
      setTimeout(() => {
        currentStep = 1;
        stateStore.setTab('dashboard');
      }, 400);
    });
  }
}
