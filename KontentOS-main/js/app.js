// KontentOS — Main Application Controller with Optimized Tab Routing
import { stateStore } from './state.js';
import { renderTopBar } from './components/topbar.js';
import { renderSidebar } from './components/sidebar.js';
import { renderOnboarding } from './components/onboarding.js';
import { renderCreatorBrain } from './components/creator-brain.js';
import { renderIdeaStudio } from './components/idea-studio.js';
import { renderRawStudio } from './components/raw-studio.js';
import { renderSettingsPage } from './components/settings-page.js';
import { renderSchedulePlanner } from './components/schedule-planner.js';
import { renderSmartEditor } from './components/smart-editor.js';

function initApp() {
  const topBarContainer = document.getElementById('topbar-container');
  const sidebarContainer = document.getElementById('desktop-sidebar');
  const mobileNavContainer = document.getElementById('mobile-bottom-nav');
  const viewContainer = document.getElementById('active-view-container');

  let activeTab = null;
  let activeTheme = null;

  function render(force = false) {
    const state = stateStore.get();

    // Apply active theme attribute
    if (activeTheme !== state.theme) {
      activeTheme = state.theme;
      document.documentElement.setAttribute('data-theme', state.theme);
    }

    // Always keep navigation shell in sync
    renderTopBar(topBarContainer);
    renderSidebar(sidebarContainer, mobileNavContainer);

    // Only recreate main view DOM if the active tab changed or force render is requested
    if (activeTab !== state.currentTab || force) {
      activeTab = state.currentTab;
      viewContainer.innerHTML = '';
      
      switch (state.currentTab) {
        case 'onboarding':
          renderOnboarding(viewContainer);
          break;
        case 'brain':
          renderCreatorBrain(viewContainer);
          break;
        case 'dashboard':
          renderIdeaStudio(viewContainer);
          break;
        case 'studio':
          renderRawStudio(viewContainer);
          break;
        case 'smart-editor':
          renderSmartEditor(viewContainer);
          break;
        case 'schedule':
          renderSchedulePlanner(viewContainer);
          break;
        case 'settings':
          renderSettingsPage(viewContainer);
          break;
        default:
          renderOnboarding(viewContainer);
          break;
      }
    }
  }

  // Subscribe to state changes
  stateStore.subscribe(() => {
    render();
  });

  // Initial render
  render(true);
}

document.addEventListener('DOMContentLoaded', initApp);

