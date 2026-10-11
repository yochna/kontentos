// KontentOS — Pro Post Schedule Planner Component
import { stateStore } from '../state.js';
import { api } from '../api.js';

let currentViewMode = 'calendar'; // 'calendar' | 'queue'
let selectedFilterPlatform = 'all'; // 'all' | 'instagram' | 'tiktok' | 'youtube' | 'linkedin' | 'x'
let activeCalendarDate = new Date(); // current month focus
let selectedMobileDate = formatLocalDateKey(new Date()); // active selected date on mobile calendar
let scheduledPostsCache = [];
let videoLibraryCache = [];

export function formatLocalDateKey(d) {
  if (!d) return '';
  const date = (d instanceof Date) ? d : new Date(d);
  if (isNaN(date.getTime())) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getPlannerContainer(container) {
  if (container && typeof container.querySelector === 'function') return container;
  const active = document.getElementById('active-view-container');
  if (active) return active;
  const wrapper = document.querySelector('.planner-wrapper');
  if (wrapper && wrapper.parentElement) return wrapper.parentElement;
  return document.body;
}

export async function renderSchedulePlanner(container) {
  const target = getPlannerContainer(container);

  // Inject scoped styles for drag & drop, device mockup animations, and layout
  injectPlannerStyles();

  target.innerHTML = `
    <div class="planner-wrapper" style="padding: clamp(12px, 3vw, 24px); max-width: 1400px; margin: 0 auto; color: var(--fg, #ffffff);">
      
      <!-- Top Banner / Header -->
      <div style="display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 16px; margin-bottom: 24px;">
        <div>
          <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
            <h1 style="font-size: clamp(20px, 4vw, 26px); font-weight: 800; margin: 0; letter-spacing: -0.5px;">📅 Post Schedule Planner</h1>
            <span class="desktop-only" style="background: rgba(16, 185, 129, 0.15); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.3); font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: 20px; text-transform: uppercase;">
              Live Cross-Posting
            </span>
            <span class="desktop-only" style="background: rgba(99, 102, 241, 0.15); color: #818cf8; border: 1px solid rgba(99, 102, 241, 0.3); font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: 20px;">
              Drag & Drop Enabled
            </span>
          </div>
          <p style="color: var(--muted, #94a3b8); margin: 6px 0 0 0; font-size: 14px;">
            Plan, organize, edit, and auto-dispatch short-form reels across channels at peak engagement times.
          </p>
        </div>

        <div style="display: flex; gap: 10px; align-items: center;">
          <button id="planner-btn-schedule-new" class="btn-primary" style="display: inline-flex; align-items: center; justify-content: center; gap: 8px; background: linear-gradient(135deg, #6366f1, #a855f7); color: #ffffff; border: none; font-weight: 700; font-size: 14px; padding: 12px 20px; border-radius: 12px; cursor: pointer; box-shadow: 0 4px 14px rgba(99, 102, 241, 0.35); transition: transform 0.15s ease; min-height: 44px;">
            <span>✨ Schedule New Post</span>
          </button>
        </div>
      </div>

      <!-- Stats Bar -->
      <div id="planner-stats-bar" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 14px; margin-bottom: 24px;">
        <div style="background: var(--card-bg, rgba(30, 41, 59, 0.7)); border: 1px solid var(--border-color, rgba(255, 255, 255, 0.1)); padding: 14px 18px; border-radius: 14px;">
          <div style="font-size: 11px; color: var(--muted, #94a3b8); font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Scheduled Queue</div>
          <div id="stat-total-count" style="font-size: 22px; font-weight: 800; color: #38bdf8; margin-top: 4px;">Loading...</div>
        </div>

        <div style="background: var(--card-bg, rgba(30, 41, 59, 0.7)); border: 1px solid var(--border-color, rgba(255, 255, 255, 0.1)); padding: 14px 18px; border-radius: 14px;">
          <div style="font-size: 11px; color: var(--muted, #94a3b8); font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Next Scheduled Slot</div>
          <div id="stat-next-slot" style="font-size: 14px; font-weight: 700; color: #10b981; margin-top: 6px;">--</div>
        </div>

        <div style="background: var(--card-bg, rgba(30, 41, 59, 0.7)); border: 1px solid var(--border-color, rgba(255, 255, 255, 0.1)); padding: 14px 18px; border-radius: 14px;">
          <div style="font-size: 11px; color: var(--muted, #94a3b8); font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Optimal Virality Slot</div>
          <div style="font-size: 14px; font-weight: 700; color: #f59e0b; margin-top: 6px;">🔥 6:00 PM - 8:30 PM</div>
        </div>

        <div style="background: var(--card-bg, rgba(30, 41, 59, 0.7)); border: 1px solid var(--border-color, rgba(255, 255, 255, 0.1)); padding: 14px 18px; border-radius: 14px;">
          <div style="font-size: 11px; color: var(--muted, #94a3b8); font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Target Timezone</div>
          <div style="font-size: 13px; font-weight: 600; color: #e2e8f0; margin-top: 6px;">
            🌐 ${Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata'}
          </div>
        </div>
      </div>

      <!-- Controls Header (View Toggle & Platform Filters) -->
      <div style="display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 14px; background: var(--card-bg, rgba(30, 41, 59, 0.5)); border: 1px solid var(--border-color, rgba(255, 255, 255, 0.1)); padding: 12px 16px; border-radius: 14px; margin-bottom: 24px;">
        
        <!-- View Toggle Pills -->
        <div style="display: flex; align-items: center; background: rgba(15, 23, 42, 0.6); padding: 4px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.08);">
          <button id="view-mode-calendar" class="planner-view-btn ${currentViewMode === 'calendar' ? 'active' : ''}" style="padding: 8px 14px; border-radius: 8px; border: none; font-size: 13px; font-weight: 700; cursor: pointer; transition: all 0.15s ease; min-height: 38px; background: ${currentViewMode === 'calendar' ? '#6366f1' : 'transparent'}; color: ${currentViewMode === 'calendar' ? '#ffffff' : '#94a3b8'};">
            📅 Calendar
          </button>
          <button id="view-mode-queue" class="planner-view-btn ${currentViewMode === 'queue' ? 'active' : ''}" style="padding: 8px 14px; border-radius: 8px; border: none; font-size: 13px; font-weight: 700; cursor: pointer; transition: all 0.15s ease; min-height: 38px; background: ${currentViewMode === 'queue' ? '#6366f1' : 'transparent'}; color: ${currentViewMode === 'queue' ? '#ffffff' : '#94a3b8'};">
            📋 Queue
          </button>
        </div>

        <!-- Month Navigation (visible in desktop view) -->
        <div id="calendar-month-controls" class="desktop-only" style="display: ${currentViewMode === 'calendar' ? 'flex' : 'none'}; align-items: center; gap: 12px;">
          <button id="btn-prev-month" style="background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); color: #fff; width: 34px; height: 34px; border-radius: 8px; font-weight: bold; cursor: pointer;">‹</button>
          <span id="calendar-month-label" style="font-size: 16px; font-weight: 800; min-width: 140px; text-align: center;">${activeCalendarDate.toLocaleDateString([], { month: 'long', year: 'numeric' })}</span>
          <button id="btn-next-month" style="background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); color: #fff; width: 34px; height: 34px; border-radius: 8px; font-weight: bold; cursor: pointer;">›</button>
          <button id="btn-today-month" style="background: rgba(99, 102, 241, 0.2); border: 1px solid rgba(99, 102, 241, 0.4); color: #818cf8; font-size: 12px; font-weight: 700; padding: 6px 12px; border-radius: 8px; cursor: pointer;">Today</button>
        </div>

        <!-- Platform Filter Chips (Scrollable horizontal strip on mobile) -->
        <div class="mobile-chip-scroll platform-chips-scroll" style="display: flex; align-items: center; gap: 8px; max-width: 100%; overflow-x: auto; padding-bottom: 2px;">
          ${renderPlatformFilterChip('all', 'All Platforms')}
          ${renderPlatformFilterChip('instagram', '📸 Instagram')}
          ${renderPlatformFilterChip('tiktok', '🎵 TikTok')}
          ${renderPlatformFilterChip('youtube', '▶️ Shorts')}
          ${renderPlatformFilterChip('linkedin', '💼 LinkedIn')}
          ${renderPlatformFilterChip('x', '🪶 X')}
          ${renderPlatformFilterChip('threads', '🧵 Threads')}
          ${renderPlatformFilterChip('facebook', '📘 Facebook')}
        </div>
      </div>

      <!-- Main Content Container (Calendar or Queue) -->
      <div id="planner-main-content">
        <!-- Rendered dynamically -->
      </div>

      <!-- Peak Slots Recommendation Widget -->
      <div style="margin-top: 32px; background: linear-gradient(135deg, rgba(30, 41, 59, 0.8), rgba(15, 23, 42, 0.9)); border: 1px solid rgba(168, 85, 247, 0.25); border-radius: 16px; padding: 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.3);">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; flex-wrap: wrap; gap: 12px;">
          <div>
            <h3 style="margin: 0; font-size: 16px; font-weight: 800; color: #f8fafc; display: flex; align-items: center; gap: 8px;">
              ⚡ AI Virality Window Recommendations
            </h3>
            <p style="margin: 4px 0 0 0; font-size: 13px; color: #94a3b8;">
              Recommended posting windows calculated based on regional audience activity peaks.
            </p>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 14px;">
          <div style="background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(255, 255, 255, 0.08); padding: 14px; border-radius: 12px; display: flex; justify-content: space-between; align-items: center;">
            <div>
              <div style="font-size: 13px; font-weight: 700; color: #e1306c;">📸 Instagram Reels</div>
              <div style="font-size: 14px; font-weight: 800; margin-top: 2px;">6:00 PM - 8:00 PM</div>
              <div style="font-size: 11px; color: #10b981; margin-top: 2px;">+38% Reach Multiplier</div>
            </div>
            <button class="btn-quick-schedule-preset" data-platform="instagram" data-time="18:00" style="background: rgba(225, 48, 108, 0.15); border: 1px solid rgba(225, 48, 108, 0.4); color: #f472b6; font-size: 12px; font-weight: 700; padding: 6px 12px; border-radius: 8px; cursor: pointer;">
              Schedule Slot
            </button>
          </div>

          <div style="background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(255, 255, 255, 0.08); padding: 14px; border-radius: 12px; display: flex; justify-content: space-between; align-items: center;">
            <div>
              <div style="font-size: 13px; font-weight: 700; color: #00f2fe;">🎵 TikTok</div>
              <div style="font-size: 14px; font-weight: 800; margin-top: 2px;">8:30 PM - 10:00 PM</div>
              <div style="font-size: 11px; color: #10b981; margin-top: 2px;">+44% Night Traffic</div>
            </div>
            <button class="btn-quick-schedule-preset" data-platform="tiktok" data-time="20:30" style="background: rgba(0, 242, 254, 0.15); border: 1px solid rgba(0, 242, 254, 0.4); color: #38bdf8; font-size: 12px; font-weight: 700; padding: 6px 12px; border-radius: 8px; cursor: pointer;">
              Schedule Slot
            </button>
          </div>

          <div style="background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(255, 255, 255, 0.08); padding: 14px; border-radius: 12px; display: flex; justify-content: space-between; align-items: center;">
            <div>
              <div style="font-size: 13px; font-weight: 700; color: #ff0000;">▶️ YouTube Shorts</div>
              <div style="font-size: 14px; font-weight: 800; margin-top: 2px;">12:00 PM - 2:00 PM</div>
              <div style="font-size: 11px; color: #10b981; margin-top: 2px;">+29% Lunch Break Peak</div>
            </div>
            <button class="btn-quick-schedule-preset" data-platform="youtube" data-time="12:00" style="background: rgba(255, 0, 0, 0.15); border: 1px solid rgba(255, 0, 0, 0.4); color: #f87171; font-size: 12px; font-weight: 700; padding: 6px 12px; border-radius: 8px; cursor: pointer;">
              Schedule Slot
            </button>
          </div>
        </div>
      </div>

    </div>
  `;

  // Attach Event Listeners
  attachHeaderListeners(target);
  await loadScheduledPosts(target);
}

function injectPlannerStyles() {
  if (document.getElementById('planner-dynamic-styles')) return;
  const style = document.createElement('style');
  style.id = 'planner-dynamic-styles';
  style.textContent = `
    .calendar-day-cell.drag-hover {
      background: rgba(99, 102, 241, 0.22) !important;
      outline: 2px dashed #818cf8 !important;
      outline-offset: -2px;
      box-shadow: inset 0 0 15px rgba(99, 102, 241, 0.3);
    }
    .scheduled-post-pill.is-dragging {
      opacity: 0.35;
      transform: scale(0.96);
    }
    .scheduled-post-pill:hover {
      filter: brightness(1.15);
      transform: translateY(-1px);
    }
    .pill-quick-delete {
      opacity: 0;
      transition: opacity 0.15s ease, background 0.15s ease;
    }
    .scheduled-post-pill:hover .pill-quick-delete {
      opacity: 1;
    }
    .event-deleting-dissolve {
      opacity: 0 !important;
      transform: scale(0.85) translateY(6px) !important;
      filter: blur(4px) !important;
      transition: all 0.22s cubic-bezier(0.4, 0, 0.2, 1) !important;
      pointer-events: none !important;
    }
    .event-restored-highlight {
      animation: eventRestoredFlash 1.6s ease-out forwards !important;
    }
    @keyframes eventRestoredFlash {
      0% {
        box-shadow: 0 0 0 3px #10b981, 0 0 22px rgba(16, 185, 129, 0.6);
        transform: scale(1.03);
      }
      60% {
        box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.4);
        transform: scale(1.01);
      }
      100% {
        box-shadow: none;
        transform: scale(1);
      }
    }
    @keyframes deleteModalPop {
      0% { opacity: 0; transform: scale(0.92) translateY(12px); }
      100% { opacity: 1; transform: scale(1) translateY(0); }
    }
    .delete-modal-pop {
      animation: deleteModalPop 0.18s cubic-bezier(0.16, 1, 0.3, 1) forwards;
    }
    @keyframes spinDisc {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
    .spinning-disc {
      animation: spinDisc 4s linear infinite;
    }
    @keyframes pulseGlow {
      0%, 100% { opacity: 0.6; }
      50% { opacity: 1; }
    }
    .ai-generating-pulse {
      animation: pulseGlow 1.2s infinite ease-in-out;
    }
    .ai-hook-card {
      background: rgba(15, 23, 42, 0.85);
      border: 1px solid rgba(168, 85, 247, 0.25);
      border-radius: 8px;
      padding: 10px 12px;
      transition: all 0.18s ease;
      cursor: pointer;
    }
    .ai-hook-card:hover {
      background: rgba(30, 41, 59, 0.95);
      border-color: rgba(168, 85, 247, 0.6);
      transform: translateY(-1px);
    }
    .ai-action-chip {
      background: rgba(255, 255, 255, 0.07);
      border: 1px solid rgba(255, 255, 255, 0.12);
      color: #e2e8f0;
      font-size: 11px;
      font-weight: 600;
      padding: 5px 10px;
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.15s ease;
      display: inline-flex;
      align-items: center;
      gap: 5px;
    }
    .ai-action-chip:hover {
      background: rgba(99, 102, 241, 0.2);
      border-color: rgba(99, 102, 241, 0.5);
      color: #fff;
    }

    /* Responsive Planner & Mobile Calendar System */
    @media (min-width: 1024px) {
      .planner-desktop-calendar {
        display: block !important;
      }
      .planner-mobile-calendar {
        display: none !important;
      }
    }
    @media (max-width: 1023px) {
      .planner-desktop-calendar {
        display: none !important;
      }
      .planner-mobile-calendar {
        display: flex !important;
        flex-direction: column;
        gap: 16px;
        width: 100% !important;
      }
      #planner-stats-bar {
        grid-template-columns: repeat(2, 1fr) !important;
        gap: 10px !important;
      }
      .schedule-modal-body {
        grid-template-columns: 1fr !important;
      }
    }

    .mobile-cal-nav-card {
      background: var(--card-bg, rgba(30, 41, 59, 0.7));
      border: 1px solid var(--border-color, rgba(255, 255, 255, 0.1));
      border-radius: 16px;
      padding: 14px 12px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.25);
    }
    .mobile-cal-days-grid {
      display: grid;
      grid-template-columns: repeat(7, 1fr);
      gap: 4px;
      padding-top: 6px;
    }
    .mobile-cal-cell {
      min-height: 48px;
      border-radius: 10px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 4px 2px;
      cursor: pointer;
      position: relative;
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid transparent;
      transition: all 0.15s ease;
      user-select: none;
      -webkit-tap-highlight-color: transparent;
    }
    .mobile-cal-cell:active {
      transform: scale(0.96);
    }
    .mobile-cal-cell.today {
      border: 1.5px solid #818cf8;
      background: rgba(99, 102, 241, 0.12);
    }
    .mobile-cal-cell.today .mobile-cal-day-num {
      color: #a5b4fc;
      font-weight: 800;
    }
    .mobile-cal-cell.selected {
      background: #6366f1 !important;
      box-shadow: 0 4px 12px rgba(99, 102, 241, 0.45);
      border-color: #818cf8 !important;
    }
    .mobile-cal-cell.selected .mobile-cal-day-num {
      color: #ffffff !important;
      font-weight: 800;
    }
    .mobile-cal-cell.today.selected {
      border: 2px solid #ffffff !important;
    }
    .mobile-cal-cell.selected .mobile-cal-dot {
      box-shadow: 0 0 0 1px #ffffff;
    }
    .mobile-cal-cell.other-month {
      opacity: 0.35;
    }
    .mobile-cal-day-num {
      font-size: 13px;
      font-weight: 600;
      color: #e2e8f0;
      line-height: 1;
    }
    .mobile-cal-dots {
      display: flex;
      gap: 3px;
      align-items: center;
      justify-content: center;
      margin-top: 4px;
      height: 6px;
    }
    .mobile-cal-dot {
      width: 5px;
      height: 5px;
      border-radius: 50%;
      flex-shrink: 0;
    }
    .mobile-cal-dot-empty {
      width: 5px;
      height: 5px;
      visibility: hidden;
    }
    .mobile-agenda-container {
      background: var(--card-bg, rgba(30, 41, 59, 0.7));
      border: 1px solid var(--border-color, rgba(255, 255, 255, 0.1));
      border-radius: 16px;
      padding: 16px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.25);
    }
    .mobile-agenda-post-card {
      background: rgba(15, 23, 42, 0.65);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 12px;
      padding: 14px;
      margin-bottom: 10px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .platform-chips-scroll {
      display: flex;
      gap: 8px;
      overflow-x: auto;
      max-width: 100%;
      padding-bottom: 4px;
      -webkit-overflow-scrolling: touch;
      scrollbar-width: none;
    }
    .platform-chips-scroll::-webkit-scrollbar {
      display: none;
    }
  `;
  document.head.appendChild(style);
}

function renderPlatformFilterChip(platformId, label) {
  const isActive = selectedFilterPlatform === platformId;
  return `
    <button class="platform-filter-chip ${isActive ? 'active' : ''}" data-platform="${platformId}" style="background: ${isActive ? 'rgba(99, 102, 241, 0.25)' : 'rgba(255,255,255,0.05)'}; border: 1px solid ${isActive ? '#6366f1' : 'rgba(255,255,255,0.1)'}; color: ${isActive ? '#a5b4fc' : '#94a3b8'}; font-size: 12px; font-weight: 700; padding: 6px 12px; border-radius: 20px; cursor: pointer; transition: all 0.15s ease;">
      ${label}
    </button>
  `;
}

function attachHeaderListeners(container) {
  const btnNew = container.querySelector('#planner-btn-schedule-new');
  if (btnNew) {
    btnNew.addEventListener('click', () => {
      openScheduleModal();
    });
  }

  // View switch buttons
  const btnCal = container.querySelector('#view-mode-calendar');
  const btnQueue = container.querySelector('#view-mode-queue');
  const monthControls = container.querySelector('#calendar-month-controls');

  if (btnCal && btnQueue) {
    btnCal.addEventListener('click', () => {
      currentViewMode = 'calendar';
      btnCal.style.background = '#6366f1';
      btnCal.style.color = '#ffffff';
      btnQueue.style.background = 'transparent';
      btnQueue.style.color = '#94a3b8';
      if (monthControls) monthControls.style.display = 'flex';
      updateMainContentView(container);
    });

    btnQueue.addEventListener('click', () => {
      currentViewMode = 'queue';
      btnQueue.style.background = '#6366f1';
      btnQueue.style.color = '#ffffff';
      btnCal.style.background = 'transparent';
      btnCal.style.color = '#94a3b8';
      if (monthControls) monthControls.style.display = 'none';
      updateMainContentView(container);
    });
  }

  // Month navigation
  const btnPrev = container.querySelector('#btn-prev-month');
  const btnNext = container.querySelector('#btn-next-month');
  const btnToday = container.querySelector('#btn-today-month');

  if (btnPrev) {
    btnPrev.addEventListener('click', () => {
      activeCalendarDate = new Date(activeCalendarDate.getFullYear(), activeCalendarDate.getMonth() - 1, 1);
      const prevPrefix = `${activeCalendarDate.getFullYear()}-${String(activeCalendarDate.getMonth() + 1).padStart(2, '0')}`;
      selectedMobileDate = `${prevPrefix}-01`;
      updateMainContentView(container);
    });
  }

  if (btnNext) {
    btnNext.addEventListener('click', () => {
      activeCalendarDate = new Date(activeCalendarDate.getFullYear(), activeCalendarDate.getMonth() + 1, 1);
      const nextPrefix = `${activeCalendarDate.getFullYear()}-${String(activeCalendarDate.getMonth() + 1).padStart(2, '0')}`;
      selectedMobileDate = `${nextPrefix}-01`;
      updateMainContentView(container);
    });
  }

  if (btnToday) {
    btnToday.addEventListener('click', () => {
      activeCalendarDate = new Date();
      selectedMobileDate = formatLocalDateKey(new Date());
      updateMainContentView(container);
    });
  }

  // Filter Chips
  container.querySelectorAll('.platform-filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      selectedFilterPlatform = chip.getAttribute('data-platform');
      container.querySelectorAll('.platform-filter-chip').forEach(c => {
        c.style.background = 'rgba(255,255,255,0.05)';
        c.style.borderColor = 'rgba(255,255,255,0.1)';
        c.style.color = '#94a3b8';
      });
      chip.style.background = 'rgba(99, 102, 241, 0.25)';
      chip.style.borderColor = '#6366f1';
      chip.style.color = '#a5b4fc';
      updateMainContentView(container);
    });
  });

  // Virality preset buttons
  container.querySelectorAll('.btn-quick-schedule-preset').forEach(btn => {
    btn.addEventListener('click', () => {
      const platform = btn.getAttribute('data-platform');
      const time = btn.getAttribute('data-time');
      const now = new Date();
      if (time && time.includes(':')) {
        const [h, m] = time.split(':').map(Number);
        if (now.getHours() > h || (now.getHours() === h && now.getMinutes() >= m)) {
          now.setDate(now.getDate() + 1); // schedule for tomorrow if time passed
        }
      }
      openScheduleModal({
        initialPlatform: platform,
        initialTime: time,
        initialDate: formatLocalDateKey(now)
      });
    });
  });
}

// Master Action for Removing / Deleting a Scheduled Post with custom UI & undo flow
export function deleteScheduledPostAction(postId, container) {
  if (!postId) return;
  const post = scheduledPostsCache.find(p => p.id === postId) || {
    id: postId,
    video_title: 'Scheduled Post',
    platform: 'instagram'
  };
  showDeleteConfirmationModal(post, container);
}

// Custom in-app Confirmation Dialog for Event Deletion
export function showDeleteConfirmationModal(post, container) {
  const existingModal = document.getElementById('delete-event-confirm-modal');
  if (existingModal) existingModal.remove();

  const modalOverlay = document.createElement('div');
  modalOverlay.id = 'delete-event-confirm-modal';
  modalOverlay.style.cssText = `
    position: fixed; inset: 0; background: rgba(0, 0, 0, 0.78); backdrop-filter: blur(8px);
    z-index: 10005; display: flex; align-items: center; justify-content: center; padding: 20px;
  `;

  let formattedDate = 'Upcoming Date';
  let formattedTime = 'Scheduled Time';
  if (post.scheduled_at) {
    const d = new Date(post.scheduled_at);
    formattedDate = d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
    formattedTime = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  const platformIcon = getPlatformIcon(post.platform || 'instagram');
  const platformName = (post.platform || 'instagram').toUpperCase();

  modalOverlay.innerHTML = `
    <div class="delete-modal-pop" style="background: #0f172a; border: 1px solid rgba(239, 68, 68, 0.35); border-radius: 18px; width: 100%; max-width: 460px; padding: 24px; color: #ffffff; box-shadow: 0 25px 60px rgba(0,0,0,0.7), 0 0 35px rgba(239,68,68,0.15);">
      
      <!-- Modal Header -->
      <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 16px;">
        <div style="display: flex; align-items: center; gap: 12px;">
          <div style="width: 42px; height: 42px; border-radius: 12px; background: rgba(239, 68, 68, 0.18); border: 1px solid rgba(239, 68, 68, 0.35); display: flex; align-items: center; justify-content: center; font-size: 20px; flex-shrink: 0; color: #f87171;">
            🗑️
          </div>
          <div>
            <span style="font-size: 11px; font-weight: 800; text-transform: uppercase; color: #f87171; letter-spacing: 0.6px;">Delete Scheduled Event</span>
            <h3 style="margin: 2px 0 0 0; font-size: 18px; font-weight: 800; color: #f8fafc;">Cancel & Remove Post?</h3>
          </div>
        </div>
        <button id="btn-close-delete-modal" style="background: transparent; border: none; color: #94a3b8; font-size: 18px; cursor: pointer; padding: 4px; border-radius: 6px; line-height: 1;">✕</button>
      </div>

      <!-- Event Summary Card -->
      <div style="background: rgba(30, 41, 59, 0.7); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 12px; padding: 14px; margin-bottom: 16px;">
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 6px;">
          <div style="font-weight: 800; font-size: 14px; color: #f8fafc; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 260px;">
            ${post.video_title || 'Creator Reel'}
          </div>
          <span style="font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: 6px; background: rgba(99, 102, 241, 0.2); border: 1px solid rgba(99, 102, 241, 0.4); color: #a5b4fc; text-transform: uppercase; white-space: nowrap;">
            ${platformIcon} ${platformName}
          </span>
        </div>
        <div style="font-size: 12px; color: #94a3b8; display: flex; align-items: center; gap: 6px;">
          <span>📅</span>
          <span>${formattedDate} • <strong>${formattedTime}</strong></span>
        </div>
        ${post.caption_text ? `
          <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.06); font-size: 11px; color: #cbd5e1; font-style: italic; max-height: 50px; overflow: hidden; text-overflow: ellipsis;">
            "${post.caption_text}"
          </div>
        ` : ''}
      </div>

      <!-- Warning description -->
      <p style="margin: 0 0 20px 0; font-size: 13px; color: #94a3b8; line-height: 1.5;">
        This scheduled publication will be removed from your queue and calendar. You can restore it immediately using the undo action if removed by mistake.
      </p>

      <!-- Action Buttons -->
      <div style="display: flex; align-items: center; justify-content: flex-end; gap: 10px;">
        <button id="btn-cancel-delete" style="background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 255, 255, 0.15); color: #e2e8f0; font-weight: 700; font-size: 13px; padding: 10px 18px; border-radius: 10px; cursor: pointer; transition: all 0.15s ease;">
          Keep in Schedule
        </button>
        <button id="btn-confirm-delete" style="background: linear-gradient(135deg, #ef4444, #dc2626); color: #ffffff; border: none; font-weight: 700; font-size: 13px; padding: 10px 20px; border-radius: 10px; cursor: pointer; box-shadow: 0 4px 14px rgba(239, 68, 68, 0.4); transition: transform 0.15s ease; display: inline-flex; align-items: center; gap: 6px;">
          <span>🗑️ Yes, Delete Event</span>
        </button>
      </div>

    </div>
  `;

  document.body.appendChild(modalOverlay);

  const closeDialog = () => modalOverlay.remove();
  modalOverlay.querySelector('#btn-close-delete-modal').addEventListener('click', closeDialog);
  modalOverlay.querySelector('#btn-cancel-delete').addEventListener('click', closeDialog);
  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) closeDialog();
  });

  const btnConfirm = modalOverlay.querySelector('#btn-confirm-delete');
  btnConfirm.addEventListener('click', async () => {
    btnConfirm.disabled = true;
    btnConfirm.innerHTML = '<span>⏳ Deleting...</span>';
    await executePostDeletion(post, container, modalOverlay);
  });
}

// Executes component dissolving, cache removal, and backend sync with Undo support
async function executePostDeletion(post, container, confirmModalOverlay) {
  const target = getPlannerContainer(container);

  // 1. Close confirmation modal and any lingering parent modals
  if (confirmModalOverlay) confirmModalOverlay.remove();
  const openActionModal = document.querySelector('.post-action-modal');
  if (openActionModal) openActionModal.remove();

  // 2. Animate all matching DOM components (pills in calendar & cards in queue)
  const matchingElements = document.querySelectorAll(`[data-id="${post.id}"]`);
  matchingElements.forEach(el => {
    el.classList.add('event-deleting-dissolve');
  });

  // 3. Optimistically remove from client cache
  const deletedPostBackup = { ...post };
  scheduledPostsCache = scheduledPostsCache.filter(p => p.id !== post.id);

  // 4. Update stats immediately
  updateStatsBar(target);

  // 5. Allow dissolve animation to finish smoothly, then update main view
  setTimeout(() => {
    updateMainContentView(target);
  }, 220);

  // 6. Asynchronously trigger backend deletion
  try {
    await api.deleteScheduledPost(post.id);
  } catch (err) {
    console.error('Failed to sync scheduled post deletion to server:', err);
  }

  // 7. Show Undo snackbar
  showUndoSnackbar(deletedPostBackup, target);
}

// Undo Snackbar Toast with Countdown Timer
function showUndoSnackbar(deletedPost, container) {
  const existingSnackbar = document.getElementById('planner-undo-snackbar');
  if (existingSnackbar) existingSnackbar.remove();

  const snackbar = document.createElement('div');
  snackbar.id = 'planner-undo-snackbar';
  snackbar.style.cssText = `
    position: fixed; bottom: 24px; right: 24px; z-index: 20000;
    background: #0f172a; border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 14px;
    padding: 14px 18px; color: #ffffff; box-shadow: 0 15px 40px rgba(0,0,0,0.6);
    display: flex; flex-direction: column; gap: 8px; min-width: 320px; max-width: 440px;
    animation: fadeIn 0.2s ease-out;
  `;

  snackbar.innerHTML = `
    <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px;">
      <div style="display: flex; align-items: center; gap: 10px; overflow: hidden;">
        <span style="font-size: 16px; flex-shrink: 0;">🗑️</span>
        <div style="font-size: 13px; font-weight: 600; color: #f1f5f9; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
          Deleted "<strong>${deletedPost.video_title || 'Scheduled Reel'}</strong>"
        </div>
      </div>
      <button id="btn-undo-delete-event" style="background: rgba(99, 102, 241, 0.25); border: 1px solid #6366f1; color: #a5b4fc; font-size: 12px; font-weight: 800; padding: 6px 14px; border-radius: 8px; cursor: pointer; white-space: nowrap; transition: all 0.15s ease;">
        ↩️ Undo
      </button>
    </div>
    <div style="width: 100%; height: 3px; background: rgba(255,255,255,0.1); border-radius: 2px; overflow: hidden;">
      <div id="undo-progress-bar" style="width: 100%; height: 100%; background: #6366f1; transition: width 5s linear;"></div>
    </div>
  `;

  document.body.appendChild(snackbar);

  // Trigger progress bar animation
  requestAnimationFrame(() => {
    const bar = snackbar.querySelector('#undo-progress-bar');
    if (bar) bar.style.width = '0%';
  });

  const dismissTimer = setTimeout(() => {
    if (snackbar.parentElement) snackbar.remove();
  }, 5000);

  // Undo click listener
  const btnUndo = snackbar.querySelector('#btn-undo-delete-event');
  if (btnUndo) {
    btnUndo.addEventListener('click', async () => {
      clearTimeout(dismissTimer);
      btnUndo.disabled = true;
      btnUndo.textContent = '⏳ Restoring...';

      // 1. Re-insert post into cache
      scheduledPostsCache.push(deletedPost);
      // Sort cache chronologically
      scheduledPostsCache.sort((a,b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());

      // 2. Refresh UI immediately
      const target = getPlannerContainer(container);
      updateStatsBar(target);
      updateMainContentView(target);

      // 3. Highlight restored DOM elements
      setTimeout(() => {
        const restoredElements = document.querySelectorAll(`[data-id="${deletedPost.id}"]`);
        restoredElements.forEach(el => el.classList.add('event-restored-highlight'));
      }, 50);

      // 4. Restore on server
      try {
        await api.schedulePost({
          id: deletedPost.id,
          videoId: deletedPost.video_id || `vid_${Date.now()}`,
          videoTitle: deletedPost.video_title,
          platforms: [deletedPost.platform || 'instagram'],
          captionText: deletedPost.caption_text || '',
          scheduledAt: deletedPost.scheduled_at,
          hashtags: deletedPost.hashtags || []
        });
      } catch (err) {
        console.error('Failed to restore post on server:', err);
      }

      // 5. Update snackbar to success state
      snackbar.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 700; color: #34d399; padding: 4px 0;">
          <span>✅</span>
          <span>Scheduled event restored successfully!</span>
        </div>
      `;
      setTimeout(() => {
        if (snackbar.parentElement) snackbar.remove();
      }, 2000);
    });
  }
}

async function loadScheduledPosts(container) {
  const target = getPlannerContainer(container);
  try {
    const res = await fetch('/api/publish/schedule');
    const json = await res.json();
    if (json.success && Array.isArray(json.data)) {
      scheduledPostsCache = json.data;
    } else {
      scheduledPostsCache = [];
    }
  } catch (err) {
    console.warn('Error fetching scheduled posts from backend:', err);
    scheduledPostsCache = [];
  }

  updateStatsBar(target);
  updateMainContentView(target);
}

function updateStatsBar(container) {
  const target = getPlannerContainer(container);
  const statCount = target.querySelector('#stat-total-count');
  const statNext = target.querySelector('#stat-next-slot');

  const filtered = scheduledPostsCache.filter(p => p.status === 'scheduled');

  if (statCount) {
    statCount.textContent = `${filtered.length} Posts`;
  }

  if (statNext) {
    if (filtered.length > 0) {
      const nextPost = [...filtered].sort((a,b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())[0];
      const d = new Date(nextPost.scheduled_at);
      statNext.textContent = `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} @ ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    } else {
      statNext.textContent = 'No posts in queue';
    }
  }
}

function updateMainContentView(container) {
  const target = getPlannerContainer(container);
  const mainContent = target.querySelector('#planner-main-content');
  if (!mainContent) return;

  // Filter posts by selected platform
  let postsToDisplay = scheduledPostsCache;
  if (selectedFilterPlatform !== 'all') {
    postsToDisplay = scheduledPostsCache.filter(p => p.platform === selectedFilterPlatform);
  }

  if (currentViewMode === 'calendar') {
    renderCalendarView(mainContent, postsToDisplay, target);
  } else {
    renderQueueView(mainContent, postsToDisplay, target);
  }
}

function renderCalendarView(container, posts, parentContainer) {
  const year = activeCalendarDate.getFullYear();
  const month = activeCalendarDate.getMonth();

  const monthLabel = (parentContainer && parentContainer.querySelector)
    ? parentContainer.querySelector('#calendar-month-label')
    : document.getElementById('calendar-month-label');
  if (monthLabel) {
    monthLabel.textContent = activeCalendarDate.toLocaleDateString([], { month: 'long', year: 'numeric' });
  }

  const firstDayIndex = new Date(year, month, 1).getDay(); // 0 is Sunday
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();
  const adjustedFirstDay = (firstDayIndex === 0 ? 6 : firstDayIndex - 1); // Monday-first

  const todayStr = formatLocalDateKey(new Date());

  // Ensure selectedMobileDate matches active month if user navigated months
  const monthPrefix = `${year}-${String(month + 1).padStart(2, '0')}`;
  if (!selectedMobileDate || !selectedMobileDate.startsWith(monthPrefix)) {
    if (todayStr.startsWith(monthPrefix)) {
      selectedMobileDate = todayStr;
    } else {
      const firstPostThisMonth = posts.find(p => p.scheduled_at && formatLocalDateKey(p.scheduled_at).startsWith(monthPrefix));
      selectedMobileDate = firstPostThisMonth ? formatLocalDateKey(firstPostThisMonth.scheduled_at) : `${monthPrefix}-01`;
    }
  }

  // --- 1. DESKTOP GRID VIEW HTML ---
  let desktopGridHtml = `
    <div class="planner-desktop-calendar" style="background: var(--card-bg, rgba(30, 41, 59, 0.6)); border: 1px solid var(--border-color, rgba(255, 255, 255, 0.1)); border-radius: 16px; overflow-x: auto; box-shadow: 0 10px 30px rgba(0,0,0,0.2);">
      <div style="min-width: 680px;">
      
      <!-- Day Headers -->
      <div style="display: grid; grid-template-columns: repeat(7, 1fr); background: rgba(15, 23, 42, 0.8); border-bottom: 1px solid rgba(255, 255, 255, 0.08); text-align: center; font-size: 12px; font-weight: 700; color: #94a3b8; text-transform: uppercase; padding: 12px 0;">
        <div>Mon</div><div>Tue</div><div>Wed</div><div>Thu</div><div>Fri</div><div>Sat</div><div>Sun</div>
      </div>

      <!-- Days Grid -->
      <div style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 1px; background: rgba(255, 255, 255, 0.05);">
  `;

  // Previous month trailing padding cells (desktop & mobile)
  let mobilePrevCellsHtml = '';
  for (let i = 0; i < adjustedFirstDay; i++) {
    const prevDay = daysInPrevMonth - adjustedFirstDay + 1 + i;
    const prevDate = new Date(year, month - 1, prevDay, 12, 0, 0);
    const prevDateStr = formatLocalDateKey(prevDate);
    const prevDayPosts = posts.filter(p => p.scheduled_at && formatLocalDateKey(p.scheduled_at) === prevDateStr);
    const isSelected = prevDateStr === selectedMobileDate;

    desktopGridHtml += `
      <div class="calendar-day-cell other-month-cell" data-date="${prevDateStr}" style="background: rgba(15, 23, 42, 0.35); min-height: 125px; padding: 8px; opacity: 0.6; cursor: pointer; transition: all 0.15s ease;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
          <span style="font-size: 13px; font-weight: 500; color: #64748b;">${prevDay}</span>
          <button class="btn-add-post-day" data-date="${prevDateStr}" title="Schedule post on this day" style="background: rgba(255,255,255,0.04); border: none; color: #64748b; width: 22px; height: 22px; border-radius: 50%; font-size: 12px; cursor: pointer; display: flex; align-items: center; justify-content: center;">+</button>
        </div>
        <div class="day-posts-container" style="display: flex; flex-direction: column; gap: 4px; min-height: 60px;">
          ${prevDayPosts.map(p => renderScheduledPostPill(p)).join('')}
        </div>
      </div>
    `;

    mobilePrevCellsHtml += `
      <div class="mobile-cal-cell other-month ${isSelected ? 'selected' : ''}" data-date="${prevDateStr}">
        <span class="mobile-cal-day-num">${prevDay}</span>
        <div class="mobile-cal-dots">${renderMobileDayDotsHtml(prevDayPosts)}</div>
      </div>
    `;
  }

  // Days of current month (desktop & mobile)
  let mobileMonthCellsHtml = '';
  for (let day = 1; day <= daysInMonth; day++) {
    const dayDate = new Date(year, month, day, 12, 0, 0);
    const dateStr = formatLocalDateKey(dayDate);
    const isToday = dateStr === todayStr;
    const isSelected = dateStr === selectedMobileDate;

    // Filter posts on this date
    const dayPosts = posts.filter(p => {
      if (!p.scheduled_at) return false;
      return formatLocalDateKey(p.scheduled_at) === dateStr;
    });

    desktopGridHtml += `
      <div class="calendar-day-cell" data-date="${dateStr}" style="background: ${isToday ? 'rgba(99, 102, 241, 0.08)' : 'rgba(30, 41, 59, 0.4)'}; min-height: 125px; padding: 8px; border: ${isToday ? '2px solid #6366f1' : 'none'}; position: relative; cursor: pointer; transition: all 0.15s ease;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
          <span style="font-size: 13px; font-weight: ${isToday ? '800' : '600'}; color: ${isToday ? '#818cf8' : '#e2e8f0'};">
            ${day} ${isToday ? '<span style="font-size: 10px; background: #6366f1; color: #fff; padding: 1px 6px; border-radius: 10px; margin-left: 4px;">TODAY</span>' : ''}
          </span>
          <button class="btn-add-post-day" data-date="${dateStr}" title="Schedule post on this day" style="background: rgba(255,255,255,0.06); border: none; color: #94a3b8; width: 22px; height: 22px; border-radius: 50%; font-size: 12px; cursor: pointer; display: flex; align-items: center; justify-content: center;">+</button>
        </div>

        <div class="day-posts-container" style="display: flex; flex-direction: column; gap: 4px; min-height: 60px;">
          ${dayPosts.map(p => renderScheduledPostPill(p)).join('')}
        </div>
      </div>
    `;

    mobileMonthCellsHtml += `
      <div class="mobile-cal-cell ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''}" data-date="${dateStr}">
        <span class="mobile-cal-day-num">${day}</span>
        <div class="mobile-cal-dots">${renderMobileDayDotsHtml(dayPosts)}</div>
      </div>
    `;
  }

  // Next month trailing days to complete grid (desktop & mobile)
  const totalRendered = adjustedFirstDay + daysInMonth;
  const trailingDays = (7 - (totalRendered % 7)) % 7;
  let mobileNextCellsHtml = '';
  for (let day = 1; day <= trailingDays; day++) {
    const nextDate = new Date(year, month + 1, day, 12, 0, 0);
    const nextDateStr = formatLocalDateKey(nextDate);
    const nextDayPosts = posts.filter(p => p.scheduled_at && formatLocalDateKey(p.scheduled_at) === nextDateStr);
    const isSelected = nextDateStr === selectedMobileDate;

    desktopGridHtml += `
      <div class="calendar-day-cell other-month-cell" data-date="${nextDateStr}" style="background: rgba(15, 23, 42, 0.35); min-height: 125px; padding: 8px; opacity: 0.6; cursor: pointer; transition: all 0.15s ease;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
          <span style="font-size: 13px; font-weight: 500; color: #64748b;">${day}</span>
          <button class="btn-add-post-day" data-date="${nextDateStr}" title="Schedule post on this day" style="background: rgba(255,255,255,0.04); border: none; color: #64748b; width: 22px; height: 22px; border-radius: 50%; font-size: 12px; cursor: pointer; display: flex; align-items: center; justify-content: center;">+</button>
        </div>
        <div class="day-posts-container" style="display: flex; flex-direction: column; gap: 4px; min-height: 60px;">
          ${nextDayPosts.map(p => renderScheduledPostPill(p)).join('')}
        </div>
      </div>
    `;

    mobileNextCellsHtml += `
      <div class="mobile-cal-cell other-month ${isSelected ? 'selected' : ''}" data-date="${nextDateStr}">
        <span class="mobile-cal-day-num">${day}</span>
        <div class="mobile-cal-dots">${renderMobileDayDotsHtml(nextDayPosts)}</div>
      </div>
    `;
  }

  desktopGridHtml += `
      </div>
      </div>
    </div>
  `;

  // --- 2. MOBILE CALENDAR & AGENDA HTML ---
  const mobileCalendarHtml = `
    <div class="planner-mobile-calendar">
      <!-- Mobile Month Nav Card -->
      <div class="mobile-cal-nav-card">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; gap: 8px;">
          <div>
            <div style="font-size: 16px; font-weight: 800; color: #f8fafc;">
              ${activeCalendarDate.toLocaleDateString([], { month: 'long', year: 'numeric' })}
            </div>
            <div style="font-size: 11px; color: #94a3b8; margin-top: 1px;">
              Select a date to view or schedule reels
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 6px;">
            <button class="mobile-cal-btn-prev" aria-label="Previous Month" style="width: 38px; height: 38px; border-radius: 10px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12); color: #fff; font-size: 18px; font-weight: bold; cursor: pointer; display: flex; align-items: center; justify-content: center;">‹</button>
            <button class="mobile-cal-btn-today" style="height: 38px; border-radius: 10px; background: rgba(99, 102, 241, 0.2); border: 1px solid rgba(99, 102, 241, 0.45); color: #a5b4fc; font-size: 12px; font-weight: 700; padding: 0 12px; cursor: pointer;">Today</button>
            <button class="mobile-cal-btn-next" aria-label="Next Month" style="width: 38px; height: 38px; border-radius: 10px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12); color: #fff; font-size: 18px; font-weight: bold; cursor: pointer; display: flex; align-items: center; justify-content: center;">›</button>
          </div>
        </div>

        <!-- 7 Day Headers -->
        <div style="display: grid; grid-template-columns: repeat(7, 1fr); text-align: center; font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,0.06);">
          <div>Mon</div><div>Tue</div><div>Wed</div><div>Thu</div><div>Fri</div><div style="color: #64748b;">Sat</div><div style="color: #64748b;">Sun</div>
        </div>

        <!-- 7-Column Days Grid -->
        <div class="mobile-cal-days-grid">
          ${mobilePrevCellsHtml}
          ${mobileMonthCellsHtml}
          ${mobileNextCellsHtml}
        </div>
      </div>

      <!-- Mobile Selected Date Agenda Section -->
      <div id="mobile-calendar-agenda" class="mobile-agenda-container">
        ${renderMobileAgendaHtml(selectedMobileDate, posts)}
      </div>
    </div>
  `;

  // Render both views into container (CSS media queries govern visibility)
  container.innerHTML = desktopGridHtml + mobileCalendarHtml;

  // --- 3. ATTACH DESKTOP LISTENERS ---
  container.querySelectorAll('.calendar-day-cell').forEach(cell => {
    // Click on empty cell
    cell.addEventListener('click', (e) => {
      if (e.target.closest('.scheduled-post-pill') || e.target.closest('.btn-add-post-day') || e.target.closest('.pill-quick-delete')) return;
      const dateStr = cell.getAttribute('data-date');
      openScheduleModal({ initialDate: dateStr });
    });

    // Drag Over
    cell.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      cell.classList.add('drag-hover');
    });

    // Drag Leave
    cell.addEventListener('dragleave', () => {
      cell.classList.remove('drag-hover');
    });

    // Drop
    cell.addEventListener('drop', async (e) => {
      e.preventDefault();
      cell.classList.remove('drag-hover');
      const postId = e.dataTransfer.getData('text/plain');
      const targetDate = cell.getAttribute('data-date');
      if (!postId || !targetDate) return;

      const post = scheduledPostsCache.find(p => p.id === postId);
      if (!post) return;

      // Retain the existing time or fallback to 18:00
      let timeStr = '18:00:00';
      if (post.scheduled_at) {
        const prevDate = new Date(post.scheduled_at);
        const hh = String(prevDate.getHours()).padStart(2, '0');
        const mm = String(prevDate.getMinutes()).padStart(2, '0');
        const ss = String(prevDate.getSeconds()).padStart(2, '0');
        timeStr = `${hh}:${mm}:${ss}`;
      }

      const [tYear, tMonth, tDay] = targetDate.split('-').map(Number);
      const [tHour, tMin, tSec] = timeStr.split(':').map(Number);
      const newScheduledIso = new Date(tYear, tMonth - 1, tDay, tHour || 18, tMin || 0, tSec || 0).toISOString();

      selectedMobileDate = targetDate;

      // Optimistic cache update
      post.scheduled_at = newScheduledIso;
      updateStatsBar(parentContainer);
      updateMainContentView(parentContainer);

      try {
        await api.reschedulePost(postId, newScheduledIso);
        showToast(`📅 Rescheduled to ${new Date(newScheduledIso).toLocaleDateString([], { month: 'short', day: 'numeric' })}!`);
      } catch (err) {
        console.error('Failed to reschedule on server:', err);
        showToast('Rescheduling error, reloading...', true);
        await loadScheduledPosts(parentContainer);
      }
    });
  });

  // Plus button click (desktop)
  container.querySelectorAll('.btn-add-post-day').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const dateStr = btn.getAttribute('data-date');
      openScheduleModal({ initialDate: dateStr });
    });
  });

  // Quick delete button directly on pill (desktop)
  container.querySelectorAll('.pill-quick-delete').forEach(delBtn => {
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const postId = delBtn.getAttribute('data-id');
      deleteScheduledPostAction(postId, parentContainer);
    });
  });

  // Post Pill Drag & Click Listeners (desktop)
  container.querySelectorAll('.scheduled-post-pill').forEach(pill => {
    // Drag Start
    pill.addEventListener('dragstart', (e) => {
      const postId = pill.getAttribute('data-id');
      e.dataTransfer.setData('text/plain', postId);
      pill.classList.add('is-dragging');
    });

    // Drag End
    pill.addEventListener('dragend', () => {
      pill.classList.remove('is-dragging');
    });

    // Pill Click -> Open Options Menu
    pill.addEventListener('click', (e) => {
      if (e.target.closest('.pill-quick-delete')) return;
      e.stopPropagation();
      const postId = pill.getAttribute('data-id');
      const post = scheduledPostsCache.find(p => p.id === postId);
      if (post) {
        openPostActionMenu(post, parentContainer);
      }
    });
  });

  // --- 4. ATTACH MOBILE LISTENERS ---
  attachMobileCalendarListeners(container, parentContainer, posts);
}

function renderMobileDayDotsHtml(dayPosts) {
  if (!dayPosts || dayPosts.length === 0) {
    return '<span class="mobile-cal-dot-empty"></span>';
  }
  const dotColors = {
    instagram: '#e1306c',
    tiktok: '#00f2fe',
    youtube: '#ef4444',
    linkedin: '#0a66c2',
    x: '#cbd5e1',
    threads: '#a855f7',
    facebook: '#1877f2',
  };
  const dots = dayPosts.slice(0, 3).map(p => {
    const color = dotColors[p.platform] || '#818cf8';
    return `<span class="mobile-cal-dot" style="background: ${color};"></span>`;
  }).join('');
  const extra = dayPosts.length > 3 ? `<span style="font-size: 8px; font-weight: 800; color: #a5b4fc; line-height: 1;">+${dayPosts.length - 3}</span>` : '';
  return dots + extra;
}

function renderMobileAgendaHtml(dateKey, posts) {
  const dayPosts = posts.filter(p => p.scheduled_at && formatLocalDateKey(p.scheduled_at) === dateKey);
  let dateLabel = dateKey;
  let isToday = false;
  if (dateKey) {
    try {
      const parts = dateKey.split('-').map(Number);
      if (parts.length === 3) {
        const d = new Date(parts[0], parts[1] - 1, parts[2]);
        isToday = dateKey === formatLocalDateKey(new Date());
        dateLabel = d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
      }
    } catch (e) {
      // fallback
    }
  }

  const platformMeta = {
    instagram: { name: 'Instagram', icon: '📸', color: '#f472b6' },
    tiktok: { name: 'TikTok', icon: '🎵', color: '#38bdf8' },
    youtube: { name: 'Shorts', icon: '▶️', color: '#f87171' },
    linkedin: { name: 'LinkedIn', icon: '💼', color: '#60a5fa' },
    x: { name: 'X', icon: '🪶', color: '#e2e8f0' },
    threads: { name: 'Threads', icon: '🧵', color: '#c084fc' },
    facebook: { name: 'Facebook', icon: '📘', color: '#60a5fa' },
  };

  let html = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; gap: 8px;">
      <div>
        <div style="font-size: 15px; font-weight: 800; color: #f8fafc; display: flex; align-items: center; gap: 6px;">
          <span>📅 ${isToday ? 'Today · ' : ''}${dateLabel}</span>
        </div>
        <div style="font-size: 12px; color: #94a3b8; margin-top: 2px;">
          ${dayPosts.length === 0 ? 'No posts scheduled' : (dayPosts.length === 1 ? '1 scheduled post' : `${dayPosts.length} scheduled posts`)}
        </div>
      </div>
      <button class="btn-mobile-schedule-slot" data-date="${dateKey}" style="background: linear-gradient(135deg, #6366f1, #a855f7); color: #fff; border: none; font-size: 12px; font-weight: 700; padding: 8px 14px; border-radius: 10px; cursor: pointer; display: flex; align-items: center; gap: 6px; min-height: 40px; box-shadow: 0 2px 8px rgba(99, 102, 241, 0.35);">
        <span>+ New Post</span>
      </button>
    </div>
  `;

  if (dayPosts.length === 0) {
    html += `
      <div style="text-align: center; padding: 28px 16px; background: rgba(15, 23, 42, 0.4); border: 1px dashed rgba(255,255,255,0.12); border-radius: 14px;">
        <div style="font-size: 28px; margin-bottom: 8px;">✨</div>
        <div style="font-size: 14px; font-weight: 700; color: #e2e8f0;">No posts scheduled for this day</div>
        <div style="font-size: 12px; color: #94a3b8; margin: 4px 0 16px 0;">This slot is completely open. Tap below to schedule a reel.</div>
        <button class="btn-mobile-schedule-slot" data-date="${dateKey}" style="background: rgba(99, 102, 241, 0.2); border: 1px solid rgba(99, 102, 241, 0.5); color: #a5b4fc; font-size: 13px; font-weight: 700; padding: 10px 18px; border-radius: 10px; cursor: pointer; min-height: 44px;">
          + Schedule Slot for ${dateLabel}
        </button>
      </div>
    `;
  } else {
    html += `<div style="display: flex; flex-direction: column; gap: 10px;">`;
    dayPosts.forEach(post => {
      const meta = platformMeta[post.platform] || { name: 'Post', icon: '🎥', color: '#a5b4fc' };
      const timeStr = new Date(post.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const isCross = Boolean(post.cross_post_group_id);

      html += `
        <div class="mobile-agenda-post-card" data-id="${post.id}">
          <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 18px;">${meta.icon}</span>
              <span style="font-size: 12px; font-weight: 800; color: ${meta.color}; text-transform: uppercase;">${meta.name}</span>
              ${isCross ? '<span style="font-size: 10px; color: #c084fc; font-weight: 700;">🔗 Cross-Post</span>' : ''}
            </div>
            <span style="font-size: 11px; font-weight: 700; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.1); color: #e2e8f0; padding: 3px 8px; border-radius: 6px;">
              🕒 ${timeStr}
            </span>
          </div>

          <div style="font-size: 14px; font-weight: 700; color: #f8fafc; line-height: 1.35; margin: 4px 0;">
            ${post.video_title || 'Scheduled Reel'}
          </div>

          ${post.caption_text ? `
            <div style="font-size: 12px; color: #94a3b8; line-height: 1.35; margin-bottom: 6px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">
              "${post.caption_text}"
            </div>
          ` : ''}

          <div style="display: flex; gap: 8px; border-top: 1px solid rgba(255,255,255,0.06); padding-top: 10px; align-items: center; justify-content: flex-end;">
            <button class="btn-mobile-edit-post" data-id="${post.id}" style="min-height: 38px; padding: 0 14px; border-radius: 8px; background: rgba(99, 102, 241, 0.15); border: 1px solid rgba(99, 102, 241, 0.4); color: #a5b4fc; font-size: 12px; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 4px;">
              ✏️ Edit
            </button>
            <button class="btn-mobile-menu-post" data-id="${post.id}" style="min-height: 38px; padding: 0 14px; border-radius: 8px; background: rgba(255, 255, 255, 0.06); border: 1px solid rgba(255, 255, 255, 0.12); color: #cbd5e1; font-size: 12px; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 4px;">
              ⚡ Options
            </button>
            <button class="btn-mobile-delete-post" data-id="${post.id}" title="Delete" style="min-height: 38px; width: 38px; border-radius: 8px; background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.35); color: #fca5a5; font-size: 13px; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center;">
              ✕
            </button>
          </div>
        </div>
      `;
    });
    html += `</div>`;
  }

  return html;
}

function attachMobileCalendarListeners(container, parentContainer, posts) {
  // 1. Mobile Prev Month Button
  const btnPrev = container.querySelector('.mobile-cal-btn-prev');
  if (btnPrev) {
    btnPrev.addEventListener('click', () => {
      activeCalendarDate = new Date(activeCalendarDate.getFullYear(), activeCalendarDate.getMonth() - 1, 1);
      updateMainContentView(parentContainer);
    });
  }

  // 2. Mobile Next Month Button
  const btnNext = container.querySelector('.mobile-cal-btn-next');
  if (btnNext) {
    btnNext.addEventListener('click', () => {
      activeCalendarDate = new Date(activeCalendarDate.getFullYear(), activeCalendarDate.getMonth() + 1, 1);
      updateMainContentView(parentContainer);
    });
  }

  // 3. Mobile Today Button
  const btnToday = container.querySelector('.mobile-cal-btn-today');
  if (btnToday) {
    btnToday.addEventListener('click', () => {
      activeCalendarDate = new Date();
      selectedMobileDate = formatLocalDateKey(new Date());
      updateMainContentView(parentContainer);
    });
  }

  // 4. Mobile Day Cell Selection
  container.querySelectorAll('.mobile-cal-cell').forEach(cell => {
    cell.addEventListener('click', () => {
      const dateStr = cell.getAttribute('data-date');
      if (!dateStr) return;

      // If user tapped a trailing cell from another month, seamlessly navigate to that month
      if (cell.classList.contains('other-month')) {
        const parts = dateStr.split('-').map(Number);
        if (parts.length === 3 && (parts[0] !== activeCalendarDate.getFullYear() || (parts[1] - 1) !== activeCalendarDate.getMonth())) {
          activeCalendarDate = new Date(parts[0], parts[1] - 1, 1);
          selectedMobileDate = dateStr;
          updateMainContentView(parentContainer);
          return;
        }
      }

      selectedMobileDate = dateStr;

      // Update UI active selection
      container.querySelectorAll('.mobile-cal-cell').forEach(c => c.classList.remove('selected'));
      cell.classList.add('selected');

      // Update Agenda List View
      const agendaEl = container.querySelector('#mobile-calendar-agenda');
      if (agendaEl) {
        agendaEl.innerHTML = renderMobileAgendaHtml(selectedMobileDate, posts);
        attachMobileAgendaListeners(agendaEl, parentContainer, posts);
      }
    });
  });

  // 5. Initial Mobile Agenda Listeners
  const agendaEl = container.querySelector('#mobile-calendar-agenda');
  if (agendaEl) {
    attachMobileAgendaListeners(agendaEl, parentContainer, posts);
  }
}

function attachMobileAgendaListeners(agendaEl, parentContainer, posts) {
  if (!agendaEl) return;

  // New post / slot schedule
  agendaEl.querySelectorAll('.btn-mobile-schedule-slot').forEach(btn => {
    btn.addEventListener('click', () => {
      const date = btn.getAttribute('data-date') || selectedMobileDate;
      openScheduleModal({ initialDate: date });
    });
  });

  // Edit post
  agendaEl.querySelectorAll('.btn-mobile-edit-post').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      const post = scheduledPostsCache.find(p => p.id === id);
      if (post) openScheduleModal({ isEdit: true, post });
    });
  });

  // Post Options Menu
  agendaEl.querySelectorAll('.btn-mobile-menu-post').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      const post = scheduledPostsCache.find(p => p.id === id);
      if (post) openPostActionMenu(post, parentContainer);
    });
  });

  // Delete Post
  agendaEl.querySelectorAll('.btn-mobile-delete-post').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      deleteScheduledPostAction(id, parentContainer);
    });
  });
}

function renderScheduledPostPill(post) {
  const platformColors = {
    instagram: { bg: 'rgba(225, 48, 108, 0.2)', border: 'rgba(225, 48, 108, 0.5)', text: '#f472b6', icon: '📸' },
    tiktok: { bg: 'rgba(0, 242, 254, 0.2)', border: 'rgba(0, 242, 254, 0.5)', text: '#38bdf8', icon: '🎵' },
    youtube: { bg: 'rgba(255, 0, 0, 0.2)', border: 'rgba(255, 0, 0, 0.5)', text: '#f87171', icon: '▶️' },
    linkedin: { bg: 'rgba(10, 102, 194, 0.2)', border: 'rgba(10, 102, 194, 0.5)', text: '#60a5fa', icon: '💼' },
    x: { bg: 'rgba(255, 255, 255, 0.12)', border: 'rgba(255, 255, 255, 0.3)', text: '#e2e8f0', icon: '🪶' },
    threads: { bg: 'rgba(168, 85, 247, 0.2)', border: 'rgba(168, 85, 247, 0.5)', text: '#c084fc', icon: '🧵' },
    facebook: { bg: 'rgba(24, 119, 242, 0.2)', border: 'rgba(24, 119, 242, 0.5)', text: '#60a5fa', icon: '📘' },
  };

  const theme = platformColors[post.platform] || { bg: 'rgba(99, 102, 241, 0.2)', border: 'rgba(99, 102, 241, 0.5)', text: '#a5b4fc', icon: '🎥' };
  const timeStr = new Date(post.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const isCrossPost = Boolean(post.cross_post_group_id);

  return `
    <div class="scheduled-post-pill" draggable="true" data-id="${post.id}" style="background: ${theme.bg}; border: 1px solid ${theme.border}; color: ${theme.text}; padding: 5px 7px; border-radius: 6px; font-size: 11px; font-weight: 700; cursor: grab; display: flex; align-items: center; justify-content: space-between; gap: 4px; overflow: hidden; transition: all 0.15s ease; user-select: none;" title="${post.video_title || 'Scheduled Post'} (${timeStr}) ${isCrossPost ? '• 🔗 Cross-Posted Group' : ''} — Drag to reschedule or click for options">
      <div style="display: flex; align-items: center; gap: 4px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; flex: 1;">
        <span>${theme.icon}</span>
        ${isCrossPost ? '<span style="font-size: 9px; opacity: 0.85;" title="Part of a Multi-Platform Cross-Post">🔗</span>' : ''}
        <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 80px;">${post.video_title || 'Post'}</span>
      </div>
      <div style="display: flex; align-items: center; gap: 3px; flex-shrink: 0;">
        <span style="font-size: 9px; opacity: 0.85; background: rgba(0,0,0,0.25); padding: 1px 4px; border-radius: 4px;">${timeStr}</span>
        <button class="pill-quick-delete" data-id="${post.id}" title="Remove this scheduled post" style="background: rgba(239,68,68,0.25); border: none; color: #fca5a5; font-size: 10px; border-radius: 3px; cursor: pointer; padding: 1px 4px; line-height: 1;">✕</button>
      </div>
    </div>
  `;
}

function renderQueueView(container, posts, parentContainer) {
  if (posts.length === 0) {
    container.innerHTML = `
      <div style="background: var(--card-bg, rgba(30, 41, 59, 0.5)); border: 1px dashed var(--border-color, rgba(255, 255, 255, 0.2)); border-radius: 16px; padding: 48px; text-align: center;">
        <div style="font-size: 40px; margin-bottom: 12px;">📭</div>
        <h3 style="margin: 0 0 8px 0; font-size: 18px; font-weight: 800;">No scheduled posts in queue</h3>
        <p style="margin: 0 0 20px 0; color: #94a3b8; font-size: 14px;">All scheduled slots are clear. Click below to schedule a new reel.</p>
        <button id="btn-queue-schedule-first" style="background: linear-gradient(135deg, #6366f1, #a855f7); color: #fff; border: none; font-weight: 700; padding: 10px 20px; border-radius: 10px; cursor: pointer;">
          ✨ Schedule Your First Post
        </button>
      </div>
    `;

    const btnFirst = container.querySelector('#btn-queue-schedule-first');
    if (btnFirst) btnFirst.addEventListener('click', () => openScheduleModal());
    return;
  }

  // Sort queue chronologically
  const sorted = [...posts].sort((a,b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());

  let queueHtml = `
    <div style="display: flex; flex-direction: column; gap: 14px;">
  `;

  sorted.forEach(post => {
    const d = new Date(post.scheduled_at);
    const formattedDate = d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
    const formattedTime = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const isPublished = post.status === 'published';
    const isCrossPost = Boolean(post.cross_post_group_id);
    const siblingCrossPosts = isCrossPost
      ? scheduledPostsCache.filter(p => p.cross_post_group_id === post.cross_post_group_id && p.id !== post.id)
      : [];

    queueHtml += `
      <div class="queue-item-card" data-id="${post.id}" style="background: var(--card-bg, rgba(30, 41, 59, 0.6)); border: 1px solid var(--border-color, rgba(255, 255, 255, 0.1)); border-radius: 14px; padding: 16px 20px; display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 16px; transition: all 0.2s ease;">
        
        <div style="display: flex; align-items: center; gap: 16px; flex: 1; min-width: 280px;">
          <div style="width: 50px; height: 50px; border-radius: 10px; background: rgba(99, 102, 241, 0.15); border: 1px solid rgba(99, 102, 241, 0.3); display: flex; align-items: center; justify-content: center; font-size: 22px; flex-shrink: 0;">
            ${getPlatformIcon(post.platform)}
          </div>
          <div>
            <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
              <h4 style="margin: 0; font-size: 16px; font-weight: 800; color: #f8fafc;">${post.video_title || 'Creator Reel'}</h4>
              <span style="font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 12px; background: ${isPublished ? 'rgba(16, 185, 129, 0.2)' : 'rgba(99, 102, 241, 0.2)'}; color: ${isPublished ? '#34d399' : '#a5b4fc'}; text-transform: uppercase;">
                ${isPublished ? 'Published' : 'Scheduled'}
              </span>
              ${isCrossPost ? `
                <span style="font-size: 10px; font-weight: 700; padding: 2px 7px; border-radius: 10px; background: rgba(168, 85, 247, 0.2); color: #c084fc; border: 1px solid rgba(168, 85, 247, 0.4); display: flex; align-items: center; gap: 3px;">
                  <span>🔗 Cross-Posted</span>
                  ${siblingCrossPosts.length > 0 ? `<span style="opacity: 0.8;">(+${siblingCrossPosts.length} platforms)</span>` : ''}
                </span>
              ` : ''}
            </div>
            <div style="font-size: 13px; color: #94a3b8; margin-top: 4px; display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
              <span>📅 ${formattedDate} @ ${formattedTime}</span>
              <span>Platform: <strong style="color: #e2e8f0; text-transform: capitalize;">${post.platform}</strong></span>
              ${siblingCrossPosts.length > 0 ? `
                <span style="font-size: 11px; color: #a5b4fc;">
                  Also synced to: ${siblingCrossPosts.map(p => getPlatformIcon(p.platform)).join(' ')}
                </span>
              ` : ''}
            </div>
            ${post.caption_text ? `<p style="margin: 6px 0 0 0; font-size: 12px; color: #cbd5e1; max-width: 600px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">"${post.caption_text}"</p>` : ''}
          </div>
        </div>

        <div style="display: flex; align-items: center; gap: 10px;">
          <button class="btn-cross-post-item" data-id="${post.id}" style="background: rgba(168, 85, 247, 0.15); border: 1px solid rgba(168, 85, 247, 0.4); color: #c084fc; font-size: 13px; font-weight: 700; padding: 8px 12px; border-radius: 8px; cursor: pointer;" title="Cross-post this video to other social channels">
            🚀 Cross-Post
          </button>
          <button class="btn-edit-schedule-item" data-id="${post.id}" style="background: rgba(99, 102, 241, 0.15); border: 1px solid rgba(99, 102, 241, 0.4); color: #a5b4fc; font-size: 13px; font-weight: 700; padding: 8px 14px; border-radius: 8px; cursor: pointer;">
            ✏️ Edit
          </button>
          ${!isPublished ? `
            <button class="btn-publish-now-item" data-id="${post.id}" style="background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.4); color: #34d399; font-size: 13px; font-weight: 700; padding: 8px 14px; border-radius: 8px; cursor: pointer;">
              ⚡ Publish Now
            </button>
          ` : `
            <span style="font-size: 12px; color: #10b981; font-weight: 700;">✓ Dispatched</span>
          `}
          <button class="btn-delete-schedule-item" data-id="${post.id}" style="background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.3); color: #f87171; font-size: 13px; font-weight: 700; padding: 8px 12px; border-radius: 8px; cursor: pointer;">
            🗑️ Cancel
          </button>
        </div>

      </div>
    `;
  });

  queueHtml += `</div>`;
  container.innerHTML = queueHtml;

  // Cross-Post button click
  container.querySelectorAll('.btn-cross-post-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const postId = btn.getAttribute('data-id');
      const post = scheduledPostsCache.find(p => p.id === postId);
      if (post) {
        openCrossPostModal(post, parentContainer);
      }
    });
  });

  // Edit button click
  container.querySelectorAll('.btn-edit-schedule-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const postId = btn.getAttribute('data-id');
      const post = scheduledPostsCache.find(p => p.id === postId);
      if (post) {
        openScheduleModal({ isEdit: true, post });
      }
    });
  });

  // Publish Now button click
  container.querySelectorAll('.btn-publish-now-item').forEach(btn => {
    btn.addEventListener('click', async () => {
      const postId = btn.getAttribute('data-id');
      try {
        btn.textContent = 'Publishing...';
        btn.disabled = true;
        const res = await fetch(`/api/publish/schedule/${postId}/publish-now`, { method: 'POST' });
        const json = await res.json();
        if (json.success) {
          showToast('⚡ Post published immediately!');
          await loadScheduledPosts(parentContainer);
        } else {
          showToast(json.error || 'Publish failed', true);
        }
      } catch (e) {
        showToast('Error publishing post', true);
      }
    });
  });

  // Cancel / Delete button click
  container.querySelectorAll('.btn-delete-schedule-item').forEach(btn => {
    btn.addEventListener('click', async () => {
      const postId = btn.getAttribute('data-id');
      deleteScheduledPostAction(postId, parentContainer);
    });
  });
}

function getPlatformIcon(platform) {
  const icons = {
    instagram: '📸',
    tiktok: '🎵',
    youtube: '▶️',
    linkedin: '💼',
    x: '🪶',
    threads: '🧵',
    facebook: '📘'
  };
  return icons[platform] || '🎥';
}

function openPostActionMenu(post, parentContainer) {
  const modalOverlay = document.createElement('div');
  modalOverlay.className = 'post-action-modal';
  modalOverlay.style.cssText = `
    position: fixed; inset: 0; background: rgba(0,0,0,0.7); backdrop-filter: blur(6px);
    z-index: 10000; display: flex; align-items: center; justify-content: center; padding: 20px;
  `;

  const d = new Date(post.scheduled_at);
  const formattedDate = d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
  const formattedTime = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  modalOverlay.innerHTML = `
    <div style="background: var(--card-bg, #1e293b); border: 1px solid var(--border-color, rgba(255,255,255,0.15)); border-radius: 16px; width: 100%; max-width: 480px; padding: 24px; color: #fff; box-shadow: 0 20px 50px rgba(0,0,0,0.5);">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px;">
        <div>
          <span style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: #818cf8; letter-spacing: 0.5px;">Scheduled Post Options</span>
          <h3 style="margin: 4px 0 0 0; font-size: 18px; font-weight: 800;">${post.video_title || 'Creator Reel'}</h3>
        </div>
        <button id="close-post-action-modal" style="background: transparent; border: none; color: #94a3b8; font-size: 20px; cursor: pointer;">✕</button>
      </div>

      <div style="background: rgba(15, 23, 42, 0.6); padding: 14px; border-radius: 10px; margin-bottom: 20px; font-size: 13px; color: #cbd5e1;">
        <div><strong>Platform:</strong> ${getPlatformIcon(post.platform)} ${(post.platform || 'instagram').toUpperCase()}</div>
        <div style="margin-top: 4px;"><strong>Scheduled For:</strong> ${formattedDate} @ ${formattedTime}</div>
        ${post.cross_post_group_id ? `<div style="margin-top: 4px; color: #c084fc; font-weight: 700;">🔗 Multi-Platform Cross-Post Group</div>` : ''}
        ${post.caption_text ? `<div style="margin-top: 6px; color: #94a3b8; font-style: italic; max-height: 80px; overflow-y: auto;">"${post.caption_text}"</div>` : ''}
      </div>

      <div style="display: flex; flex-direction: column; gap: 10px;">
        <button id="btn-action-crosspost" style="background: linear-gradient(135deg, #8b5cf6, #d946ef); color: #fff; border: none; font-weight: 700; padding: 12px; border-radius: 10px; cursor: pointer; font-size: 14px; display: flex; align-items: center; justify-content: center; gap: 8px;">
          <span>🚀 Cross-Post to Other Platforms</span>
        </button>

        <button id="btn-action-edit-post" style="background: linear-gradient(135deg, #6366f1, #8b5cf6); color: #fff; border: none; font-weight: 700; padding: 12px; border-radius: 10px; cursor: pointer; font-size: 14px;">
          ✏️ Edit Post & Schedule
        </button>

        ${post.status !== 'published' ? `
          <button id="btn-action-publish-now" style="background: linear-gradient(135deg, #10b981, #059669); color: #fff; border: none; font-weight: 700; padding: 12px; border-radius: 10px; cursor: pointer; font-size: 14px;">
            ⚡ Publish Immediately Now
          </button>
        ` : ''}

        <button id="btn-action-cancel-post" style="background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.4); color: #f87171; font-weight: 700; padding: 12px; border-radius: 10px; cursor: pointer; font-size: 14px;">
          🗑️ Cancel & Remove Schedule
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(modalOverlay);

  modalOverlay.querySelector('#close-post-action-modal').addEventListener('click', () => {
    modalOverlay.remove();
  });

  // Cross-Post handler
  modalOverlay.querySelector('#btn-action-crosspost').addEventListener('click', () => {
    modalOverlay.remove();
    openCrossPostModal(post, parentContainer);
  });

  // Edit handler
  modalOverlay.querySelector('#btn-action-edit-post').addEventListener('click', () => {
    modalOverlay.remove();
    openScheduleModal({ isEdit: true, post });
  });

  // Publish now handler
  const btnPublishNow = modalOverlay.querySelector('#btn-action-publish-now');
  if (btnPublishNow) {
    btnPublishNow.addEventListener('click', async () => {
      btnPublishNow.textContent = 'Publishing...';
      btnPublishNow.disabled = true;
      try {
        const res = await fetch(`/api/publish/schedule/${post.id}/publish-now`, { method: 'POST' });
        const json = await res.json();
        if (json.success) {
          showToast('⚡ Published immediately!');
          modalOverlay.remove();
          await loadScheduledPosts(parentContainer);
        }
      } catch (e) {
        showToast('Publish failed', true);
      }
    });
  }

  // Cancel / Delete handler
  modalOverlay.querySelector('#btn-action-cancel-post').addEventListener('click', async () => {
    modalOverlay.remove();
    deleteScheduledPostAction(post.id, parentContainer);
  });
}

// Master Schedule Modal: Multi-Platform, Edit Mode, Video Library Asset Picker, AI Copy, & 9:16 Mockup
export async function openScheduleModal(initialData = {}) {
  const isEdit = initialData.isEdit && initialData.post;
  const post = initialData.post || {};

  const modalOverlay = document.createElement('div');
  modalOverlay.style.cssText = `
    position: fixed; inset: 0; background: rgba(0,0,0,0.8); backdrop-filter: blur(10px);
    z-index: 10000; display: flex; align-items: center; justify-content: center; padding: 16px;
  `;

  // Prepopulate dates
  let dateVal = initialData.initialDate || formatLocalDateKey(new Date());
  let timeVal = initialData.initialTime || '18:00';
  if (isEdit && post.scheduled_at) {
    const d = new Date(post.scheduled_at);
    dateVal = formatLocalDateKey(d);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    timeVal = `${hh}:${mm}`;
  }

  // Initial title, caption, video info
  let initialTitle = isEdit ? post.video_title : (initialData.title || initialData.videoTitle || '');
  let initialCaption = isEdit ? post.caption_text : (initialData.caption || '');
  if (!isEdit && initialData.hashtags && initialData.hashtags.length > 0) {
    const tagStr = Array.isArray(initialData.hashtags)
      ? initialData.hashtags.map(t => (t.startsWith('#') ? t : `#${t}`)).join(' ')
      : String(initialData.hashtags);
    if (!initialCaption.includes(tagStr.slice(0, 15))) {
      initialCaption = initialCaption ? `${initialCaption}\n\n${tagStr}` : tagStr;
    }
  }
  let initialVideoId = isEdit ? post.video_id : (initialData.videoId || '');
  let initialFileUrl = isEdit ? post.file_url : (initialData.fileUrl || initialData.videoUrl || initialData.blobUrl || '');
  let initialThumbnail = isEdit ? post.thumbnail_url : (initialData.thumbnailUrl || '');
  let activePreviewPlatform = isEdit ? post.platform : (initialData.initialPlatform || 'instagram');

  // Selected cross-posting platforms
  let selectedPlatforms = isEdit
    ? [post.platform]
    : [initialData.initialPlatform || 'instagram'];

  // Fetch video library for the video selector
  let videos = [];
  try {
    const vRes = await api.listVideos();
    videos = vRes || [];
    videoLibraryCache = videos;
  } catch (err) {
    console.warn('Could not load video library:', err);
  }

  // If initial video info was supplied, ensure it exists in the active video cache
  if ((initialVideoId || initialFileUrl) && !videos.some(v => v.id === initialVideoId || (initialFileUrl && v.file_url === initialFileUrl))) {
    videos.unshift({
      id: initialVideoId || `vid_${Date.now()}`,
      title: initialTitle || 'Exported Reel Asset',
      file_url: initialFileUrl,
      thumbnail_url: initialThumbnail,
      aspect_ratio: '9:16'
    });
  }

  modalOverlay.innerHTML = `
    <div style="background: var(--card-bg, #1e293b); border: 1px solid var(--border-color, rgba(255,255,255,0.15)); border-radius: 20px; width: 100%; max-width: 1060px; max-height: 92vh; display: flex; flex-direction: column; color: #fff; box-shadow: 0 25px 60px rgba(0,0,0,0.7); overflow: hidden;">
      
      <!-- Modal Top Bar -->
      <div style="display: flex; justify-content: space-between; align-items: center; padding: 18px 24px; border-bottom: 1px solid rgba(255,255,255,0.08); background: rgba(15, 23, 42, 0.7);">
        <div>
          <h3 style="margin: 0; font-size: 19px; font-weight: 800; display: flex; align-items: center; gap: 8px;">
            ${isEdit ? '✏️ Edit Scheduled Post' : '📅 Schedule New Post'}
          </h3>
          <p style="margin: 3px 0 0 0; font-size: 12px; color: #94a3b8;">
            ${isEdit ? 'Update caption, timing, or target platforms for this scheduled reel.' : 'Cross-post to Instagram Reels, TikTok, and YouTube Shorts simultaneously with live 9:16 preview.'}
          </p>
        </div>
        <button id="close-schedule-modal" style="background: transparent; border: none; color: #94a3b8; font-size: 22px; cursor: pointer; padding: 4px;">✕</button>
      </div>

      <!-- Modal Body (Two-Column Layout: Form & 9:16 Device Mockup) -->
      <div class="schedule-modal-body" style="display: grid; grid-template-columns: 1fr 380px; flex: 1; overflow-y: auto; background: rgba(15, 23, 42, 0.4);">
        
        <!-- Left Column: Form & AI Controls -->
        <div style="padding: 24px; display: flex; flex-direction: column; gap: 18px; border-right: 1px solid rgba(255,255,255,0.08); overflow-y: auto;">
          
          <!-- Video Library / Custom Source Picker -->
          <div>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
              <label style="font-size: 12px; font-weight: 700; color: #94a3b8; text-transform: uppercase;">
                Video Asset
              </label>
              ${videos.length > 0 ? `
                <button type="button" id="btn-toggle-video-library" style="background: rgba(99, 102, 241, 0.15); border: 1px solid rgba(99, 102, 241, 0.35); color: #a5b4fc; font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: 6px; cursor: pointer;">
                  🎞️ Choose from Video Library (${videos.length})
                </button>
              ` : ''}
            </div>

            <!-- Video Library Dropdown / Selector (Toggleable) -->
            <div id="video-library-selector" style="display: ${(initialVideoId || initialFileUrl) ? 'block' : 'none'}; background: rgba(15, 23, 42, 0.8); border: 1px solid rgba(99, 102, 241, 0.4); border-radius: 10px; padding: 10px 12px; margin-bottom: 10px;">
              <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px;">
                <div style="display: flex; align-items: center; gap: 10px; overflow: hidden;">
                  <span style="font-size: 20px;">🎬</span>
                  <div style="overflow: hidden;">
                    <div id="selected-video-label" style="font-size: 13px; font-weight: 700; color: #a5b4fc; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                      ${initialTitle || 'Attached Video Asset'}
                    </div>
                    <div style="font-size: 11px; color: #64748b;">Ready for multi-platform dispatch</div>
                  </div>
                </div>
                <button type="button" id="btn-clear-selected-video" style="background: transparent; border: none; color: #94a3b8; font-size: 14px; cursor: pointer;">✕</button>
              </div>
            </div>

            <!-- Video Title Input -->
            <input type="text" id="sched-video-title" required placeholder="e.g. 3 AI Tools That Feel Illegal in 2026" value="${initialTitle}" style="width: 100%; background: rgba(15, 23, 42, 0.7); border: 1px solid rgba(255, 255, 255, 0.15); color: #fff; padding: 12px; border-radius: 10px; font-size: 14px; box-sizing: border-box;" />
          </div>

          <!-- Multi-Platform Cross-Posting Grid & Bundle Presets -->
          <div style="background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(99, 102, 241, 0.25); border-radius: 14px; padding: 16px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; flex-wrap: wrap; gap: 8px;">
              <div style="display: flex; align-items: center; gap: 8px;">
                <span style="font-size: 16px;">🚀</span>
                <div>
                  <label style="font-size: 12px; font-weight: 800; color: #f1f5f9; text-transform: uppercase; letter-spacing: 0.5px;">
                    ${isEdit ? 'Target Platform' : 'Multi-Platform Cross-Posting'}
                  </label>
                  <div style="font-size: 11px; color: #94a3b8;">
                    ${isEdit ? 'Select destination channel' : 'Select multiple platforms to publish simultaneously'}
                  </div>
                </div>
              </div>
              ${!isEdit ? `
                <div style="display: flex; gap: 6px; align-items: center; flex-wrap: wrap;">
                  <button type="button" id="btn-select-all-platforms" title="Instagram, TikTok, Shorts, Threads, FB Reels" style="background: rgba(99, 102, 241, 0.2); border: 1px solid rgba(99, 102, 241, 0.4); color: #a5b4fc; font-size: 11px; font-weight: 700; padding: 4px 9px; border-radius: 6px; cursor: pointer; transition: all 0.15s ease;">
                    ⚡ Short-Form
                  </button>
                  <button type="button" id="btn-select-all-social" title="All 7 social platforms" style="background: rgba(168, 85, 247, 0.2); border: 1px solid rgba(168, 85, 247, 0.4); color: #d8b4fe; font-size: 11px; font-weight: 700; padding: 4px 9px; border-radius: 6px; cursor: pointer; transition: all 0.15s ease;">
                    🌐 All 7 Platforms
                  </button>
                </div>
              ` : ''}
            </div>

            <!-- Platform Toggles -->
            <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px;" id="platform-selection-container">
              ${renderPlatformToggle('instagram', '📸 Reels', selectedPlatforms.includes('instagram'), isEdit)}
              ${renderPlatformToggle('tiktok', '🎵 TikTok', selectedPlatforms.includes('tiktok'), isEdit)}
              ${renderPlatformToggle('youtube', '▶️ Shorts', selectedPlatforms.includes('youtube'), isEdit)}
              ${renderPlatformToggle('threads', '🧵 Threads', selectedPlatforms.includes('threads'), isEdit)}
              ${renderPlatformToggle('x', '🪶 X', selectedPlatforms.includes('x'), isEdit)}
              ${renderPlatformToggle('linkedin', '💼 LinkedIn', selectedPlatforms.includes('linkedin'), isEdit)}
              ${renderPlatformToggle('facebook', '📘 FB Reels', selectedPlatforms.includes('facebook'), isEdit)}
            </div>

            ${!isEdit ? `
              <!-- Simultaneous vs Stagger Timing Mode Switcher -->
              <div style="background: rgba(10, 15, 30, 0.85); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 10px; padding: 10px 12px; display: flex; flex-direction: column; gap: 8px;">
                <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
                  <div style="display: flex; align-items: center; gap: 6px;">
                    <span style="font-size: 13px;">⚡</span>
                    <span style="font-size: 12px; font-weight: 700; color: #e2e8f0;">Dispatch Strategy:</span>
                  </div>

                  <div style="display: flex; gap: 4px; background: rgba(30, 41, 59, 0.8); padding: 3px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1);">
                    <button type="button" id="btn-dispatch-mode-simultaneous" class="dispatch-mode-tab active" style="background: #6366f1; color: #ffffff; border: none; font-size: 11px; font-weight: 700; padding: 5px 10px; border-radius: 6px; cursor: pointer; transition: all 0.15s ease;">
                      ⚡ Post Simultaneously
                    </button>
                    <button type="button" id="btn-dispatch-mode-stagger" class="dispatch-mode-tab" style="background: transparent; color: #94a3b8; border: none; font-size: 11px; font-weight: 700; padding: 5px 10px; border-radius: 6px; cursor: pointer; transition: all 0.15s ease;">
                      ⏱️ Stagger Delays
                    </button>
                  </div>
                </div>

                <!-- Stagger dropdown container (visible only when Stagger mode selected) -->
                <div id="stagger-dropdown-box" style="display: none; align-items: center; justify-content: space-between; padding-top: 6px; border-top: 1px solid rgba(255,255,255,0.06);">
                  <span style="font-size: 11px; color: #94a3b8;">Interval between platforms:</span>
                  <select id="sched-stagger-minutes" style="background: rgba(30, 41, 59, 0.95); border: 1px solid rgba(99, 102, 241, 0.3); color: #e2e8f0; font-size: 11px; font-weight: 700; padding: 4px 8px; border-radius: 6px; cursor: pointer;">
                    <option value="15" selected>⏱️ +15 mins stagger</option>
                    <option value="30">⏱️ +30 mins stagger</option>
                    <option value="60">⏱️ +1 hour stagger</option>
                  </select>
                </div>

                <!-- Live Dispatch Summary Pill -->
                <div id="dispatch-summary-banner" style="background: rgba(99, 102, 241, 0.12); border: 1px solid rgba(99, 102, 241, 0.25); border-radius: 6px; padding: 6px 10px; font-size: 11px; color: #c7d2fe; display: flex; align-items: center; gap: 6px;">
                  <span id="dispatch-summary-icon">⚡</span>
                  <span id="dispatch-summary-text">Simultaneous Cross-Posting: 1 platform selected.</span>
                </div>
              </div>
            ` : ''}
          </div>

          <!-- Date & Time Pickers -->
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
            <div>
              <label style="display: block; font-size: 12px; font-weight: 700; color: #94a3b8; margin-bottom: 6px; text-transform: uppercase;">
                Posting Date
              </label>
              <input type="date" id="sched-date" required value="${dateVal}" style="width: 100%; background: rgba(15, 23, 42, 0.7); border: 1px solid rgba(255, 255, 255, 0.15); color: #fff; padding: 11px 12px; border-radius: 10px; font-size: 13px; box-sizing: border-box;" />
            </div>

            <div>
              <label style="display: block; font-size: 12px; font-weight: 700; color: #94a3b8; margin-bottom: 6px; text-transform: uppercase;">
                Posting Time
              </label>
              <input type="time" id="sched-time" required value="${timeVal}" style="width: 100%; background: rgba(15, 23, 42, 0.7); border: 1px solid rgba(255, 255, 255, 0.15); color: #fff; padding: 11px 12px; border-radius: 10px; font-size: 13px; box-sizing: border-box;" />
            </div>
          </div>

          <!-- Quick Time Presets -->
          <div style="display: flex; gap: 8px; flex-wrap: wrap; align-items: center;">
            <span style="font-size: 11px; color: #64748b; font-weight: 600;">Optimal Windows:</span>
            <button type="button" class="preset-time-btn" data-time="18:00" style="background: rgba(225, 48, 108, 0.15); border: 1px solid rgba(225, 48, 108, 0.35); color: #f472b6; font-size: 11px; font-weight: 700; padding: 4px 9px; border-radius: 6px; cursor: pointer;">
              🔥 6:00 PM (IG Peak)
            </button>
            <button type="button" class="preset-time-btn" data-time="20:30" style="background: rgba(0, 242, 254, 0.15); border: 1px solid rgba(0, 242, 254, 0.35); color: #38bdf8; font-size: 11px; font-weight: 700; padding: 4px 9px; border-radius: 6px; cursor: pointer;">
              🌙 8:30 PM (TikTok)
            </button>
            <button type="button" class="preset-time-btn" data-time="12:00" style="background: rgba(255, 0, 0, 0.15); border: 1px solid rgba(255, 0, 0, 0.35); color: #f87171; font-size: 11px; font-weight: 700; padding: 4px 9px; border-radius: 6px; cursor: pointer;">
              ☀️ 12:00 PM (Shorts)
            </button>
          </div>

          <!-- Embedded AI Copy Assistant Box -->
          <div style="background: linear-gradient(135deg, rgba(99, 102, 241, 0.12), rgba(168, 85, 247, 0.12)); border: 1px solid rgba(168, 85, 247, 0.3); border-radius: 12px; padding: 14px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; flex-wrap: wrap; gap: 8px;">
              <div style="display: flex; align-items: center; gap: 6px;">
                <span style="font-size: 15px;">✨</span>
                <strong style="font-size: 13px; color: #f8fafc;">Embedded AI Copy Assistant</strong>
                <span style="font-size: 10px; background: rgba(99, 102, 241, 0.3); color: #c7d2fe; padding: 2px 6px; border-radius: 4px; font-weight: 700;">Gemini 3.8</span>
              </div>

              <!-- Tone Selector -->
              <select id="ai-copy-tone" style="background: rgba(15, 23, 42, 0.85); border: 1px solid rgba(255,255,255,0.18); color: #e2e8f0; font-size: 11px; font-weight: 600; padding: 5px 9px; border-radius: 6px; cursor: pointer;">
                <option value="Viral & Punchy">🔥 Viral & Punchy</option>
                <option value="Storytelling Hook">📖 Storytelling Hook</option>
                <option value="Value Breakdown">🧠 Value Breakdown</option>
                <option value="Fast Curiosity & FOMO">⚡ Fast Curiosity & FOMO</option>
                <option value="Contrarian Debate">🥊 Contrarian Debate</option>
                <option value="Professional Insight">💼 Professional Insight</option>
              </select>
            </div>

            <!-- AI Action Buttons -->
            <div style="display: flex; gap: 8px; flex-wrap: wrap; align-items: center;">
              <button type="button" id="btn-ai-generate-caption" style="background: linear-gradient(135deg, #6366f1, #a855f7); color: #fff; border: none; font-size: 12px; font-weight: 700; padding: 7px 14px; border-radius: 8px; cursor: pointer; display: flex; align-items: center; gap: 6px; box-shadow: 0 4px 12px rgba(99, 102, 241, 0.35);">
                <span>✨ Generate Full AI Caption</span>
              </button>
              <button type="button" id="btn-ai-generate-hooks" class="ai-action-chip">
                <span>💡 AI Hook Ideas</span>
              </button>
              <button type="button" id="btn-ai-generate-tags" class="ai-action-chip">
                <span>🏷️ AI Viral Tags</span>
              </button>
              <button type="button" id="btn-ai-generate-cta" class="ai-action-chip">
                <span>💬 Add Smart CTA</span>
              </button>
            </div>

            <!-- Dynamic AI Loading Status -->
            <div id="ai-loading-indicator" style="display: none; font-size: 12px; color: #c7d2fe; margin-top: 10px; align-items: center; gap: 8px; padding: 6px 10px; background: rgba(99, 102, 241, 0.18); border-radius: 6px;">
              <span class="ai-generating-pulse" id="ai-loading-text">🔮 Analyzing title and generating platform copy...</span>
            </div>

            <!-- Interactive AI Hooks Drawer -->
            <div id="ai-hooks-drawer" style="display: none; margin-top: 12px; background: rgba(15, 23, 42, 0.9); border: 1px solid rgba(168, 85, 247, 0.35); border-radius: 10px; padding: 12px;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <span style="font-size: 12px; font-weight: 700; color: #f8fafc; display: flex; align-items: center; gap: 6px;">
                  💡 AI Hook Variations for Title:
                </span>
                <button type="button" id="btn-close-hooks-drawer" style="background: none; border: none; color: #94a3b8; font-size: 14px; cursor: pointer; padding: 0 4px;">✕</button>
              </div>
              <div id="ai-hooks-list" style="display: flex; flex-direction: column; gap: 8px;">
                <!-- Dynamically populated hook cards -->
              </div>
            </div>

            <!-- Interactive AI Tags Drawer -->
            <div id="ai-tags-drawer" style="display: none; margin-top: 12px; background: rgba(15, 23, 42, 0.9); border: 1px solid rgba(56, 189, 248, 0.35); border-radius: 10px; padding: 12px;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <span style="font-size: 12px; font-weight: 700; color: #f8fafc; display: flex; align-items: center; gap: 6px;">
                  🏷️ AI-Generated Topic Hashtags:
                </span>
                <div style="display: flex; gap: 6px; align-items: center;">
                  <button type="button" id="btn-append-all-tags" style="background: rgba(56, 189, 248, 0.2); border: 1px solid rgba(56, 189, 248, 0.4); color: #38bdf8; font-size: 10px; font-weight: 700; padding: 3px 8px; border-radius: 4px; cursor: pointer;">Append All</button>
                  <button type="button" id="btn-close-tags-drawer" style="background: none; border: none; color: #94a3b8; font-size: 14px; cursor: pointer; padding: 0 4px;">✕</button>
                </div>
              </div>
              <div id="ai-tags-list" style="display: flex; flex-wrap: wrap; gap: 6px;">
                <!-- Dynamically populated tag chips -->
              </div>
            </div>
          </div>

          <!-- Caption Textarea & Character Meter -->
          <div>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
              <label style="font-size: 12px; font-weight: 700; color: #94a3b8; text-transform: uppercase;">
                Post Caption & Description
              </label>
              <span id="char-meter-label" style="font-size: 12px; font-weight: 700; color: #94a3b8;">
                0 / 2,200 chars
              </span>
            </div>
            <textarea id="sched-caption" rows="4" placeholder="Write, paste, or AI-generate your post copy..." style="width: 100%; background: rgba(15, 23, 42, 0.7); border: 1px solid rgba(255, 255, 255, 0.15); color: #fff; padding: 12px; border-radius: 10px; font-size: 13px; box-sizing: border-box; resize: vertical; line-height: 1.5;">${initialCaption}</textarea>
            <div id="platform-limit-warning" style="display: none; font-size: 11px; color: #f87171; margin-top: 4px; font-weight: 600;"></div>
          </div>

          <!-- Action Buttons -->
          <div style="margin-top: auto; padding-top: 8px; display: flex; gap: 10px;">
            ${isEdit ? `
              <button type="button" id="btn-modal-delete-post" style="background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.4); color: #f87171; font-weight: 700; font-size: 14px; padding: 14px 20px; border-radius: 12px; cursor: pointer; transition: all 0.15s ease;">
                🗑️ Delete Post
              </button>
            ` : ''}
            <button type="button" id="btn-submit-schedule" style="flex: 1; background: linear-gradient(135deg, #6366f1, #a855f7); color: #ffffff; border: none; font-weight: 800; font-size: 15px; padding: 14px; border-radius: 12px; cursor: pointer; box-shadow: 0 4px 18px rgba(99, 102, 241, 0.35); transition: all 0.15s ease;">
              ${isEdit ? '💾 Save Changes' : '✨ Confirm & Schedule Post'}
            </button>
          </div>

        </div>

        <!-- Right Column: 9:16 Live Device Mockup -->
        <div class="desktop-only" style="padding: 20px; background: rgba(10, 15, 30, 0.7); display: flex; flex-direction: column; align-items: center; justify-content: flex-start; gap: 12px; border-left: 1px solid rgba(255,255,255,0.05);">
          
          <!-- Mockup Platform Switcher -->
          <div style="display: flex; align-items: center; background: rgba(15, 23, 42, 0.8); border: 1px solid rgba(255,255,255,0.1); padding: 3px; border-radius: 10px; width: 100%; max-width: 320px; justify-content: space-between;">
            <button type="button" class="btn-preview-platform ${activePreviewPlatform === 'instagram' ? 'active' : ''}" data-plat="instagram" style="flex: 1; padding: 6px 4px; font-size: 11px; font-weight: 700; border: none; border-radius: 7px; cursor: pointer; background: ${activePreviewPlatform === 'instagram' ? 'rgba(225, 48, 108, 0.25)' : 'transparent'}; color: ${activePreviewPlatform === 'instagram' ? '#f472b6' : '#94a3b8'};">
              📸 Reels
            </button>
            <button type="button" class="btn-preview-platform ${activePreviewPlatform === 'tiktok' ? 'active' : ''}" data-plat="tiktok" style="flex: 1; padding: 6px 4px; font-size: 11px; font-weight: 700; border: none; border-radius: 7px; cursor: pointer; background: ${activePreviewPlatform === 'tiktok' ? 'rgba(0, 242, 254, 0.25)' : 'transparent'}; color: ${activePreviewPlatform === 'tiktok' ? '#38bdf8' : '#94a3b8'};">
              🎵 TikTok
            </button>
            <button type="button" class="btn-preview-platform ${activePreviewPlatform === 'youtube' ? 'active' : ''}" data-plat="youtube" style="flex: 1; padding: 6px 4px; font-size: 11px; font-weight: 700; border: none; border-radius: 7px; cursor: pointer; background: ${activePreviewPlatform === 'youtube' ? 'rgba(255, 0, 0, 0.25)' : 'transparent'}; color: ${activePreviewPlatform === 'youtube' ? '#f87171' : '#94a3b8'};">
              ▶️ Shorts
            </button>
          </div>

          <!-- Realistic 9:16 Smartphone Container -->
          <div id="phone-chassis" style="width: 310px; height: 550px; background: #000; border-radius: 36px; border: 4px solid #334155; position: relative; overflow: hidden; box-shadow: 0 20px 40px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.1); display: flex; flex-direction: column;">
            
            <!-- Dynamic Island / Top Notch -->
            <div style="position: absolute; top: 8px; left: 50%; transform: translateX(-50%); width: 80px; height: 18px; background: #000; border-radius: 12px; z-index: 20; display: flex; align-items: center; justify-content: flex-end; padding-right: 6px;">
              <div style="width: 7px; height: 7px; background: #0a0a0a; border: 1px solid #222; border-radius: 50%;"></div>
            </div>

            <!-- Status Bar -->
            <div style="position: absolute; top: 7px; left: 0; right: 0; padding: 0 20px; display: flex; justify-content: space-between; align-items: center; font-size: 10px; font-weight: 700; color: #fff; z-index: 15; text-shadow: 0 1px 2px rgba(0,0,0,0.8);">
              <span>9:41</span>
              <div style="display: flex; gap: 4px; align-items: center;">
                <span>5G</span>
                <span>🔋</span>
              </div>
            </div>

            <!-- Video / Media Canvas Area -->
            <div id="mockup-video-canvas" style="flex: 1; width: 100%; height: 100%; position: relative; background: linear-gradient(135deg, #1e1b4b, #311042); display: flex; align-items: center; justify-content: center; overflow: hidden;">
              ${initialFileUrl ? `
                <video src="${initialFileUrl}" autoplay loop muted playsinline style="width: 100%; height: 100%; object-fit: cover;"></video>
              ` : initialThumbnail ? `
                <img src="${initialThumbnail}" style="width: 100%; height: 100%; object-fit: cover;" />
              ` : `
                <!-- Dynamic Waveform Placeholder -->
                <div style="text-align: center; padding: 20px; z-index: 2;">
                  <div style="width: 60px; height: 60px; border-radius: 50%; background: rgba(99,102,241,0.25); border: 1px solid rgba(99,102,241,0.5); display: flex; align-items: center; justify-content: center; margin: 0 auto 12px; font-size: 26px;">
                    ▶️
                  </div>
                  <div id="mockup-bg-title" style="font-size: 14px; font-weight: 800; color: #fff; max-width: 220px; line-height: 1.3; text-shadow: 0 2px 8px rgba(0,0,0,0.9);">
                    ${initialTitle || 'Viral Short-Form Reel'}
                  </div>
                  <div style="font-size: 10px; color: #a5b4fc; margin-top: 6px;">Short-Form 9:16 Frame</div>
                </div>
              `}

              <!-- Dark Gradient Scrim at Bottom for Legibility -->
              <div style="position: absolute; inset: 0; background: linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.3) 35%, transparent 60%); pointer-events: none; z-index: 5;"></div>

              <!-- Right Action Bar (Platform Specific) -->
              <div id="mockup-right-actions" style="position: absolute; right: 10px; bottom: 85px; display: flex; flex-direction: column; align-items: center; gap: 14px; z-index: 10;">
                <!-- Filled dynamically based on activePreviewPlatform -->
              </div>

              <!-- Bottom Content Overlay (Username & Caption) -->
              <div id="mockup-bottom-overlay" style="position: absolute; left: 12px; right: 65px; bottom: 18px; z-index: 10; color: #fff; text-shadow: 0 1px 3px rgba(0,0,0,0.8);">
                <!-- Filled dynamically -->
              </div>

            </div>

          </div>

          <div style="font-size: 11px; color: #64748b; text-align: center;">
            📱 Real-time Short-Form Feed Simulator
          </div>

        </div>

      </div>

    </div>
  `;

  document.body.appendChild(modalOverlay);

  // Close handler
  modalOverlay.querySelector('#close-schedule-modal').addEventListener('click', () => modalOverlay.remove());

  // Input references
  const titleInput = modalOverlay.querySelector('#sched-video-title');
  const captionTextarea = modalOverlay.querySelector('#sched-caption');
  if (titleInput && initialTitle) {
    titleInput.value = initialTitle;
  }
  if (captionTextarea && initialCaption) {
    captionTextarea.value = initialCaption;
  }
  const charMeter = modalOverlay.querySelector('#char-meter-label');
  const warningLabel = modalOverlay.querySelector('#platform-limit-warning');
  const mockupBgTitle = modalOverlay.querySelector('#mockup-bg-title');

  // Video Library Picker toggle
  const btnToggleLib = modalOverlay.querySelector('#btn-toggle-video-library');
  if (btnToggleLib) {
    btnToggleLib.addEventListener('click', () => {
      openInlineVideoPicker(videos, (selectedVid) => {
        initialVideoId = selectedVid.id;
        initialFileUrl = selectedVid.file_url;
        initialThumbnail = selectedVid.thumbnail_url;
        titleInput.value = selectedVid.title;
        if (mockupBgTitle) mockupBgTitle.textContent = selectedVid.title;

        // Show selected label
        const libBox = modalOverlay.querySelector('#video-library-selector');
        const libLabel = modalOverlay.querySelector('#selected-video-label');
        if (libBox && libLabel) {
          libBox.style.display = 'block';
          libLabel.textContent = selectedVid.title;
        }

        // Update video canvas in mockup
        const canvas = modalOverlay.querySelector('#mockup-video-canvas');
        if (canvas) {
          if (selectedVid.file_url) {
            canvas.innerHTML = `
              <video src="${selectedVid.file_url}" autoplay loop muted playsinline style="width: 100%; height: 100%; object-fit: cover;"></video>
              <div style="position: absolute; inset: 0; background: linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.3) 35%, transparent 60%); pointer-events: none; z-index: 5;"></div>
              <div id="mockup-right-actions" style="position: absolute; right: 10px; bottom: 85px; display: flex; flex-direction: column; align-items: center; gap: 14px; z-index: 10;"></div>
              <div id="mockup-bottom-overlay" style="position: absolute; left: 12px; right: 65px; bottom: 18px; z-index: 10; color: #fff; text-shadow: 0 1px 3px rgba(0,0,0,0.8);"></div>
            `;
          } else if (selectedVid.thumbnail_url) {
            canvas.innerHTML = `
              <img src="${selectedVid.thumbnail_url}" style="width: 100%; height: 100%; object-fit: cover;" />
              <div style="position: absolute; inset: 0; background: linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.3) 35%, transparent 60%); pointer-events: none; z-index: 5;"></div>
              <div id="mockup-right-actions" style="position: absolute; right: 10px; bottom: 85px; display: flex; flex-direction: column; align-items: center; gap: 14px; z-index: 10;"></div>
              <div id="mockup-bottom-overlay" style="position: absolute; left: 12px; right: 65px; bottom: 18px; z-index: 10; color: #fff; text-shadow: 0 1px 3px rgba(0,0,0,0.8);"></div>
            `;
          }
          updateDeviceMockupUI();
        }
      });
    });
  }

  // Clear selected video
  const btnClearVid = modalOverlay.querySelector('#btn-clear-selected-video');
  if (btnClearVid) {
    btnClearVid.addEventListener('click', () => {
      initialVideoId = '';
      initialFileUrl = '';
      initialThumbnail = '';
      const libBox = modalOverlay.querySelector('#video-library-selector');
      if (libBox) libBox.style.display = 'none';
    });
  }

  // Dispatch strategy mode switcher (Simultaneous vs Stagger)
  let isSimultaneousMode = true;
  const btnModeSimultaneous = modalOverlay.querySelector('#btn-dispatch-mode-simultaneous');
  const btnModeStagger = modalOverlay.querySelector('#btn-dispatch-mode-stagger');
  const staggerBox = modalOverlay.querySelector('#stagger-dropdown-box');
  const staggerSelect = modalOverlay.querySelector('#sched-stagger-minutes');
  const summaryBanner = modalOverlay.querySelector('#dispatch-summary-banner');
  const summaryIcon = modalOverlay.querySelector('#dispatch-summary-icon');
  const summaryText = modalOverlay.querySelector('#dispatch-summary-text');

  if (btnModeSimultaneous && btnModeStagger) {
    btnModeSimultaneous.addEventListener('click', () => {
      isSimultaneousMode = true;
      btnModeSimultaneous.style.background = '#6366f1';
      btnModeSimultaneous.style.color = '#ffffff';
      btnModeStagger.style.background = 'transparent';
      btnModeStagger.style.color = '#94a3b8';
      if (staggerBox) staggerBox.style.display = 'none';
      updateDispatchSummary();
    });

    btnModeStagger.addEventListener('click', () => {
      isSimultaneousMode = false;
      btnModeStagger.style.background = '#8b5cf6';
      btnModeStagger.style.color = '#ffffff';
      btnModeSimultaneous.style.background = 'transparent';
      btnModeSimultaneous.style.color = '#94a3b8';
      if (staggerBox) staggerBox.style.display = 'flex';
      updateDispatchSummary();
    });
  }

  if (staggerSelect) {
    staggerSelect.addEventListener('change', () => {
      updateDispatchSummary();
    });
  }

  function updateDispatchSummary() {
    if (!summaryText) return;
    const dateInput = modalOverlay.querySelector('#sched-date');
    const timeInput = modalOverlay.querySelector('#sched-time');
    const curDate = dateInput ? dateInput.value : '';
    const curTime = timeInput ? timeInput.value : '';
    const count = selectedPlatforms.length;
    const platNames = selectedPlatforms.map(p => {
      const icons = { instagram: '📸 Reels', tiktok: '🎵 TikTok', youtube: '▶️ Shorts', threads: '🧵 Threads', x: '🪶 X', linkedin: '💼 LinkedIn', facebook: '📘 FB Reels' };
      return icons[p] || p;
    }).join(', ');

    const btnSubmit = modalOverlay.querySelector('#btn-submit-schedule');

    if (isEdit) {
      if (summaryBanner) summaryBanner.style.display = 'none';
      if (btnSubmit) btnSubmit.textContent = '💾 Save Changes';
      return;
    }

    if (isSimultaneousMode || count <= 1) {
      if (summaryIcon) summaryIcon.textContent = '⚡';
      if (summaryBanner) {
        summaryBanner.style.background = 'rgba(99, 102, 241, 0.15)';
        summaryBanner.style.borderColor = 'rgba(99, 102, 241, 0.35)';
        summaryBanner.style.color = '#c7d2fe';
      }
      if (count <= 1) {
        summaryText.innerHTML = `Single channel broadcast to <strong>${platNames}</strong> on ${curDate} @ ${curTime}.`;
        if (btnSubmit) btnSubmit.textContent = '✨ Confirm & Schedule Post';
      } else {
        summaryText.innerHTML = `⚡ <strong>Simultaneous Cross-Posting</strong>: Publishing to <strong>${count} platforms</strong> (${platNames}) at the exact same moment on <strong>${curDate} @ ${curTime}</strong>.`;
        if (btnSubmit) btnSubmit.textContent = `⚡ Schedule to ${count} Platforms Simultaneously`;
      }
    } else {
      const staggerVal = staggerSelect ? parseInt(staggerSelect.value, 10) : 15;
      if (summaryIcon) summaryIcon.textContent = '⏱️';
      if (summaryBanner) {
        summaryBanner.style.background = 'rgba(168, 85, 247, 0.15)';
        summaryBanner.style.borderColor = 'rgba(168, 85, 247, 0.35)';
        summaryBanner.style.color = '#e9d5ff';
      }
      summaryText.innerHTML = `⏱️ <strong>Staggered Cross-Posting</strong>: 1st platform at ${curTime}, spaced by <strong>+${staggerVal}m</strong> across ${count} channels.`;
      if (btnSubmit) btnSubmit.textContent = `⏱️ Schedule ${count} Staggered Posts`;
    }
  }

  // Select all short-form platforms shortcut
  const btnSelectAll = modalOverlay.querySelector('#btn-select-all-platforms');
  if (btnSelectAll) {
    btnSelectAll.addEventListener('click', () => {
      selectedPlatforms = ['instagram', 'tiktok', 'youtube', 'threads', 'facebook'];
      updatePlatformCheckboxes();
      checkCharacterLimits();
      updateDispatchSummary();
    });
  }

  // Select all 7 social platforms shortcut
  const btnSelectAllSocial = modalOverlay.querySelector('#btn-select-all-social');
  if (btnSelectAllSocial) {
    btnSelectAllSocial.addEventListener('click', () => {
      selectedPlatforms = ['instagram', 'tiktok', 'youtube', 'threads', 'x', 'linkedin', 'facebook'];
      updatePlatformCheckboxes();
      checkCharacterLimits();
      updateDispatchSummary();
    });
  }

  // Platform toggle clicks
  modalOverlay.querySelectorAll('.platform-checkbox-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const plat = chip.getAttribute('data-platform');
      if (isEdit) {
        // In edit mode, allow single target platform selection
        selectedPlatforms = [plat];
        activePreviewPlatform = plat;
      } else {
        if (selectedPlatforms.includes(plat)) {
          if (selectedPlatforms.length > 1) {
            selectedPlatforms = selectedPlatforms.filter(p => p !== plat);
          }
        } else {
          selectedPlatforms.push(plat);
        }
        activePreviewPlatform = plat;
      }
      updatePlatformCheckboxes();
      updatePreviewPlatformButtons();
      updateDeviceMockupUI();
      checkCharacterLimits();
      updateDispatchSummary();
    });
  });

  function updatePlatformCheckboxes() {
    modalOverlay.querySelectorAll('.platform-checkbox-chip').forEach(chip => {
      const plat = chip.getAttribute('data-platform');
      const isSelected = selectedPlatforms.includes(plat);
      chip.style.background = isSelected ? 'rgba(99, 102, 241, 0.25)' : 'rgba(255,255,255,0.05)';
      chip.style.borderColor = isSelected ? '#6366f1' : 'rgba(255,255,255,0.12)';
      chip.style.color = isSelected ? '#a5b4fc' : '#94a3b8';
      const checkSpan = chip.querySelector('.plat-check');
      if (checkSpan) checkSpan.textContent = isSelected ? '✓' : '+';
    });
  }

  // Preview Platform Buttons
  modalOverlay.querySelectorAll('.btn-preview-platform').forEach(btn => {
    btn.addEventListener('click', () => {
      activePreviewPlatform = btn.getAttribute('data-plat');
      updatePreviewPlatformButtons();
      updateDeviceMockupUI();
      checkCharacterLimits();
    });
  });

  function updatePreviewPlatformButtons() {
    modalOverlay.querySelectorAll('.btn-preview-platform').forEach(btn => {
      const p = btn.getAttribute('data-plat');
      const isAct = p === activePreviewPlatform;
      btn.style.background = isAct ? 'rgba(99, 102, 241, 0.3)' : 'transparent';
      btn.style.color = isAct ? '#fff' : '#94a3b8';
    });
  }

  // Live Title input updates mockup
  titleInput.addEventListener('input', (e) => {
    if (mockupBgTitle) mockupBgTitle.textContent = e.target.value || 'Short-Form Reel';
    updateDeviceMockupUI();
  });

  // Live Caption input updates character count & mockup
  captionTextarea.addEventListener('input', () => {
    checkCharacterLimits();
    updateDeviceMockupUI();
  });

  function checkCharacterLimits() {
    const textLen = captionTextarea.value.length;
    const limits = {
      instagram: 2200,
      tiktok: 3000,
      youtube: 1000,
      threads: 500,
      x: 280,
      linkedin: 3000,
      facebook: 63206
    };

    const curLimit = limits[activePreviewPlatform] || 2200;
    charMeter.textContent = `${textLen.toLocaleString()} / ${curLimit.toLocaleString()} chars`;

    // Check if any selected platform exceeds its limit
    const exceeded = selectedPlatforms.filter(p => textLen > (limits[p] || 2200));
    if (exceeded.length > 0) {
      warningLabel.style.display = 'block';
      warningLabel.textContent = `⚠️ Caption exceeds character limits for: ${exceeded.map(p => p.toUpperCase()).join(', ')} (${limits[exceeded[0]]} max)`;
      charMeter.style.color = '#f87171';
    } else {
      warningLabel.style.display = 'none';
      charMeter.style.color = '#94a3b8';
    }
  }

  // Date and Time change listeners
  const schedDateInput = modalOverlay.querySelector('#sched-date');
  const schedTimeInput = modalOverlay.querySelector('#sched-time');
  if (schedDateInput) schedDateInput.addEventListener('change', () => updateDispatchSummary());
  if (schedTimeInput) schedTimeInput.addEventListener('change', () => updateDispatchSummary());

  // Time preset buttons
  modalOverlay.querySelectorAll('.preset-time-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const timeVal = btn.getAttribute('data-time');
      const timeInput = modalOverlay.querySelector('#sched-time');
      if (timeInput) {
        timeInput.value = timeVal;
        updateDispatchSummary();
      }
    });
  });

  // Embedded AI Copy Generator Handlers
  const aiIndicator = modalOverlay.querySelector('#ai-loading-indicator');
  const aiLoadingText = modalOverlay.querySelector('#ai-loading-text');
  const btnAiCaption = modalOverlay.querySelector('#btn-ai-generate-caption');
  const btnAiHooks = modalOverlay.querySelector('#btn-ai-generate-hooks');
  const btnAiTags = modalOverlay.querySelector('#btn-ai-generate-tags');
  const btnAiCta = modalOverlay.querySelector('#btn-ai-generate-cta');
  const aiToneSelect = modalOverlay.querySelector('#ai-copy-tone');
  const aiHooksDrawer = modalOverlay.querySelector('#ai-hooks-drawer');
  const aiHooksList = modalOverlay.querySelector('#ai-hooks-list');
  const btnCloseHooks = modalOverlay.querySelector('#btn-close-hooks-drawer');
  const aiTagsDrawer = modalOverlay.querySelector('#ai-tags-drawer');
  const aiTagsList = modalOverlay.querySelector('#ai-tags-list');
  const btnCloseTags = modalOverlay.querySelector('#btn-close-tags-drawer');
  const btnAppendAllTags = modalOverlay.querySelector('#btn-append-all-tags');

  let currentAiCachedResult = null;

  function setAiLoading(isLoading, msg = '🔮 Analyzing title and generating platform copy...') {
    if (aiIndicator) {
      aiIndicator.style.display = isLoading ? 'flex' : 'none';
      if (aiLoadingText) aiLoadingText.textContent = msg;
    }
    if (btnAiCaption) btnAiCaption.disabled = isLoading;
    if (btnAiHooks) btnAiHooks.disabled = isLoading;
    if (btnAiTags) btnAiTags.disabled = isLoading;
    if (btnAiCta) btnAiCta.disabled = isLoading;
  }

  if (btnCloseHooks) {
    btnCloseHooks.addEventListener('click', () => {
      if (aiHooksDrawer) aiHooksDrawer.style.display = 'none';
    });
  }

  if (btnCloseTags) {
    btnCloseTags.addEventListener('click', () => {
      if (aiTagsDrawer) aiTagsDrawer.style.display = 'none';
    });
  }

  // 1. Generate Full Platform Caption
  if (btnAiCaption) {
    btnAiCaption.addEventListener('click', async () => {
      const title = titleInput.value.trim() || 'Top Creator Hacks in 2026';
      const tone = aiToneSelect ? aiToneSelect.value : 'Viral & Punchy';
      setAiLoading(true, `✨ Crafting ${activePreviewPlatform.toUpperCase()} caption with Gemini AI...`);

      try {
        const copyData = await generateAiCopyHelper({
          videoId: initialVideoId || `temp_${Date.now()}`,
          videoTitle: title,
          platform: activePreviewPlatform,
          tone
        });

        currentAiCachedResult = copyData;

        if (copyData && copyData.caption) {
          const tagsStr = (copyData.hashtags || []).map(t => (t.startsWith('#') ? t : `#${t}`)).join(' ');
          captionTextarea.value = `${copyData.caption}\n\n${tagsStr}`.trim();
          showToast('✨ AI Caption generated successfully from title!');
        }
      } catch (err) {
        console.warn('AI caption error:', err);
        showToast('Generated smart offline copy', false);
      } finally {
        setAiLoading(false);
        checkCharacterLimits();
        updateDeviceMockupUI();
      }
    });
  }

  // 2. Generate and Pick AI Hook Ideas
  if (btnAiHooks) {
    btnAiHooks.addEventListener('click', async () => {
      const title = titleInput.value.trim() || 'Create High-Retention Reels';
      const tone = aiToneSelect ? aiToneSelect.value : 'Viral & Punchy';
      setAiLoading(true, `💡 Generating viral hook variations from "${title.slice(0, 30)}..."`);

      try {
        let copyData = currentAiCachedResult;
        if (!copyData || !copyData.hooks || copyData.hooks.length === 0) {
          copyData = await generateAiCopyHelper({
            videoId: initialVideoId || `temp_${Date.now()}`,
            videoTitle: title,
            platform: activePreviewPlatform,
            tone
          });
          currentAiCachedResult = copyData;
        }

        const hooks = (copyData && copyData.hooks && copyData.hooks.length > 0)
          ? copyData.hooks
          : [
              `Stop scrolling if you want to master ${title} 🚨`,
              `The #1 mistake creators make with ${title} 👀`,
              `If you only implement ONE strategy from ${title}, do this 👇`,
              `Why nobody is talking about the truth behind ${title} 💡`
            ];

        if (aiHooksList && aiHooksDrawer) {
          aiHooksList.innerHTML = hooks.map((hook, idx) => `
            <div class="ai-hook-card" data-hook="${encodeURIComponent(hook)}" style="display: flex; justify-content: space-between; align-items: center; gap: 10px;">
              <span style="font-size: 12px; color: #e2e8f0; line-height: 1.4; flex: 1;">${hook}</span>
              <button type="button" class="btn-apply-hook" data-hook="${encodeURIComponent(hook)}" style="background: rgba(168, 85, 247, 0.25); border: 1px solid rgba(168, 85, 247, 0.5); color: #c084fc; font-size: 11px; font-weight: 700; padding: 4px 8px; border-radius: 6px; cursor: pointer; white-space: nowrap;">
                Use Hook
              </button>
            </div>
          `).join('');

          aiHooksDrawer.style.display = 'block';

          aiHooksList.querySelectorAll('.btn-apply-hook, .ai-hook-card').forEach(elem => {
            elem.addEventListener('click', (e) => {
              const hookText = decodeURIComponent(elem.getAttribute('data-hook') || '');
              if (!hookText) return;
              e.stopPropagation();

              const currentVal = captionTextarea.value.trim();
              if (!currentVal) {
                captionTextarea.value = hookText;
              } else {
                captionTextarea.value = `${hookText}\n\n${currentVal}`;
              }

              aiHooksDrawer.style.display = 'none';
              checkCharacterLimits();
              updateDeviceMockupUI();
              showToast('💡 Added viral hook to caption!');
            });
          });
        }
      } catch (err) {
        console.warn('AI hooks error:', err);
        showToast('Generated hooks', false);
      } finally {
        setAiLoading(false);
      }
    });
  }

  // 3. Generate and Pick AI Viral Tags
  if (btnAiTags) {
    btnAiTags.addEventListener('click', async () => {
      const title = titleInput.value.trim() || 'Create High-Retention Reels';
      const tone = aiToneSelect ? aiToneSelect.value : 'Viral & Punchy';
      setAiLoading(true, `🏷️ Generating hyper-relevant hashtags for "${title.slice(0, 30)}..."`);

      try {
        let copyData = currentAiCachedResult;
        if (!copyData || !copyData.hashtags || copyData.hashtags.length === 0) {
          copyData = await generateAiCopyHelper({
            videoId: initialVideoId || `temp_${Date.now()}`,
            videoTitle: title,
            platform: activePreviewPlatform,
            tone
          });
          currentAiCachedResult = copyData;
        }

        const tags = (copyData && copyData.hashtags && copyData.hashtags.length > 0)
          ? copyData.hashtags.map(t => (t.startsWith('#') ? t : `#${t}`))
          : ['#CreatorEconomy', '#ViralReels', '#VideoMarketing', '#KontentOS', '#GrowFast'];

        if (aiTagsList && aiTagsDrawer) {
          aiTagsList.innerHTML = tags.map(tag => `
            <span class="ai-tag-chip" data-tag="${tag}" style="background: rgba(56, 189, 248, 0.15); border: 1px solid rgba(56, 189, 248, 0.35); color: #38bdf8; font-size: 11px; font-weight: 700; padding: 4px 8px; border-radius: 6px; cursor: pointer; transition: all 0.15s ease;">
              ${tag} +
            </span>
          `).join('');

          aiTagsDrawer.style.display = 'block';

          aiTagsList.querySelectorAll('.ai-tag-chip').forEach(chip => {
            chip.addEventListener('click', () => {
              const tag = chip.getAttribute('data-tag');
              const currentVal = captionTextarea.value.trim();
              if (!currentVal.includes(tag)) {
                captionTextarea.value = `${currentVal} ${tag}`.trim();
                chip.style.opacity = '0.5';
                chip.style.pointerEvents = 'none';
                checkCharacterLimits();
                updateDeviceMockupUI();
                showToast(`🏷️ Added ${tag}`);
              }
            });
          });

          if (btnAppendAllTags) {
            btnAppendAllTags.onclick = () => {
              const currentVal = captionTextarea.value.trim();
              captionTextarea.value = `${currentVal}\n\n${tags.join(' ')}`.trim();
              aiTagsDrawer.style.display = 'none';
              checkCharacterLimits();
              updateDeviceMockupUI();
              showToast('🏷️ Appended all viral tags!');
            };
          }
        }
      } catch (err) {
        console.warn('AI tags error:', err);
      } finally {
        setAiLoading(false);
      }
    });
  }

  // 4. Generate Smart CTA
  if (btnAiCta) {
    btnAiCta.addEventListener('click', async () => {
      const title = titleInput.value.trim() || 'Create High-Retention Reels';
      const tone = aiToneSelect ? aiToneSelect.value : 'Viral & Punchy';
      setAiLoading(true, '💬 Generating high-converting Call-to-Action...');

      try {
        let copyData = currentAiCachedResult;
        if (!copyData || !copyData.callToAction) {
          copyData = await generateAiCopyHelper({
            videoId: initialVideoId || `temp_${Date.now()}`,
            videoTitle: title,
            platform: activePreviewPlatform,
            tone
          });
          currentAiCachedResult = copyData;
        }

        const cta = (copyData && copyData.callToAction)
          ? copyData.callToAction
          : "👇 Comment 'GUIDE' below and I'll send you the complete step-by-step breakdown!";

        const currentVal = captionTextarea.value.trim();
        captionTextarea.value = `${currentVal}\n\n${cta}`.trim();
        checkCharacterLimits();
        updateDeviceMockupUI();
        showToast('💬 Added smart CTA!');
      } catch (err) {
        console.warn('AI CTA error:', err);
      } finally {
        setAiLoading(false);
      }
    });
  }

  // Device Mockup UI Renderer
  function updateDeviceMockupUI() {
    const rightActions = modalOverlay.querySelector('#mockup-right-actions');
    const bottomOverlay = modalOverlay.querySelector('#mockup-bottom-overlay');
    if (!rightActions || !bottomOverlay) return;

    const captionRaw = captionTextarea.value.trim() || 'Write or generate your caption to preview in real-time short-form feed...';
    const displayCaption = captionRaw.length > 95 ? `${captionRaw.slice(0, 95)}... <span style="color: #94a3b8; font-weight: bold;">more</span>` : captionRaw;

    if (activePreviewPlatform === 'tiktok') {
      rightActions.innerHTML = `
        <div style="position: relative; margin-bottom: 4px;">
          <div style="width: 38px; height: 38px; border-radius: 50%; background: #6366f1; border: 2px solid #fff; display: flex; align-items: center; justify-content: center; font-size: 16px;">⚡</div>
          <div style="position: absolute; bottom: -4px; left: 50%; transform: translateX(-50%); width: 14px; height: 14px; background: #fe2c55; border-radius: 50%; color: #fff; font-size: 10px; display: flex; align-items: center; justify-content: center; font-weight: 900;">+</div>
        </div>
        <div style="text-align: center;">
          <div style="font-size: 22px;">❤️</div>
          <div style="font-size: 10px; font-weight: 700; color: #fff;">184.2K</div>
        </div>
        <div style="text-align: center;">
          <div style="font-size: 22px;">💬</div>
          <div style="font-size: 10px; font-weight: 700; color: #fff;">1,420</div>
        </div>
        <div style="text-align: center;">
          <div style="font-size: 20px;">🔖</div>
          <div style="font-size: 10px; font-weight: 700; color: #fff;">14.8K</div>
        </div>
        <div style="text-align: center;">
          <div style="font-size: 20px;">↗️</div>
          <div style="font-size: 10px; font-weight: 700; color: #fff;">4,290</div>
        </div>
        <div class="spinning-disc" style="width: 32px; height: 32px; border-radius: 50%; background: #222; border: 4px solid #111; display: flex; align-items: center; justify-content: center; font-size: 12px; margin-top: 4px;">
          🎵
        </div>
      `;

      bottomOverlay.innerHTML = `
        <div style="font-size: 13px; font-weight: 800; color: #fff; margin-bottom: 4px;">@creator.official</div>
        <div style="font-size: 11px; line-height: 1.35; color: #f1f5f9;">${displayCaption}</div>
        <div style="font-size: 10px; color: #cbd5e1; margin-top: 6px; display: flex; align-items: center; gap: 4px;">
          <span>🎵 original sound - KontentOS Studio</span>
        </div>
      `;
    } else if (activePreviewPlatform === 'youtube') {
      rightActions.innerHTML = `
        <div style="text-align: center;">
          <div style="font-size: 22px;">👍</div>
          <div style="font-size: 10px; font-weight: 700; color: #fff;">64K</div>
        </div>
        <div style="text-align: center;">
          <div style="font-size: 22px;">👎</div>
          <div style="font-size: 10px; font-weight: 700; color: #fff;">Dislike</div>
        </div>
        <div style="text-align: center;">
          <div style="font-size: 22px;">💬</div>
          <div style="font-size: 10px; font-weight: 700; color: #fff;">890</div>
        </div>
        <div style="text-align: center;">
          <div style="font-size: 20px;">➡️</div>
          <div style="font-size: 10px; font-weight: 700; color: #fff;">Share</div>
        </div>
        <div style="text-align: center;">
          <div style="font-size: 20px;">🔀</div>
          <div style="font-size: 10px; font-weight: 700; color: #fff;">Remix</div>
        </div>
      `;

      bottomOverlay.innerHTML = `
        <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px;">
          <span style="font-size: 13px; font-weight: 800; color: #fff;">@CreatorHQ</span>
          <span style="background: #ff0000; color: #fff; font-size: 9px; font-weight: 700; padding: 2px 6px; border-radius: 4px;">Subscribe</span>
        </div>
        <div style="font-size: 11px; line-height: 1.35; color: #f1f5f9;">${displayCaption}</div>
        <div style="font-size: 10px; color: #cbd5e1; margin-top: 6px;">▶️ YouTube Shorts • 4K 60fps</div>
      `;
    } else if (activePreviewPlatform === 'threads') {
      rightActions.innerHTML = `
        <div style="text-align: center;">
          <div style="font-size: 22px;">❤️</div>
          <div style="font-size: 10px; font-weight: 700; color: #fff;">3.8K</div>
        </div>
        <div style="text-align: center;">
          <div style="font-size: 22px;">💬</div>
          <div style="font-size: 10px; font-weight: 700; color: #fff;">294</div>
        </div>
        <div style="text-align: center;">
          <div style="font-size: 20px;">🔁</div>
          <div style="font-size: 10px; font-weight: 700; color: #fff;">812</div>
        </div>
        <div style="text-align: center;">
          <div style="font-size: 20px;">✈️</div>
        </div>
      `;

      bottomOverlay.innerHTML = `
        <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px;">
          <span style="font-size: 13px; font-weight: 800; color: #fff;">@creator.threads</span>
          <span style="background: rgba(168, 85, 247, 0.3); color: #e9d5ff; font-size: 9px; font-weight: 700; padding: 2px 6px; border-radius: 4px;">🧵 Threads</span>
        </div>
        <div style="font-size: 11px; line-height: 1.35; color: #f1f5f9;">${displayCaption}</div>
      `;
    } else if (activePreviewPlatform === 'x') {
      rightActions.innerHTML = `
        <div style="text-align: center;">
          <div style="font-size: 20px;">💬</div>
          <div style="font-size: 10px; font-weight: 700; color: #fff;">180</div>
        </div>
        <div style="text-align: center;">
          <div style="font-size: 20px;">🔁</div>
          <div style="font-size: 10px; font-weight: 700; color: #fff;">490</div>
        </div>
        <div style="text-align: center;">
          <div style="font-size: 20px;">❤️</div>
          <div style="font-size: 10px; font-weight: 700; color: #fff;">2.1K</div>
        </div>
        <div style="text-align: center;">
          <div style="font-size: 20px;">📊</div>
          <div style="font-size: 10px; font-weight: 700; color: #fff;">45K</div>
        </div>
        <div style="text-align: center;">
          <div style="font-size: 18px;">🔖</div>
        </div>
      `;

      bottomOverlay.innerHTML = `
        <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px;">
          <span style="font-size: 13px; font-weight: 800; color: #fff;">Creator @kontentos</span>
          <span style="color: #38bdf8; font-size: 11px;">✓</span>
        </div>
        <div style="font-size: 11px; line-height: 1.35; color: #f1f5f9;">${displayCaption}</div>
      `;
    } else if (activePreviewPlatform === 'linkedin') {
      rightActions.innerHTML = `
        <div style="text-align: center;">
          <div style="font-size: 20px;">👏</div>
          <div style="font-size: 10px; font-weight: 700; color: #fff;">842</div>
        </div>
        <div style="text-align: center;">
          <div style="font-size: 20px;">💬</div>
          <div style="font-size: 10px; font-weight: 700; color: #fff;">96</div>
        </div>
        <div style="text-align: center;">
          <div style="font-size: 20px;">🔄</div>
          <div style="font-size: 10px; font-weight: 700; color: #fff;">120</div>
        </div>
        <div style="text-align: center;">
          <div style="font-size: 20px;">📨</div>
        </div>
      `;

      bottomOverlay.innerHTML = `
        <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px;">
          <span style="font-size: 13px; font-weight: 800; color: #fff;">Alex Creator • Founder @ KontentOS</span>
        </div>
        <div style="font-size: 11px; line-height: 1.35; color: #f1f5f9;">${displayCaption}</div>
      `;
    } else if (activePreviewPlatform === 'facebook') {
      rightActions.innerHTML = `
        <div style="text-align: center;">
          <div style="font-size: 22px;">👍</div>
          <div style="font-size: 10px; font-weight: 700; color: #fff;">12.4K</div>
        </div>
        <div style="text-align: center;">
          <div style="font-size: 22px;">💬</div>
          <div style="font-size: 10px; font-weight: 700; color: #fff;">340</div>
        </div>
        <div style="text-align: center;">
          <div style="font-size: 20px;">↗️</div>
          <div style="font-size: 10px; font-weight: 700; color: #fff;">Share</div>
        </div>
      `;

      bottomOverlay.innerHTML = `
        <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px;">
          <span style="font-size: 13px; font-weight: 800; color: #fff;">Creator Studio</span>
          <span style="background: rgba(24, 119, 242, 0.4); color: #fff; font-size: 9px; font-weight: 700; padding: 2px 6px; border-radius: 4px;">📘 FB Reels</span>
        </div>
        <div style="font-size: 11px; line-height: 1.35; color: #f1f5f9;">${displayCaption}</div>
      `;
    } else {
      // Instagram Reels (Default)
      rightActions.innerHTML = `
        <div style="text-align: center;">
          <div style="font-size: 22px;">❤️</div>
          <div style="font-size: 10px; font-weight: 700; color: #fff;">48.2K</div>
        </div>
        <div style="text-align: center;">
          <div style="font-size: 22px;">💬</div>
          <div style="font-size: 10px; font-weight: 700; color: #fff;">418</div>
        </div>
        <div style="text-align: center;">
          <div style="font-size: 20px;">✈️</div>
          <div style="font-size: 10px; font-weight: 700; color: #fff;">Send</div>
        </div>
        <div style="text-align: center;">
          <div style="font-size: 18px;">⋯</div>
        </div>
        <div class="spinning-disc" style="width: 26px; height: 26px; border-radius: 6px; background: #333; border: 2px solid #fff; display: flex; align-items: center; justify-content: center; font-size: 11px;">
          🎵
        </div>
      `;

      bottomOverlay.innerHTML = `
        <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px;">
          <span style="font-size: 13px; font-weight: 800; color: #fff;">creator.os</span>
          <span style="background: rgba(255,255,255,0.2); color: #fff; font-size: 9px; font-weight: 700; padding: 2px 6px; border-radius: 4px;">Follow</span>
        </div>
        <div style="font-size: 11px; line-height: 1.35; color: #f1f5f9;">${displayCaption}</div>
        <div style="font-size: 10px; color: #cbd5e1; margin-top: 6px; display: flex; align-items: center; gap: 4px;">
          <span>🎵 Original Audio • Trending Track</span>
        </div>
      `;
    }
  }

  // Initial mockup setup & dispatch summary
  updateDeviceMockupUI();
  checkCharacterLimits();
  updateDispatchSummary();

  // Modal Delete button handler (for Edit mode)
  const btnModalDelete = modalOverlay.querySelector('#btn-modal-delete-post');
  if (btnModalDelete && isEdit && post.id) {
    btnModalDelete.addEventListener('click', async () => {
      modalOverlay.remove();
      const activeContainer = document.getElementById('active-view-container');
      deleteScheduledPostAction(post.id, activeContainer);
    });
  }

  // Form Submit Handler
  const btnSubmit = modalOverlay.querySelector('#btn-submit-schedule');
  btnSubmit.addEventListener('click', async () => {
    const title = titleInput.value.trim();
    if (!title) {
      showToast('Please enter a video title or topic', true);
      titleInput.focus();
      return;
    }

    const date = modalOverlay.querySelector('#sched-date').value;
    const time = modalOverlay.querySelector('#sched-time').value;
    const caption = captionTextarea.value.trim();
    const staggerEl = modalOverlay.querySelector('#sched-stagger-minutes');
    // In simultaneous mode, delay is strictly 0m
    const staggerMinutes = (!isSimultaneousMode && staggerEl) ? parseInt(staggerEl.value, 10) : 0;

    if (!date || !time) {
      showToast('Please select a valid date and time', true);
      return;
    }

    const [sYear, sMonth, sDay] = date.split('-').map(Number);
    const [sHour, sMin] = time.split(':').map(Number);
    const scheduledIso = new Date(sYear, sMonth - 1, sDay, sHour || 0, sMin || 0, 0).toISOString();

    btnSubmit.textContent = isEdit ? 'Saving...' : 'Scheduling...';
    btnSubmit.disabled = true;

    try {
      if (isEdit) {
        // Update existing post
        const res = await api.updateScheduledPost(post.id, {
          videoTitle: title,
          platform: selectedPlatforms[0] || 'instagram',
          captionText: caption,
          scheduledAt: scheduledIso,
        });

        showToast('✨ Scheduled post updated successfully!');
        modalOverlay.remove();

        // Keep activeCalendarDate and selectedMobileDate aligned with scheduled post
        const [targetYear, targetMonth] = date.split('-').map(Number);
        if (targetYear && targetMonth) {
          activeCalendarDate = new Date(targetYear, targetMonth - 1, 1);
          selectedMobileDate = date;
        }

        // Refresh planner
        const activeContainer = document.getElementById('active-view-container');
        if (activeContainer) {
          if (activeContainer.querySelector('#planner-main-content')) {
            await loadScheduledPosts(activeContainer);
          } else {
            await renderSchedulePlanner(activeContainer);
          }
        }
      } else {
        // Create new post(s) (simultaneous & multi-platform cross-posting supported!)
        const res = await api.schedulePost({
          videoId: initialVideoId || `vid_${Date.now()}`,
          videoTitle: title,
          fileUrl: initialFileUrl,
          thumbnailUrl: initialThumbnail,
          platforms: selectedPlatforms,
          staggerMinutes,
          captionText: caption,
          scheduledAt: scheduledIso,
        });

        const isMulti = selectedPlatforms.length > 1;
        const msg = isMulti
          ? `⚡ Cross-posted successfully to ${selectedPlatforms.length} platforms ${staggerMinutes === 0 ? 'simultaneously' : 'staggered'}!`
          : (res.message || '✨ Post scheduled successfully!');

        showToast(msg);
        modalOverlay.remove();

        // Keep activeCalendarDate and selectedMobileDate aligned with scheduled post
        const [targetYear, targetMonth] = date.split('-').map(Number);
        if (targetYear && targetMonth) {
          activeCalendarDate = new Date(targetYear, targetMonth - 1, 1);
          selectedMobileDate = date;
        }

        // Refresh planner or switch to schedule tab if requested
        const activeContainer = document.getElementById('active-view-container');
        if (activeContainer) {
          if (activeContainer.querySelector('#planner-main-content')) {
            await loadScheduledPosts(activeContainer);
          } else if (initialData && initialData.redirectToSchedule) {
            stateStore.setTab('schedule');
          } else {
            await renderSchedulePlanner(activeContainer);
          }
        }
      }
    } catch (err) {
      console.error('Scheduling error:', err);
      showToast(err.message || 'Failed to schedule post', true);
      btnSubmit.textContent = isEdit ? '💾 Save Changes' : '✨ Confirm & Schedule Post';
      btnSubmit.disabled = false;
    }
  });
}

function renderPlatformToggle(platformId, label, isSelected, isEdit) {
  return `
    <button type="button" class="platform-checkbox-chip" data-platform="${platformId}" style="display: flex; align-items: center; gap: 6px; background: ${isSelected ? 'rgba(99, 102, 241, 0.25)' : 'rgba(255,255,255,0.05)'}; border: 1px solid ${isSelected ? '#6366f1' : 'rgba(255,255,255,0.12)'}; color: ${isSelected ? '#a5b4fc' : '#94a3b8'}; font-size: 12px; font-weight: 700; padding: 7px 12px; border-radius: 20px; cursor: pointer; transition: all 0.15s ease;">
      <span class="plat-check" style="font-size: 11px;">${isSelected ? '✓' : '+'}</span>
      <span>${label}</span>
    </button>
  `;
}

// Dedicated Cross-Post Modal for existing scheduled / drafted posts
export async function openCrossPostModal(post, parentContainer) {
  const modalOverlay = document.createElement('div');
  modalOverlay.style.cssText = `
    position: fixed; inset: 0; background: rgba(0,0,0,0.8); backdrop-filter: blur(10px);
    z-index: 10005; display: flex; align-items: center; justify-content: center; padding: 16px;
  `;

  const allPlatforms = [
    { id: 'instagram', label: '📸 Instagram Reels' },
    { id: 'tiktok', label: '🎵 TikTok' },
    { id: 'youtube', label: '▶️ YouTube Shorts' },
    { id: 'threads', label: '🧵 Threads' },
    { id: 'x', label: '🪶 X' },
    { id: 'linkedin', label: '💼 LinkedIn' },
    { id: 'facebook', label: '📘 Facebook Reels' }
  ];

  // Exclude current platform by default, or find which ones are already synced
  let targetPlatforms = allPlatforms.filter(p => p.id !== post.platform).map(p => p.id);

  modalOverlay.innerHTML = `
    <div style="background: var(--card-bg, #1e293b); border: 1px solid var(--border-color, rgba(255,255,255,0.15)); border-radius: 20px; width: 100%; max-width: 560px; color: #fff; box-shadow: 0 25px 60px rgba(0,0,0,0.7); overflow: hidden; padding: 24px;">
      
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px;">
        <div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 20px;">🚀</span>
            <h3 style="margin: 0; font-size: 19px; font-weight: 800;">Multi-Platform Cross-Posting</h3>
          </div>
          <p style="margin: 4px 0 0 0; font-size: 12px; color: #94a3b8;">
            Broadcast "${post.video_title || 'Reel'}" to other social networks in seconds.
          </p>
        </div>
        <button id="close-crosspost-modal" style="background: transparent; border: none; color: #94a3b8; font-size: 20px; cursor: pointer;">✕</button>
      </div>

      <!-- Current Source Post Info -->
      <div style="background: rgba(15, 23, 42, 0.7); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 12px 16px; margin-bottom: 18px; font-size: 13px;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span style="color: #94a3b8;">Source Channel:</span>
          <strong style="color: #a5b4fc; text-transform: capitalize;">${getPlatformIcon(post.platform)} ${post.platform}</strong>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 6px;">
          <span style="color: #94a3b8;">Scheduled Slot:</span>
          <span style="color: #cbd5e1;">${new Date(post.scheduled_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</span>
        </div>
      </div>

      <!-- Target Platforms Selection -->
      <div style="margin-bottom: 18px;">
        <label style="display: block; font-size: 12px; font-weight: 700; color: #94a3b8; margin-bottom: 8px; text-transform: uppercase;">
          Select Destination Platforms
        </label>
        <div style="display: flex; flex-wrap: wrap; gap: 8px;" id="crosspost-chips-container">
          ${allPlatforms.filter(p => p.id !== post.platform).map(p => `
            <button type="button" class="crosspost-target-chip" data-plat="${p.id}" style="background: ${targetPlatforms.includes(p.id) ? 'rgba(168, 85, 247, 0.25)' : 'rgba(255,255,255,0.05)'}; border: 1px solid ${targetPlatforms.includes(p.id) ? '#a855f7' : 'rgba(255,255,255,0.12)'}; color: ${targetPlatforms.includes(p.id) ? '#d8b4fe' : '#94a3b8'}; font-size: 12px; font-weight: 700; padding: 8px 14px; border-radius: 20px; cursor: pointer; transition: all 0.15s ease;">
              <span class="cp-check">${targetPlatforms.includes(p.id) ? '✓' : '+'}</span>
              <span>${p.label}</span>
            </button>
          `).join('')}
        </div>
      </div>

      <!-- Stagger Selection -->
      <div style="margin-bottom: 22px; background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 12px; padding: 12px 14px; display: flex; align-items: center; justify-content: space-between;">
        <div>
          <div style="font-size: 13px; font-weight: 700; color: #f8fafc;">Stagger Interval</div>
          <div style="font-size: 11px; color: #94a3b8;">Space out posts between platforms</div>
        </div>
        <select id="crosspost-stagger-select" style="background: rgba(30, 41, 59, 0.9); border: 1px solid rgba(255,255,255,0.15); color: #e2e8f0; font-size: 12px; font-weight: 700; padding: 6px 10px; border-radius: 8px; cursor: pointer;">
          <option value="0">⚡ Blast (0 min delay)</option>
          <option value="15" selected>⏱️ +15 mins stagger</option>
          <option value="30">⏱️ +30 mins stagger</option>
          <option value="60">⏱️ +1 hour stagger</option>
        </select>
      </div>

      <!-- Submit Action -->
      <button id="btn-submit-crosspost-action" style="width: 100%; background: linear-gradient(135deg, #8b5cf6, #d946ef); color: #fff; border: none; font-weight: 800; font-size: 15px; padding: 14px; border-radius: 12px; cursor: pointer; box-shadow: 0 4px 20px rgba(168, 85, 247, 0.4);">
        🚀 Cross-Post Now (${targetPlatforms.length} Channels)
      </button>

    </div>
  `;

  document.body.appendChild(modalOverlay);

  modalOverlay.querySelector('#close-crosspost-modal').addEventListener('click', () => modalOverlay.remove());

  // Chip toggles
  modalOverlay.querySelectorAll('.crosspost-target-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const plat = chip.getAttribute('data-plat');
      if (targetPlatforms.includes(plat)) {
        targetPlatforms = targetPlatforms.filter(p => p !== plat);
      } else {
        targetPlatforms.push(plat);
      }

      // Update UI
      modalOverlay.querySelectorAll('.crosspost-target-chip').forEach(c => {
        const p = c.getAttribute('data-plat');
        const isSel = targetPlatforms.includes(p);
        c.style.background = isSel ? 'rgba(168, 85, 247, 0.25)' : 'rgba(255,255,255,0.05)';
        c.style.borderColor = isSel ? '#a855f7' : 'rgba(255,255,255,0.12)';
        c.style.color = isSel ? '#d8b4fe' : '#94a3b8';
        const sp = c.querySelector('.cp-check');
        if (sp) sp.textContent = isSel ? '✓' : '+';
      });

      const btnSubmit = modalOverlay.querySelector('#btn-submit-crosspost-action');
      if (btnSubmit) {
        btnSubmit.textContent = `🚀 Cross-Post Now (${targetPlatforms.length} Channels)`;
        btnSubmit.disabled = targetPlatforms.length === 0;
      }
    });
  });

  // Submit cross-post
  const btnSubmitCp = modalOverlay.querySelector('#btn-submit-crosspost-action');
  btnSubmitCp.addEventListener('click', async () => {
    if (targetPlatforms.length === 0) {
      showToast('Select at least one destination platform', true);
      return;
    }

    const staggerMinutes = parseInt(modalOverlay.querySelector('#crosspost-stagger-select').value, 10);
    btnSubmitCp.textContent = 'Cross-posting...';
    btnSubmitCp.disabled = true;

    try {
      const res = await api.crossPostScheduledPost(post.id, {
        targetPlatforms,
        staggerMinutes
      });

      showToast(res.message || '🚀 Cross-posted successfully across all selected platforms!');
      modalOverlay.remove();
      const target = getPlannerContainer(parentContainer);
      if (target) {
        if (target.querySelector('#planner-main-content')) {
          await loadScheduledPosts(target);
        } else {
          await renderSchedulePlanner(target);
        }
      }
    } catch (err) {
      console.error('Cross-post error:', err);
      showToast(err.message || 'Failed to cross-post', true);
      btnSubmitCp.textContent = `🚀 Cross-Post Now (${targetPlatforms.length} Channels)`;
      btnSubmitCp.disabled = false;
    }
  });
}

// Inline Video Picker Popover
function openInlineVideoPicker(videos, onSelect) {
  const popover = document.createElement('div');
  popover.style.cssText = `
    position: fixed; inset: 0; z-index: 10001; background: rgba(0,0,0,0.7); backdrop-filter: blur(4px);
    display: flex; align-items: center; justify-content: center; padding: 20px;
  `;

  popover.innerHTML = `
    <div style="background: #1e293b; border: 1px solid rgba(255,255,255,0.15); border-radius: 16px; width: 100%; max-width: 600px; max-height: 80vh; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 20px 50px rgba(0,0,0,0.6);">
      <div style="display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; border-bottom: 1px solid rgba(255,255,255,0.1);">
        <h4 style="margin: 0; font-size: 16px; font-weight: 800; color: #fff;">🎞️ Select Video from Library</h4>
        <button id="close-picker" style="background: transparent; border: none; color: #94a3b8; font-size: 18px; cursor: pointer;">✕</button>
      </div>

      <div style="padding: 16px; overflow-y: auto; display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 12px;">
        ${videos.map(v => `
          <div class="video-picker-item" data-id="${v.id}" style="background: rgba(15, 23, 42, 0.7); border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; padding: 12px; cursor: pointer; transition: all 0.15s ease;">
            <div style="display: flex; align-items: center; gap: 10px;">
              <div style="width: 44px; height: 44px; border-radius: 8px; background: rgba(99, 102, 241, 0.2); display: flex; align-items: center; justify-content: center; font-size: 20px; flex-shrink: 0; overflow: hidden;">
                ${v.thumbnail_url ? `<img src="${v.thumbnail_url}" style="width: 100%; height: 100%; object-fit: cover;" />` : '🎬'}
              </div>
              <div style="overflow: hidden;">
                <div style="font-size: 13px; font-weight: 700; color: #f8fafc; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${v.title}</div>
                <div style="font-size: 11px; color: #94a3b8; margin-top: 2px;">${v.duration ? `${Math.round(v.duration)}s` : 'Ready'} • ${v.aspect_ratio || '9:16'}</div>
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  document.body.appendChild(popover);

  popover.querySelector('#close-picker').addEventListener('click', () => popover.remove());

  popover.querySelectorAll('.video-picker-item').forEach(item => {
    item.addEventListener('click', () => {
      const vidId = item.getAttribute('data-id');
      const found = videos.find(v => v.id === vidId);
      if (found) {
        onSelect(found);
        popover.remove();
      }
    });
  });
}

// Resilient AI Copy Generator Grounded in Video Title & Platform Formats
async function generateAiCopyHelper({ videoId, videoTitle, platform, tone }) {
  const effectiveTitle = (videoTitle || 'High-Impact Creator Reel').trim();
  const effectiveTone = tone || 'Viral & Punchy';
  const effectivePlatform = platform || 'instagram';

  // 1. Primary: Server-side Gemini AI generation grounded in exact title
  try {
    const res = await api.generateCaptionFromTitle({
      title: effectiveTitle,
      platform: effectivePlatform,
      tone: effectiveTone,
    });
    if (res && (res.caption || res.caption_text)) {
      return {
        caption: res.caption || res.caption_text,
        hashtags: res.hashtags || [],
        hooks: res.hooks || [],
        callToAction: res.callToAction || '',
        suggestedTitle: res.suggestedTitle || '',
        ai_generated: Boolean(res.ai_generated),
      };
    }
  } catch (err) {
    console.warn('API generateCaptionFromTitle fallback engaged:', err);
  }

  // 2. Secondary: Try standard video-grounded caption generation
  try {
    const res2 = await api.generateCaption(
      videoId || `temp_${Date.now()}`,
      '',
      effectiveTone,
      effectivePlatform,
      true,
      effectiveTitle
    );
    if (res2 && (res2.caption || res2.caption_text)) {
      return {
        caption: res2.caption || res2.caption_text,
        hashtags: res2.hashtags || [],
        hooks: res2.hooks || [],
        callToAction: res2.callToAction || '',
      };
    }
  } catch (err2) {
    console.warn('API generateCaption fallback engaged:', err2);
  }

  // 3. High-retention algorithmic copy generator fallback (Offline Resilience)
  const lower = effectiveTitle.toLowerCase();
  const words = lower.replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 3);
  const stopWords = new Set(['this', 'that', 'with', 'from', 'your', 'have', 'what', 'here', 'just', 'more', 'then', 'they', 'will', 'about', 'video', 'reel', 'post']);
  const dynamicTags = words.filter(w => !stopWords.has(w)).slice(0, 4);
  if (dynamicTags.length === 0) dynamicTags.push('creatoreconomy', 'videotips');

  const fallbackHooks = [
    `Stop scrolling if you want to master ${effectiveTitle} 🚨`,
    `The #1 mistake creators make with ${effectiveTitle} (and how to fix it) 👀`,
    `If you only implement ONE strategy from ${effectiveTitle} this week, do this 👇`,
    `Why nobody is talking about the real secret behind ${effectiveTitle} 💡`
  ];

  const hooks = {
    instagram: `🔥 "${effectiveTitle}"\n\nHere is the exact breakdown you need to implement today:\n\n1️⃣ Phase 1: Identify high-retention concepts before hitting record.\n2️⃣ Phase 2: Use kinetic visual pacing and clear audio cues.\n3️⃣ Phase 3: Syndicate seamlessly across every short-form platform.\n\n👇 Save this reel for your next production session! Which step are you focusing on first?`,
    tiktok: `👀 The secret nobody tells you about "${effectiveTitle}"...\n\nSave this for your next video workflow! 🚀`,
    youtube: `🔥 ${effectiveTitle}\n\nKey takeaways broken down in this short:\n• Instant hook formulation\n• High-retention visual pacing\n• Multi-channel syndication\n\n💬 What is your biggest challenge with video creation? Drop your thoughts in the comments!`,
    linkedin: `💡 Critical takeaway from "${effectiveTitle}":\n\nContent leverage in 2026 isn't about working more hours—it's about smart syndication.\n\nHere is how we approach production efficiency:\n• 1. Batch raw ideas when creative energy is highest\n• 2. Automate kinetic captions and audio balances\n• 3. Repurpose across platforms simultaneously\n\nHow is your team tackling short-form video this quarter?`,
    x: `Core lesson from "${effectiveTitle}":\n\nAutomate friction, amplify signal. ⚡`,
    threads: `Honest creator check-in on "${effectiveTitle}" ☕\n\nWhat is your biggest takeaway here? Let's discuss 👇`,
    facebook: `🔥 Breakdown: "${effectiveTitle}"\n\nSave this post for your next shoot and tag a creator friend! 🎬`
  };

  const tags = {
    instagram: ['contentcreator', 'reelsgrowth', 'videotips', 'creatorhacks', 'kontentos', ...dynamicTags],
    tiktok: ['learnontiktok', 'creatoreconomy', 'filmtok', 'videotips', 'fyp', ...dynamicTags],
    youtube: ['Shorts', 'YouTubeShorts', 'CreatorTips', 'VideoMarketing', ...dynamicTags],
    linkedin: ['ContentStrategy', 'VideoMarketing', 'Productivity', 'CreatorEconomy', ...dynamicTags],
    x: ['CreatorEconomy', 'VideoMarketing', 'BuildInPublic', ...dynamicTags],
    threads: ['threads', 'creator', 'videotips', ...dynamicTags],
    facebook: ['videocreation', 'digitalcreator', 'marketingtips', ...dynamicTags]
  };

  return {
    caption: hooks[effectivePlatform] || hooks.instagram,
    hashtags: tags[effectivePlatform] || tags.instagram,
    hooks: fallbackHooks,
    callToAction: "👇 Comment 'REEL' below and I'll send you the complete step-by-step blueprint!",
    suggestedTitle: `How to 10x Your Results with ${effectiveTitle}`,
  };
}

function showToast(msg, isError = false) {
  const toast = document.createElement('div');
  toast.style.cssText = `
    position: fixed; bottom: 24px; right: 24px; z-index: 20000;
    background: ${isError ? '#ef4444' : '#10b981'}; color: #ffffff;
    font-size: 14px; font-weight: 700; padding: 12px 20px; border-radius: 12px;
    box-shadow: 0 10px 25px rgba(0,0,0,0.3); animation: fadeIn 0.2s ease;
  `;
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

// Global Export-to-Schedule Event Bridge for Smart Editor & Raw Studio
if (typeof window !== 'undefined') {
  window.KontentOS = window.KontentOS || {};
  window.KontentOS.openScheduleModal = openScheduleModal;

  window.addEventListener('kontentos:schedule-reel', (e) => {
    if (e.detail) {
      openScheduleModal(e.detail);
    }
  });
}

