// KontentOS — Idea Studio with High-Density Information Boxes, Radial Roulette & 10+ Trend Radar Options
import { stateStore, GEO_LOCALES } from '../state.js';
import { openScriptModal } from './script-modal.js';

// Extensive Master Idea Bank with Rich Hook Strategies & Micro-Typography
const MASTER_IDEAS_POOL = [
  // Comedy & POVs
  {
    category: 'comedy',
    badge: '98% MATCH',
    badgeColor: 'badge-neon',
    title: 'POV: Trying to explain your remote internet job to family in 2026',
    hookTip: 'Start with an exaggerated wide-eye stare. Cut rapidly between confusing tech buzzwords and bewildered elder reactions.',
    format: '15s POV Skit',
    velocity: '+94%'
  },
  {
    category: 'comedy',
    badge: 'HIGH RETENTION',
    badgeColor: 'badge-neon',
    title: 'Nobody at 2 AM on a Tuesday vs. Me at 2 AM on a Tuesday',
    hookTip: 'Use sudden dramatic sitting-up sound cue. Act out an existential breakthrough on a totally useless topic.',
    format: '12s Meme Cut',
    velocity: '+98%'
  },
  {
    category: 'comedy',
    badge: 'RELATABLE',
    badgeColor: 'badge-neon',
    title: 'The 4 stages of looking at your bank statement after the weekend',
    hookTip: '4 fast 3-second cuts: Denial, Calculation, Blaming inflation, and Ordering food anyway.',
    format: '15s 4-Split Skit',
    velocity: '+88%'
  },
  {
    category: 'comedy',
    badge: 'POV SKIT',
    badgeColor: 'badge-neon',
    title: 'When your manager says "Quick 2-minute sync" at 4:58 PM',
    hookTip: 'Instant punchline drop with camera slow zoom. Show hands freezing above the keyboard.',
    format: '10s Micro-Skit',
    velocity: '+96%'
  },
  {
    category: 'comedy',
    badge: 'RELATABLE',
    badgeColor: 'badge-neon',
    title: 'POV: Ordering food delivery when you promised yourself you would diet today',
    hookTip: 'Whispering to your food delivery app like it is a top-secret covert mission. Relatable audio sync.',
    format: '15s POV Skit',
    velocity: '+91%'
  },
  {
    category: 'comedy',
    badge: 'VIRAL SKIT',
    badgeColor: 'badge-neon',
    title: 'That one friend who calculates split bills down to the exact last cent',
    hookTip: 'Bring out an actual scientific calculator and notepad. Extreme deadpan comedic delivery.',
    format: '20s Dialogue Skit',
    velocity: '+89%'
  },
  {
    category: 'comedy',
    badge: 'POV MEME',
    badgeColor: 'badge-neon',
    title: 'The sheer panic of waking up and realizing your phone was not plugged in',
    hookTip: 'Heartbeat audio cue + slow motion reach toward the power outlet. Instant tension.',
    format: '10s Fast Reaction',
    velocity: '+95%'
  },
  {
    category: 'comedy',
    badge: 'FUNNY POV',
    badgeColor: 'badge-neon',
    title: 'Me explaining why I need 4 coffees to function for 2 hours of actual work',
    hookTip: 'Fast-paced hand gestures, pacing across the room, talking to imaginary coworkers.',
    format: '15s Audio Sync',
    velocity: '+87%'
  },

  // Viral Hooks & Hot Takes
  {
    category: 'viral',
    badge: 'VIRAL HOOK',
    badgeColor: 'badge-purple',
    title: '3 Things in daily life that feel illegal but actually are 100% legal',
    hookTip: 'Negative frame hook: "Stop paying for this..." Jump straight into item #1 within the first 1.2s.',
    format: '30s Fast Listicle',
    velocity: '+82%'
  },
  {
    category: 'viral',
    badge: 'HOT TAKE',
    badgeColor: 'badge-purple',
    title: "Unpopular Opinion: You don't need a huge budget to blow up in 2026",
    hookTip: 'Shake head directly into camera. Debunk 1 myth with cold numbers in bold animated yellow subtitles.',
    format: '30s Contrarian Hook',
    velocity: '+85%'
  },
  {
    category: 'viral',
    badge: 'RETENTION SPIKE',
    badgeColor: 'badge-purple',
    title: '3 Everyday habits that quietly drain 80% of your mental energy',
    hookTip: 'Visual physical demonstration (e.g. checking phone first thing in bed). Direct actionable replacement.',
    format: '25s Direct Camera',
    velocity: '+92%'
  },
  {
    category: 'viral',
    badge: 'CURIOSITY GAP',
    badgeColor: 'badge-purple',
    title: 'The psychological trick stores use that you fall for every single week',
    hookTip: 'Curiosity opening: "Ever wonder why milk is always at the back of the supermarket?" High retention.',
    format: '35s Breakdown',
    velocity: '+84%'
  },
  {
    category: 'viral',
    badge: 'PATTERN BREAK',
    badgeColor: 'badge-purple',
    title: "Stop doing THIS common morning mistake if you want real focus",
    hookTip: 'Show alarming stat on screen for 1 second. Fast cut to the correct 5-minute protocol.',
    format: '20s Jump Cut Reel',
    velocity: '+90%'
  },
  {
    category: 'viral',
    badge: 'FUTURE TAKE',
    badgeColor: 'badge-purple',
    title: '3 Things we use today that will look completely ancient by 2030',
    hookTip: 'Show plastic cards, physical keys, and multiple charger cables. Rapid energetic ranking.',
    format: '30s Fast Showcase',
    velocity: '+86%'
  },

  // Tech & AI Productivity
  {
    category: 'tech',
    badge: 'TRENDING',
    badgeColor: 'badge-cyan',
    title: 'Top 3 AI tools that will save you 10 hours this weekend',
    hookTip: 'Screen recording with bold circle highlights. Avoid fluffy intros; name the tool in second 2.',
    format: '45s Screen Demo',
    velocity: '+76%'
  },
  {
    category: 'tech',
    badge: 'QUICK WIN',
    badgeColor: 'badge-cyan',
    title: 'How I turned a 2-hour video editing workflow into a 30-second prompt',
    hookTip: 'Before & After side-by-side split screen. Contrast timeline chaos vs 1-click output.',
    format: '25s Workflow Reel',
    velocity: '+74%'
  },
  {
    category: 'tech',
    badge: 'AI WORKFLOW',
    badgeColor: 'badge-cyan',
    title: '3 Free websites that feel like a superpower for solo creators and freelancers',
    hookTip: 'Live URL typing b-roll + showing instant result. Emphasize "Free / No Credit Card".',
    format: '30s Listicle',
    velocity: '+88%'
  },
  {
    category: 'tech',
    badge: 'AUTOMATION',
    badgeColor: 'badge-cyan',
    title: 'How to automate your entire social media publishing pipeline in 15 minutes',
    hookTip: 'Show auto-sync animation across 6 platforms simultaneously. High shareability.',
    format: '40s Step-by-Step',
    velocity: '+79%'
  },
  {
    category: 'tech',
    badge: 'HIDDEN GEM',
    badgeColor: 'badge-cyan',
    title: '5 Hidden smartphone camera settings you probably did not know existed',
    hookTip: 'Physical phone in hand with finger tapping hidden menu. Immediate tactile interest.',
    format: '35s Tutorial',
    velocity: '+83%'
  },

  // Finance, Career & Hacks
  {
    category: 'finance',
    badge: 'HIGH RPM',
    badgeColor: 'badge-purple',
    title: 'If you have extra savings sitting idle in your account, do THIS today',
    hookTip: 'Direct eye contact. State the exact inflation loss percentage in the first 2 seconds.',
    format: '30s Direct-to-Camera',
    velocity: '+68%'
  },
  {
    category: 'finance',
    badge: 'SAVINGS HACK',
    badgeColor: 'badge-purple',
    title: 'The 50/30/20 budget rule explained for real people living on a tight budget',
    hookTip: 'Clean on-screen pie chart with 3 colored highlights. Relatable expenses breakdown.',
    format: '35s Breakdown',
    velocity: '+63%'
  },
  {
    category: 'finance',
    badge: 'WEALTH HACK',
    badgeColor: 'badge-purple',
    title: 'How freelancers are secretly charging 3x more using this one simple pitch',
    hookTip: 'Quote the exact email line that shifts pricing from hourly to value-based.',
    format: '30s Case Study',
    velocity: '+77%'
  },
  {
    category: 'finance',
    badge: 'CAREER TIP',
    badgeColor: 'badge-purple',
    title: 'The hidden rule of negotiating your salary that nobody ever teaches you',
    hookTip: '"Never say a number first." Act out the silence technique during an interview.',
    format: '25s Direct Advice',
    velocity: '+81%'
  },
  {
    category: 'finance',
    badge: 'MONEY MYTH',
    badgeColor: 'badge-purple',
    title: '3 Money mistakes I made in my early 20s that cost me thousands',
    hookTip: 'Vulnerable storytelling tone. "If I could send a 30-second video to my 20-year-old self..."',
    format: '40s Story Reel',
    velocity: '+89%'
  },

  // Lifestyle & Community
  {
    category: 'lifestyle',
    badge: 'AESTHETIC',
    badgeColor: 'badge-cyan',
    title: 'Day in the life: The realistic, unpolished morning routine of a creator',
    hookTip: 'Satisfying natural audio (ASMR espresso machine, desk setup, natural lighting).',
    format: '20s Mini-Vlog',
    velocity: '+59%'
  },
  {
    category: 'lifestyle',
    badge: 'STREET TALK',
    badgeColor: 'badge-cyan',
    title: 'Asking strangers on the street their #1 life rule right now',
    hookTip: 'Pass wireless lav mic into frame immediately. High curiosity and authentic responses.',
    format: '30s Micro-Interview',
    velocity: '+79%'
  },
  {
    category: 'lifestyle',
    badge: 'CHALLENGE',
    badgeColor: 'badge-cyan',
    title: 'The 7-day dopamine detox challenge that completely fixed my sleep and focus',
    hookTip: 'Show black-and-white screen mode + stack of books. Fast timeline comparison.',
    format: '30s Summary Reel',
    velocity: '+72%'
  },
  {
    category: 'lifestyle',
    badge: 'BEHIND SCENES',
    badgeColor: 'badge-cyan',
    title: 'Behind the scenes: The unglamorous 90% of filming content nobody shows',
    hookTip: 'Camera blunders, ring light falling, 14 takes on the opening line. Humorous cut.',
    format: '15s Reality Check',
    velocity: '+93%'
  }
];

// 10+ Live Creator Trend Radar Items Catalog
const TREND_RADAR_ITEMS = [
  {
    id: 'tr-1',
    topic: 'AI Productivity & Solo Work Automation Hacks',
    desc: 'Rapid screen demonstrations showing 1-click workflows have a +88% retention boost this week.',
    score: 96,
    comp: 'Low',
    velocity: '+88%',
    category: 'tech',
    format: '45s Screen Demo'
  },
  {
    id: 'tr-2',
    topic: 'Budget Living vs High-End Cafe Price Debates',
    desc: 'Relatable commentary comparing everyday expenses vs lifestyle inflation drives strong comment velocity.',
    score: 93,
    comp: 'Med',
    velocity: '+112%',
    category: 'comedy',
    format: '15s POV Skit'
  },
  {
    id: 'tr-3',
    topic: 'Street Interviews: "What is your biggest regret in your 20s?"',
    desc: 'Microphone pass interviews capturing authentic street wisdom consistently cross 1M+ views.',
    score: 95,
    comp: 'Med',
    velocity: '+105%',
    category: 'lifestyle',
    format: '30s Street Mic'
  },
  {
    id: 'tr-4',
    topic: 'Late Night Existential Banter & Relatable POVs',
    desc: 'Short comedic thoughts recorded in casual room lighting hitting viral FYP discovery waves.',
    score: 97,
    comp: 'Low',
    velocity: '+120%',
    category: 'comedy',
    format: '12s Meme Cut'
  },
  {
    id: 'tr-5',
    topic: 'How Independent Creators are Monetizing in 2026',
    desc: 'Transparent breakdown of multi-platform CPMs, brand deals, and direct sponsor rates.',
    score: 89,
    comp: 'Low',
    velocity: '+64%',
    category: 'finance',
    format: '35s Breakdown'
  },
  {
    id: 'tr-6',
    topic: 'The 3-Second Visual Hook: Kinetic Text & Sound Sync',
    desc: 'Creators using high-energy animated word-by-word captions showing 82% longer muted watch times.',
    score: 94,
    comp: 'Low',
    velocity: '+91%',
    category: 'tech',
    format: '20s Hook Guide'
  },
  {
    id: 'tr-7',
    topic: 'Freelancer Pricing Shift: Hourly vs Fixed Retainers',
    desc: 'Career and solo service providers scaling client contracts with value-based pitching scripts.',
    score: 91,
    comp: 'Med',
    velocity: '+85%',
    category: 'finance',
    format: '30s Advice Reel'
  },
  {
    id: 'tr-8',
    topic: 'Dopamine Detox & Offline Living Micro-Vlogs',
    desc: 'Aesthetic minimal lifestyle b-roll documenting screen-free weekends and intentional habits.',
    score: 88,
    comp: 'Low',
    velocity: '+71%',
    category: 'lifestyle',
    format: '25s Mini-Vlog'
  },
  {
    id: 'tr-9',
    topic: 'Office Tech Satire: Corporate Jargon Deconstructed',
    desc: 'Translating corporate emails into what people actually mean has high share-to-DM ratios.',
    score: 92,
    comp: 'Med',
    velocity: '+98%',
    category: 'comedy',
    format: '15s 2-Person Skit'
  },
  {
    id: 'tr-10',
    topic: 'Soundtrack Waves: High-Energy Phonk & Ambient Lofi',
    desc: 'Syncing jump cuts to rising bass drops boosts completion rates by 34% across short-form vertical.',
    score: 90,
    comp: 'Low',
    velocity: '+83%',
    category: 'viral',
    format: 'Audio Beat Sync'
  }
];

export function renderIdeaStudio(container) {
  const state = stateStore.get();
  const profile = state.creatorProfile;
  const locale = GEO_LOCALES[state.geo] || GEO_LOCALES.IN;

  const rouletteSectors = [
    {
      label: "POV SKIT",
      color: "#3c6e7a",
      textColor: "#ffffff",
      title: "Record a 15-second POV of the most relatable annoying thing that happened this week",
      hook: "Deadpan stare into camera with relatable sound cue",
      format: "15s POV Skit",
      velocity: "+97% Retention"
    },
    {
      label: "REACTION",
      color: "#6b5b95",
      textColor: "#ffffff",
      title: "Film your immediate, unfiltered reaction to today's trending headline",
      hook: "Show immediate shock or laughter in the first 0.8s",
      format: "15s Reaction Reel",
      velocity: "+94% Retention"
    },
    {
      label: "LISTICLE",
      color: "#4d7c5f",
      textColor: "#ffffff",
      title: "Do a '3 things that are 100% overrated in 2026' rapid-fire ranking",
      hook: "Start directly with #3 without introducing yourself",
      format: "30s Listicle",
      velocity: "+89% Retention"
    },
    {
      label: "BEHIND SCENES",
      color: "#b08233",
      textColor: "#ffffff",
      title: "Film a 'Behind the scenes: What I actually do vs what people think I do' clip",
      hook: "Split screen contrast between expectation & reality",
      format: "20s B-Roll Cut",
      velocity: "+92% Retention"
    },
    {
      label: "CONTRARIAN",
      color: "#b4503f",
      textColor: "#ffffff",
      title: "Unpopular Opinion: Why everyone is wrong about this trending topic",
      hook: "Shake your head and speak with strong contrarian conviction",
      format: "30s Contrarian POV",
      velocity: "+95% Retention"
    },
    {
      label: "STREET TALK",
      color: "#5b8a9c",
      textColor: "#ffffff",
      title: "Ask a stranger or friend a brutally honest question on camera",
      hook: "Pass the microphone in the first 0.5s",
      format: "25s Street Interview",
      velocity: "+91% Retention"
    },
    {
      label: "MEME CUT",
      color: "#7d6b8f",
      textColor: "#ffffff",
      title: "'Nobody at 2 AM vs. Me at 2 AM': Act out a sudden late-night realization",
      hook: "Sudden sitting up in bed with dramatic sound effect",
      format: "12s Meme Cut",
      velocity: "+98% Retention"
    },
    {
      label: "LATE NIGHT",
      color: "#a86a4a",
      textColor: "#ffffff",
      title: "Record a 30-second breakdown of why this common habit is wasting hours",
      hook: "Hold up a prop or point to screen text immediately",
      format: "30s Breakdown",
      velocity: "+86% Retention"
    }
  ];

  function generateShuffledIdeas() {
    const shuffled = [...MASTER_IDEAS_POOL].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, 12);
  }

  let currentDailyIdeas = generateShuffledIdeas();
  let activeFilter = 'all';

  function getFilteredIdeas() {
    if (activeFilter === 'all') return currentDailyIdeas;
    return currentDailyIdeas.filter(i => i.category === activeFilter);
  }

  function generateSvgWheel() {
    const cx = 120;
    const cy = 120;
    const r = 110;
    const totalSectors = 8;
    const angleStep = 360 / totalSectors;

    let svgPaths = '';
    let svgTexts = '';

    rouletteSectors.forEach((sec, i) => {
      const startAngleDeg = i * angleStep - 90;
      const endAngleDeg = (i + 1) * angleStep - 90;
      const midAngleDeg = (i + 0.5) * angleStep - 90;

      const startAngle = startAngleDeg * (Math.PI / 180);
      const endAngle = endAngleDeg * (Math.PI / 180);

      const x1 = cx + r * Math.cos(startAngle);
      const y1 = cy + r * Math.sin(startAngle);
      const x2 = cx + r * Math.cos(endAngle);
      const y2 = cy + r * Math.sin(endAngle);

      svgPaths += `
        <path d="M ${cx} ${cy} L ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z" 
              fill="${sec.color}" 
              stroke="rgba(0,0,0,0.35)" 
              stroke-width="1.5" />
      `;

      svgTexts += `
        <g transform="rotate(${midAngleDeg.toFixed(2)}, ${cx}, ${cy})">
          <text x="${cx + 68}" y="${cy + 3.5}" 
                fill="${sec.textColor}" 
                font-size="8" 
                font-family="'Montserrat', 'Inter', system-ui, sans-serif" 
                font-weight="900" 
                letter-spacing="0.06em"
                text-anchor="middle" 
                alignment-baseline="middle"
                style="text-shadow: 0 1px 3px rgba(0,0,0,0.9); text-transform: uppercase;">
            ${sec.label}
          </text>
        </g>
      `;
    });

    return `
      <svg width="240" height="240" viewBox="0 0 240 240" id="roulette-wheel-svg" style="transform-origin: 120px 120px; transition: transform 3.2s cubic-bezier(0.15, 0.9, 0.2, 1); filter: drop-shadow(0 6px 16px rgba(0,0,0,0.4)); cursor: pointer;">
        <circle cx="120" cy="120" r="116" fill="none" stroke="var(--border-subtle)" stroke-width="4"/>
        ${svgPaths}
        ${svgTexts}
        <!-- Center Hub -->
        <circle cx="120" cy="120" r="28" fill="var(--bg-surface-card)" stroke="var(--border-glass)" stroke-width="3"/>
        <text x="120" y="123" fill="var(--accent-primary)" font-size="10" font-weight="900" text-anchor="middle" alignment-baseline="middle" font-family="'Montserrat', sans-serif">⚡ SPIN</text>
      </svg>
    `;
  }

  container.innerHTML = `
    <div class="content-container">
      <!-- Header -->
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1.5rem; flex-wrap: wrap; gap: 1rem;">
        <div>
          <h1 style="font-size: 2rem;">💡 Creator Radar & Idea Studio</h1>
          <p style="color: var(--text-muted); font-size: 0.92rem;">
            Real-time viral benchmarks, high-retention recording prompts, and actionable hook execution tips.
          </p>
        </div>

        <div style="display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap;">
          <button id="btn-open-ai-script-studio" class="btn btn-primary" style="box-shadow: 0 0 16px var(--accent-primary-glow); font-weight: 800;">
            <span>✨ AI Script & Multi-Format Studio</span>
          </button>
          <button id="btn-studio-direct" class="btn btn-secondary">
            <span>⚡ Drop Raw Video</span>
          </button>
        </div>
      </div>

      <!-- Top Section: 10+ Create This Today Compact Box Grid with Regenerate Button -->
      <div class="card" style="margin-bottom: 2rem;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.25rem; flex-wrap: wrap; gap: 0.75rem;">
          <div style="display: flex; align-items: center; gap: 0.5rem;">
            <h2 style="font-size: 1.25rem;">🎯 Create This Today</h2>
            <span class="badge badge-purple desktop-only" id="badge-prompt-count">${currentDailyIdeas.length} FRESH PROMPTS</span>
          </div>

          <!-- Controls: Category Filter Pills & Regenerate CTA -->
          <div style="display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap;">
            <div style="display: flex; gap: 0.35rem; flex-wrap: wrap;" id="idea-filter-group">
              <button class="btn ${activeFilter === 'all' ? 'btn-primary' : 'btn-secondary'} btn-filter" data-filter="all" style="padding: 0.3rem 0.75rem; font-size: 0.78rem; border-radius: 999px;">
                All
              </button>
              <button class="btn ${activeFilter === 'comedy' ? 'btn-primary' : 'btn-secondary'} btn-filter" data-filter="comedy" style="padding: 0.3rem 0.75rem; font-size: 0.78rem; border-radius: 999px;">
                🎭 Comedy & POVs
              </button>
              <button class="btn ${activeFilter === 'viral' ? 'btn-primary' : 'btn-secondary'} btn-filter" data-filter="viral" style="padding: 0.3rem 0.75rem; font-size: 0.78rem; border-radius: 999px;">
                🔥 Viral Hooks
              </button>
              <button class="btn ${activeFilter === 'tech' ? 'btn-primary' : 'btn-secondary'} btn-filter" data-filter="tech" style="padding: 0.3rem 0.75rem; font-size: 0.78rem; border-radius: 999px;">
                💻 Tech & AI
              </button>
              <button class="btn ${activeFilter === 'finance' ? 'btn-primary' : 'btn-secondary'} btn-filter" data-filter="finance" style="padding: 0.3rem 0.75rem; font-size: 0.78rem; border-radius: 999px;">
                📈 Finance & Hacks
              </button>
            </div>

            <!-- Regenerate Button with Distinct Color Styling -->
            <button id="btn-regenerate-ideas" class="btn btn-regenerate" style="padding: 0.35rem 0.95rem; font-size: 0.82rem;" title="Generate 12 fresh ideas">
              <span id="regenerate-icon">🔄</span>
              <span>Regenerate Ideas</span>
            </button>
          </div>
        </div>

        <!-- 10+ Compact Smaller Box Grid (Optimized Small Text for Rich Content Density) -->
        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(265px, 1fr)); gap: 0.85rem;" id="compact-ideas-grid">
          ${renderCompactBoxes(getFilteredIdeas())}
        </div>
      </div>

      <!-- Bento Grid Lower Row: Interactive Labeled Radial Spinner Roulette & 10+ Live Trend Radar Options -->
      <div class="bento-grid" style="margin-bottom: 2rem;">
        
        <!-- Left: Interactive Roulette Spinner Wheel with Radial Labeled Wedges -->
        <div class="card card-glow" style="grid-column: span 5; background: var(--bg-surface-card); display: flex; flex-direction: column; justify-content: space-between;">
          <div>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
              <h3 style="font-size: 1.15rem; display: flex; align-items: center; gap: 0.4rem;">
                <span>🎲 Viral Idea Roulette</span>
              </h3>
              <span class="badge badge-neon desktop-only">RADIAL WHEEL</span>
            </div>
            <p style="color: var(--text-muted); font-size: 0.8rem; margin-bottom: 1.25rem;">
              Hit spin to randomize across 8 viral formats. The wheel will land on your recording challenge for today.
            </p>

            <!-- Radial Labeled Spinner Wheel Graphic Container -->
            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; position: relative; margin-bottom: 1.25rem;">
              <!-- Pointer Arrow -->
              <div style="position: absolute; top: -14px; z-index: 20; font-size: 1.7rem; color: var(--accent-primary); filter: drop-shadow(0 2px 4px rgba(0,0,0,0.6));">
                ▼
              </div>

              <!-- Labeled Radial SVG Wheel -->
              ${generateSvgWheel()}
            </div>

            <!-- Shortlisted Result Box -->
            <div id="roulette-result-box" style="background: var(--bg-surface-low); border: 1px solid var(--border-subtle); border-radius: 12px; padding: 1.15rem; min-height: 100px; display: flex; flex-direction: column; justify-content: center; text-align: center; transition: all 0.3s ease;">
              <div id="roulette-status-text" style="font-size: 0.75rem; font-weight: 700; text-transform: uppercase; color: var(--accent-primary); margin-bottom: 0.35rem;">
                Ready to Spin
              </div>
              <div id="roulette-idea-title" style="font-size: 0.88rem; font-weight: 700; color: var(--text-main); line-height: 1.35;">
                "Click 'Spin Roulette' to spin the 8-format wheel"
              </div>
              <div id="roulette-idea-hook" style="font-size: 0.72rem; color: var(--text-dim); margin-top: 0.35rem; display: none; line-height: 1.35;">
              </div>
            </div>
          </div>

          <div style="display: flex; gap: 0.5rem; margin-top: 1.25rem;">
            <button id="btn-spin-roulette" class="btn btn-primary" style="flex: 1; padding: 0.75rem;">
              <span>🔄 Spin Roulette</span>
            </button>
            <button id="btn-record-idea" class="btn btn-secondary" style="display: none; padding: 0.75rem 1.25rem;">
              <span>⚡ Script / Record</span>
            </button>
          </div>
        </div>

        <!-- Right: 10+ Live Creator Trend Radar Items with Scrollable High-Density List -->
        <div class="card" style="grid-column: span 7; display: flex; flex-direction: column;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; flex-wrap: wrap; gap: 0.5rem;">
            <div style="display: flex; align-items: center; gap: 0.5rem;">
              <h3 style="font-size: 1.15rem;">🔥 Live Creator Trend Radar</h3>
              <span class="badge badge-neon desktop-only">${TREND_RADAR_ITEMS.length} TRENDS LIVE</span>
            </div>
            <span class="desktop-only" style="font-size: 0.72rem; color: var(--text-dim); font-weight: 600;">ALGORITHMIC VELOCITY</span>
          </div>
          
          <!-- Scrollable Trend List (10+ Items) -->
          <div style="display: flex; flex-direction: column; gap: 0.65rem; max-height: 520px; overflow-y: auto; padding-right: 4px;" id="trend-radar-list">
            ${TREND_RADAR_ITEMS.map(item => `
              <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.75rem 0.85rem; background: var(--bg-surface-low); border-radius: 10px; border: 1px solid var(--border-subtle); gap: 0.75rem; transition: border-color 0.2s ease;">
                <div style="flex: 1;">
                  <div style="display: flex; align-items: center; gap: 0.45rem; margin-bottom: 0.2rem;">
                    <span class="badge badge-purple desktop-only" style="font-size: 0.6rem; padding: 1px 6px;">${item.format}</span>
                    <strong style="font-size: 0.84rem; color: var(--text-main); line-height: 1.3;">${item.topic}</strong>
                  </div>
                  <div style="font-size: 0.72rem; color: var(--text-muted); line-height: 1.35; margin-bottom: 0.25rem;">
                    ${item.desc}
                  </div>
                  <div style="font-size: 0.68rem; color: var(--text-dim);">
                    Competition: <span style="color: var(--accent-secondary); font-weight: 600;">${item.comp}</span> • Audience Velocity: <span style="color: var(--accent-cyan); font-weight: 700;">${item.velocity}</span>
                  </div>
                </div>

                <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 0.35rem; min-width: 65px;">
                  <div style="text-align: right;">
                    <div style="font-size: 1.05rem; font-weight: 800; color: var(--accent-primary); line-height: 1;">${item.score}/100</div>
                    <div style="font-size: 0.58rem; color: var(--text-dim); text-transform: uppercase;">Score</div>
                  </div>
                  <button class="btn btn-secondary btn-create-script" data-topic="${item.topic}" style="padding: 0.28rem 0.6rem; font-size: 0.72rem; border-radius: 6px;">
                    <span>⚡ Create</span>
                  </button>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    </div>
  `;

  // Render Compact Boxes with Smaller Text & Actionable Hook Advice
  function renderCompactBoxes(ideas) {
    if (ideas.length === 0) {
      return `
        <div style="grid-column: 1 / -1; padding: 2rem; text-align: center; color: var(--text-muted); font-size: 0.85rem;">
          No ideas found in this category. Click <strong>"Regenerate Ideas"</strong> to refresh.
        </div>
      `;
    }

    return ideas.map(idea => `
      <div class="card" style="background: var(--bg-surface-low); border: 1px solid var(--border-subtle); border-radius: 12px; padding: 0.85rem; display: flex; flex-direction: column; justify-content: space-between; min-height: 155px; transition: transform 0.15s ease, border-color 0.15s ease;">
        <div>
          <!-- Header Badge & Velocity -->
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.45rem;">
            <span class="badge ${idea.badgeColor} desktop-only" style="font-size: 0.6rem; padding: 1px 6px;">
              ${idea.badge}
            </span>
            <span style="font-size: 0.65rem; color: var(--accent-primary); font-weight: 800;">
              ${idea.velocity}
            </span>
          </div>

          <!-- Prompt Title in Smaller Crisp Typography -->
          <div style="font-size: 0.82rem; font-weight: 700; line-height: 1.3; margin-bottom: 0.35rem; color: var(--text-main);">
            ${idea.title}
          </div>

          <!-- Actionable Hook Strategy Context -->
          <div style="font-size: 0.71rem; color: var(--text-muted); line-height: 1.35; margin-bottom: 0.5rem;">
            <strong>Hook Tip:</strong> ${idea.hookTip || 'Start immediately with a pattern interrupt and bold captions.'}
          </div>
        </div>

        <!-- Card Footer -->
        <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--border-subtle); padding-top: 0.45rem; margin-top: 0.25rem;">
          <div style="font-size: 0.68rem; color: var(--text-dim); font-weight: 600;">
            ${idea.format}
          </div>
          <button class="btn btn-primary btn-create-script" data-topic="${idea.title}" style="padding: 0.25rem 0.65rem; font-size: 0.72rem; border-radius: 6px;">
            <span>⚡ Script</span>
          </button>
        </div>
      </div>
    `).join('');
  }

  // Attach card script triggers
  function attachCardEvents() {
    container.querySelectorAll('.btn-create-script').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const topic = btn.getAttribute('data-topic');
        openScriptModal({ topic, autoGenerate: true });
      });
    });
  }

  attachCardEvents();

  // Filter Buttons
  container.querySelectorAll('.btn-filter').forEach(btn => {
    btn.addEventListener('click', () => {
      activeFilter = btn.getAttribute('data-filter');
      container.querySelectorAll('.btn-filter').forEach(b => {
        b.classList.remove('btn-primary');
        b.classList.add('btn-secondary');
      });
      btn.classList.add('btn-primary');
      btn.classList.remove('btn-secondary');

      const grid = container.querySelector('#compact-ideas-grid');
      if (grid) {
        grid.innerHTML = renderCompactBoxes(getFilteredIdeas());
        attachCardEvents();
      }
    });
  });

  // Regenerate Ideas Action
  const btnRegenerate = container.querySelector('#btn-regenerate-ideas');

  if (btnRegenerate) {
    btnRegenerate.addEventListener('click', () => {
      btnRegenerate.disabled = true;
      btnRegenerate.innerHTML = `<span>⚡ Generating...</span>`;

      setTimeout(() => {
        currentDailyIdeas = generateShuffledIdeas();
        const grid = container.querySelector('#compact-ideas-grid');
        if (grid) {
          grid.style.opacity = '0';
          setTimeout(() => {
            grid.innerHTML = renderCompactBoxes(getFilteredIdeas());
            grid.style.opacity = '1';
            grid.style.transition = 'opacity 0.25s ease';
            attachCardEvents();
          }, 150);
        }

        btnRegenerate.disabled = false;
        btnRegenerate.innerHTML = `<span>🔄 Regenerate Ideas</span>`;
      }, 450);
    });
  }

  // Roulette Spinning Wheel Logic with Exact Radial Wedge Alignment
  let currentRotation = 0;
  let isSpinning = false;
  const btnSpin = container.querySelector('#btn-spin-roulette');
  const wheelSvg = container.querySelector('#roulette-wheel-svg');
  const resultBox = container.querySelector('#roulette-result-box');
  const statusText = container.querySelector('#roulette-status-text');
  const ideaTitle = container.querySelector('#roulette-idea-title');
  const ideaHook = container.querySelector('#roulette-idea-hook');
  const btnRecord = container.querySelector('#btn-record-idea');

  function spinWheelAction() {
    if (isSpinning) return;
    isSpinning = true;
    btnSpin.disabled = true;
    btnSpin.innerHTML = '<span>⚡ Spinning Wheel...</span>';
    btnRecord.style.display = 'none';

    const winningIndex = Math.floor(Math.random() * rouletteSectors.length);
    const winner = rouletteSectors[winningIndex];

    const sectorAngle = 360 / rouletteSectors.length;
    const targetOffset = 360 - (winningIndex * sectorAngle + sectorAngle / 2);
    const extraRounds = (6 + Math.floor(Math.random() * 3)) * 360;
    
    const baseRotation = Math.ceil(currentRotation / 360) * 360;
    currentRotation = baseRotation + extraRounds + targetOffset;

    wheelSvg.style.transform = `rotate(${currentRotation}deg)`;

    let ticks = 0;
    const tickPhrases = [
      'Scanning viral hooks...',
      'Matching high-retention formats...',
      'Filtering audience velocity...',
      'Locking onto winning prompt...'
    ];
    statusText.textContent = 'SPINNING';
    statusText.style.color = 'var(--accent-gold)';

    const tickInterval = setInterval(() => {
      ideaTitle.textContent = tickPhrases[ticks % tickPhrases.length];
      ticks++;
    }, 400);

    setTimeout(() => {
      clearInterval(tickInterval);
      isSpinning = false;
      btnSpin.disabled = false;
      btnSpin.innerHTML = '<span>🔄 Spin Again</span>';

      statusText.innerHTML = `🎉 LANDED ON: <strong style="color: ${winner.color}; text-shadow: 0 0 8px rgba(0,0,0,0.5);">${winner.label}</strong> • <span style="color: var(--accent-secondary);">${winner.velocity}</span>`;
      statusText.style.color = 'var(--accent-secondary)';
      ideaTitle.innerHTML = `"${winner.title}"`;
      ideaHook.style.display = 'block';
      ideaHook.innerHTML = `<strong>Hook Tip:</strong> ${winner.hook} • <em>${winner.format}</em>`;
      
      resultBox.style.borderColor = winner.color;
      resultBox.style.background = 'var(--bg-surface-high)';

      btnRecord.style.display = 'inline-flex';
      btnRecord.classList.add('btn-neon');
    }, 3200);
  }

  if (btnSpin) btnSpin.addEventListener('click', spinWheelAction);
  if (wheelSvg) wheelSvg.addEventListener('click', spinWheelAction);

  if (btnRecord) {
    btnRecord.addEventListener('click', () => {
      const topic = (ideaTitle ? ideaTitle.textContent : '').replace(/^"|"$/g, '').trim();
      openScriptModal({ topic, autoGenerate: true });
    });
  }

  const btnOpenScriptStudio = container.querySelector('#btn-open-ai-script-studio');
  if (btnOpenScriptStudio) {
    btnOpenScriptStudio.addEventListener('click', () => {
      openScriptModal();
    });
  }

  const btnStudioDirect = container.querySelector('#btn-studio-direct');
  if (btnStudioDirect) {
    btnStudioDirect.addEventListener('click', () => stateStore.setTab('studio'));
  }
}
