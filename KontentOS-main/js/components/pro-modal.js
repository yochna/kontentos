// KontentOS — Creator Pro Upgrade & Payment Checkout Modal
import { stateStore, GEO_LOCALES } from '../state.js';

export function openProModal({ onCancel, onSuccess } = {}) {
  const state = stateStore.get();
  const profile = state.creatorProfile;
  const currentGeo = state.geo || 'IN';
  const locale = GEO_LOCALES[currentGeo] || GEO_LOCALES.IN;

  // Localized pricing configuration
  const PRICING_MAP = {
    IN: { monthly: '₹999', annual: '₹799', annualTotal: '₹9,588/yr', symbol: '₹' },
    US: { monthly: '$19', annual: '$15', annualTotal: '$180/yr', symbol: '$' },
    UK: { monthly: '£15', annual: '£12', annualTotal: '£144/yr', symbol: '£' },
    AE: { monthly: 'AED 69', annual: 'AED 55', annualTotal: 'AED 660/yr', symbol: 'AED ' }
  };

  const pricing = PRICING_MAP[currentGeo] || PRICING_MAP.IN;

  let billingCycle = 'monthly'; // 'monthly' | 'annual'
  let paymentMethod = currentGeo === 'IN' ? 'upi' : 'card'; // 'upi' | 'card' | 'gpay'

  // Remove existing modal if any
  const existing = document.getElementById('global-pro-modal-container');
  if (existing) existing.remove();

  const modalOverlay = document.createElement('div');
  modalOverlay.id = 'global-pro-modal-container';
  modalOverlay.className = 'modal-overlay open';
  modalOverlay.style.cssText = `
    position: fixed;
    inset: 0;
    z-index: 9999;
    background: rgba(0, 0, 0, 0.82);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
    animation: fadeIn 0.2s ease-out;
  `;

  function renderModalInner() {
    const activePrice = billingCycle === 'annual' ? pricing.annual : pricing.monthly;
    const activePeriod = billingCycle === 'annual' ? '/ month (billed annually)' : '/ month';

    modalOverlay.innerHTML = `
      <div class="modal-box card-glow" style="max-width: 560px; width: 100%; background: var(--bg-surface-card); border: 1px solid var(--border-glass); border-radius: 20px; padding: 2rem; max-height: 90vh; overflow-y: auto; position: relative;">
        
        <!-- Close Button -->
        <button id="btn-modal-close-x" style="position: absolute; top: 16px; right: 16px; background: var(--bg-surface-low); border: 1px solid var(--border-subtle); width: 32px; height: 32px; border-radius: 50%; color: var(--text-dim); font-size: 1.1rem; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s;">
          ✕
        </button>

        <!-- Top Header & Pro Badge -->
        <div style="text-align: center; margin-bottom: 1.5rem;">
          <div style="width: 56px; height: 56px; border-radius: 50%; background: linear-gradient(135deg, var(--accent-primary), var(--accent-secondary)); margin: 0 auto 0.75rem auto; display: flex; align-items: center; justify-content: center; font-size: 1.8rem; box-shadow: 0 8px 24px rgba(0, 240, 255, 0.3);">
            👑
          </div>
          <div style="display: flex; align-items: center; justify-content: center; gap: 0.5rem; margin-bottom: 0.35rem;">
            <h2 style="font-size: 1.6rem; font-weight: 800; color: var(--text-main);">Upgrade to KontentOS Pro</h2>
            <span class="badge badge-neon">NO WATERMARK</span>
          </div>
          <p style="color: var(--text-muted); font-size: 0.85rem; max-width: 440px; margin: 0 auto;">
            Remove the "Made with KontentOS" watermark, unlock uncompressed 4K 60FPS exports, and auto-publish across 6 channels.
          </p>
        </div>

        <!-- Plan Billing Selector (Monthly vs Annual with 20% off) -->
        <div style="display: flex; background: var(--bg-surface-low); padding: 4px; border-radius: 12px; border: 1px solid var(--border-subtle); margin-bottom: 1.25rem; gap: 4px;">
          <button id="tab-billing-monthly" class="btn ${billingCycle === 'monthly' ? 'btn-primary' : 'btn-secondary'}" style="flex: 1; padding: 0.45rem; font-size: 0.82rem; border-radius: 8px;">
            Monthly Plan
          </button>
          <button id="tab-billing-annual" class="btn ${billingCycle === 'annual' ? 'btn-primary' : 'btn-secondary'}" style="flex: 1; padding: 0.45rem; font-size: 0.82rem; border-radius: 8px; display: flex; align-items: center; justify-content: center; gap: 6px;">
            <span>Annual Plan</span>
            <span class="badge badge-purple" style="font-size: 0.6rem; padding: 2px 6px;">SAVE 20%</span>
          </button>
        </div>

        <!-- Price Display Card -->
        <div style="background: var(--bg-surface-low); border: 1px solid var(--border-glass); border-radius: 14px; padding: 1rem 1.25rem; margin-bottom: 1.25rem; display: flex; justify-content: space-between; align-items: center;">
          <div>
            <div style="font-weight: 700; font-size: 0.95rem; color: var(--text-main);">Creator Pro License</div>
            <div style="font-size: 0.72rem; color: var(--text-dim);">${billingCycle === 'annual' ? pricing.annualTotal : 'Billed monthly, cancel anytime'}</div>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 1.6rem; font-weight: 900; color: var(--accent-primary); line-height: 1;">${activePrice}</div>
            <div style="font-size: 0.68rem; color: var(--text-muted);">${activePeriod}</div>
          </div>
        </div>

        <!-- Pro Features Checklist -->
        <div style="background: rgba(0, 240, 255, 0.04); border: 1px solid var(--border-subtle); border-radius: 12px; padding: 0.85rem 1rem; margin-bottom: 1.25rem;">
          <div style="font-size: 0.75rem; font-weight: 700; color: var(--accent-primary); text-transform: uppercase; margin-bottom: 0.4rem; letter-spacing: 0.05em;">
            Everything Included in Pro:
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.4rem; font-size: 0.78rem; color: var(--text-main);">
            <div style="display: flex; align-items: center; gap: 6px;">
              <span style="color: var(--accent-secondary);">✓</span> Zero Watermarks
            </div>
            <div style="display: flex; align-items: center; gap: 6px;">
              <span style="color: var(--accent-secondary);">✓</span> 4K 60FPS ProRes Exports
            </div>
            <div style="display: flex; align-items: center; gap: 6px;">
              <span style="color: var(--accent-secondary);">✓</span> Studio Voice Isolator
            </div>
            <div style="display: flex; align-items: center; gap: 6px;">
              <span style="color: var(--accent-secondary);">✓</span> 6-Platform Omni-Publish
            </div>
            <div style="display: flex; align-items: center; gap: 6px;">
              <span style="color: var(--accent-secondary);">✓</span> "Make 10 More" Viral AI
            </div>
            <div style="display: flex; align-items: center; gap: 6px;">
              <span style="color: var(--accent-secondary);">✓</span> Unlimited Idea Radar
            </div>
          </div>
        </div>

        <!-- Payment Method Selector -->
        <div style="margin-bottom: 1.25rem;">
          <div style="font-size: 0.8rem; font-weight: 700; color: var(--text-dim); margin-bottom: 0.45rem;">
            Select Payment Method:
          </div>
          <div style="display: flex; gap: 0.45rem;">
            ${currentGeo === 'IN' ? `
              <button id="pay-method-upi" class="btn ${paymentMethod === 'upi' ? 'btn-primary' : 'btn-secondary'}" style="flex: 1; padding: 0.45rem; font-size: 0.78rem;">
                📱 UPI / GPay / PhonePe
              </button>
            ` : ''}
            <button id="pay-method-card" class="btn ${paymentMethod === 'card' ? 'btn-primary' : 'btn-secondary'}" style="flex: 1; padding: 0.45rem; font-size: 0.78rem;">
              💳 Credit / Debit Card
            </button>
            <button id="pay-method-gpay" class="btn ${paymentMethod === 'gpay' ? 'btn-primary' : 'btn-secondary'}" style="flex: 1; padding: 0.45rem; font-size: 0.78rem;">
              ⚡ Instant 1-Click Pay
            </button>
          </div>
        </div>

        <!-- Payment Input Fields Simulator -->
        <div id="payment-fields-box" style="background: var(--bg-surface-low); border: 1px solid var(--border-subtle); border-radius: 12px; padding: 1rem; margin-bottom: 1.5rem;">
          ${renderPaymentFields(paymentMethod, profile)}
        </div>

        <!-- Action Buttons -->
        <div style="display: flex; gap: 0.75rem;">
          <button id="btn-modal-cancel" class="btn btn-secondary" style="flex: 1; padding: 0.75rem; font-size: 0.88rem;">
            Keep Free (With Watermark)
          </button>
          <button id="btn-modal-pay-now" class="btn btn-primary" style="flex: 1.4; padding: 0.75rem; font-size: 0.95rem; display: flex; align-items: center; justify-content: center; gap: 6px;">
            <span>⚡ Pay ${activePrice} & Remove Watermark</span>
          </button>
        </div>

        <div style="font-size: 0.68rem; color: var(--text-dim); text-align: center; margin-top: 0.75rem;">
          🔒 256-bit End-to-End Encrypted Checkout • Instant Activation
        </div>

      </div>
    `;

    attachModalEvents();
  }

  function renderPaymentFields(method, profile) {
    if (method === 'upi') {
      return `
        <div>
          <label style="font-size: 0.75rem; font-weight: 700; color: var(--text-dim); display: block; margin-bottom: 4px;">
            Enter UPI ID (e.g. mobile@okhdfcbank or yourname@paytm)
          </label>
          <div style="display: flex; gap: 0.5rem;">
            <input type="text" id="input-upi-id" class="form-input" value="${profile.name.toLowerCase().replace(/\s+/g, '')}@okaxis" style="font-size: 0.85rem;" />
            <span class="badge badge-neon" style="display: flex; align-items: center; padding: 0 10px; font-size: 0.72rem;">VERIFIED</span>
          </div>
        </div>
      `;
    } else if (method === 'gpay') {
      return `
        <div style="text-align: center; padding: 0.5rem;">
          <div style="font-size: 1.25rem; font-weight: 800; margin-bottom: 2px;">⚡ Google Pay / Apple Pay</div>
          <div style="font-size: 0.75rem; color: var(--text-dim);">Touch ID / Face ID authorized for instant payment</div>
        </div>
      `;
    } else {
      return `
        <div style="display: flex; flex-direction: column; gap: 0.6rem;">
          <div>
            <label style="font-size: 0.72rem; font-weight: 700; color: var(--text-dim); display: block; margin-bottom: 2px;">Card Number</label>
            <input type="text" class="form-input" value="•••• •••• •••• 4242" style="font-size: 0.82rem; font-family: monospace;" />
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem;">
            <div>
              <label style="font-size: 0.72rem; font-weight: 700; color: var(--text-dim); display: block; margin-bottom: 2px;">Expiry Date</label>
              <input type="text" class="form-input" value="12/28" style="font-size: 0.82rem; text-align: center;" />
            </div>
            <div>
              <label style="font-size: 0.72rem; font-weight: 700; color: var(--text-dim); display: block; margin-bottom: 2px;">CVC / CVV</label>
              <input type="password" class="form-input" value="888" style="font-size: 0.82rem; text-align: center;" />
            </div>
          </div>
        </div>
      `;
    }
  }

  function attachModalEvents() {
    // Close / Cancel Handlers
    const closeBtn = modalOverlay.querySelector('#btn-modal-close-x');
    const cancelBtn = modalOverlay.querySelector('#btn-modal-cancel');

    function handleCancel() {
      modalOverlay.remove();
      if (typeof onCancel === 'function') onCancel();
    }

    if (closeBtn) closeBtn.addEventListener('click', handleCancel);
    if (cancelBtn) cancelBtn.addEventListener('click', handleCancel);

    // Billing Cycle Switchers
    const tabMonthly = modalOverlay.querySelector('#tab-billing-monthly');
    const tabAnnual = modalOverlay.querySelector('#tab-billing-annual');

    if (tabMonthly) {
      tabMonthly.addEventListener('click', () => {
        billingCycle = 'monthly';
        renderModalInner();
      });
    }

    if (tabAnnual) {
      tabAnnual.addEventListener('click', () => {
        billingCycle = 'annual';
        renderModalInner();
      });
    }

    // Payment Method Switchers
    const payUpi = modalOverlay.querySelector('#pay-method-upi');
    const payCard = modalOverlay.querySelector('#pay-method-card');
    const payGpay = modalOverlay.querySelector('#pay-method-gpay');

    if (payUpi) {
      payUpi.addEventListener('click', () => {
        paymentMethod = 'upi';
        renderModalInner();
      });
    }
    if (payCard) {
      payCard.addEventListener('click', () => {
        paymentMethod = 'card';
        renderModalInner();
      });
    }
    if (payGpay) {
      payGpay.addEventListener('click', () => {
        paymentMethod = 'gpay';
        renderModalInner();
      });
    }

    // Pay Now CTA
    const payBtn = modalOverlay.querySelector('#btn-modal-pay-now');
    if (payBtn) {
      payBtn.addEventListener('click', () => {
        payBtn.disabled = true;
        payBtn.innerHTML = `<span>⏳ Authorizing Payment...</span>`;

        setTimeout(() => {
          // Update State to Pro and remove Watermark
          stateStore.updateProfile({
            isPro: true,
            includeWatermark: false
          });

          modalOverlay.remove();
          if (typeof onSuccess === 'function') onSuccess();

          alert('🎉 Payment Successful! Welcome to KontentOS Creator Pro. Watermarks have been removed and 4K exports are unlocked!');
        }, 700);
      });
    }
  }

  document.body.appendChild(modalOverlay);
  renderModalInner();
}
