/**
 * Consent + Analytics
 * - Show a first-visit consent modal requiring acceptance of Terms/Privacy and essential cookies.
 * - Google Analytics always loads using Consent Mode:
 *   - If user declines analytics cookies: cookieless mode (anonymous aggregated data only)
 *   - If user accepts analytics cookies: full tracking with cookies
 */

const BTK_CONSENT_VERSION = '2026-02-08';
const BTK_CONSENT_STORAGE_KEY = 'btkConsent';

function btkGetCookie(name)
{
  const nameEQ = name + '=';
  const cookies = document.cookie.split(';');
  for (let i = 0; i < cookies.length; i++)
  {
    let cookie = cookies[i];
    while (cookie.charAt(0) === ' ') cookie = cookie.substring(1, cookie.length);
    if (cookie.indexOf(nameEQ) === 0) return decodeURIComponent(cookie.substring(nameEQ.length, cookie.length));
  }
  return null;
}

function btkSetCookie(name, value, days = 365)
{
  const expires = new Date();
  expires.setTime(expires.getTime() + days * 24 * 60 * 60 * 1000);
  const secure = window.location.protocol === 'https:' ? ';Secure' : '';
  document.cookie = `${name}=${encodeURIComponent(value)};expires=${expires.toUTCString()};path=/;SameSite=Lax${secure}`;
}

function btkGetStoredConsent()
{
  try
  {
    const raw = window.localStorage.getItem(BTK_CONSENT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== BTK_CONSENT_VERSION) return null;
    return parsed;
  }
  catch
  {
    return null;
  }
}

function btkStoreConsent(consent)
{
  const stored = {
    version: BTK_CONSENT_VERSION,
    acceptedAt: new Date().toISOString(),
    termsAccepted: !!consent.termsAccepted,
    privacyAccepted: !!consent.privacyAccepted,
    essentialCookiesAccepted: !!consent.essentialCookiesAccepted,
    analyticsCookiesAccepted: !!consent.analyticsCookiesAccepted
  };
  try
  {
    window.localStorage.setItem(BTK_CONSENT_STORAGE_KEY, JSON.stringify(stored));
  }
  catch
  {
    // ignore
  }

  // Optional cookie marker (user requested this). Keep minimal.
  btkSetCookie('btk_consent', '1', 7);
  btkSetCookie('btk_consent_version', BTK_CONSENT_VERSION, 7);
  btkSetCookie('btk_consent_analytics', stored.analyticsCookiesAccepted ? '1' : '0', 7);
  return stored;
}

function btkClearConsent()
{
  try
  {
    window.localStorage.removeItem(BTK_CONSENT_STORAGE_KEY);
  }
  catch
  {
    // ignore
  }

  // Expire consent cookies
  const expire = (name) =>
  {
    document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;SameSite=Lax`;
  };
  expire('btk_consent');
  expire('btk_consent_version');
  expire('btk_consent_analytics');
}

function btkHasAnalyticsConsent()
{
  const stored = btkGetStoredConsent();
  if (stored) return !!stored.analyticsCookiesAccepted;
  // Fallback to cookie in case localStorage is blocked
  return btkGetCookie('btk_consent_version') === BTK_CONSENT_VERSION && btkGetCookie('btk_consent_analytics') === '1';
}

function btkIsProductionDomain()
{
  const hostname = window.location.hostname;
  return hostname === 'ballisticstoolkit.com' || hostname === 'www.ballisticstoolkit.com';
}

function btkLoadGoogleAnalytics()
{
  if (!btkIsProductionDomain()) return;
  if (window.__btkGaLoaded) return;
  window.__btkGaLoaded = true;

  const GA_MEASUREMENT_ID = 'G-JWTD9KG6D6';
  const hasConsent = btkHasAnalyticsConsent();

  // Initialize dataLayer and gtag function before setting consent
  window.dataLayer = window.dataLayer || [];
  function gtag()
  {
    dataLayer.push(arguments);
  }
  window.gtag = gtag;

  // Set default consent state BEFORE loading the gtag script.
  // When analytics_storage is 'denied', GA operates in cookieless mode:
  // - No cookies are set on the user's device
  // - Pings are still sent to Google for aggregated/modeled reporting
  // - Individual users cannot be tracked across sessions
  gtag('consent', 'default', {
    analytics_storage: hasConsent ? 'granted' : 'denied',
    ad_storage: 'denied'
  });

  // Load the gtag.js script
  const gtagScript = document.createElement('script');
  gtagScript.async = true;
  gtagScript.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
  document.head.appendChild(gtagScript);

  gtag('js', new Date());
  gtag('config', GA_MEASUREMENT_ID, {
    anonymize_ip: true
  });
}

// Update analytics consent at runtime (e.g., after user accepts in modal)
function btkUpdateAnalyticsConsent(granted)
{
  if (window.gtag)
  {
    window.gtag('consent', 'update', {
      analytics_storage: granted ? 'granted' : 'denied'
    });
  }
}

// Try to load GA early if already consented (non-blocking)
btkLoadGoogleAnalytics();

/**
 * Common JavaScript functionality for BallisticsToolkit
 */

// Navigation helper
function setActiveNavLink()
{
  const body = document.body;
  if (!body) return;

  const currentPageName = body.dataset.page || 'index';
  const navLinks = document.querySelectorAll('.nav-links a');

  // Map page names to their corresponding nav links
  const pageNavMap = {
    'index': 'index.html',
    'ballistic-calc': 'ballistic-calc/ballistic-calc.html',
    'load-comp': 'load-comp/load-comp.html',
    'perf-matrix': 'perf-matrix/perf-matrix.html',
    'target-sim': 'target-sim/target-sim.html',
    'hit-prob': 'hit-prob/hit-prob.html',
    'wind-sim': 'wind-sim/wind-sim.html',
    'steel-sim': 'steel-sim/steel-sim.html',
    'fclass-sim': 'fclass-sim/fclass-sim.html',
    'target-gen': 'target-gen/target-gen.html'
  };

  navLinks.forEach(link =>
  {
    const href = link.getAttribute('href');
    // Remove path prefix for comparison (../ or empty)
    const cleanHref = href.replace(/^\.\.\//, '');
    const expectedHref = pageNavMap[currentPageName];

    if (expectedHref && cleanHref === expectedHref)
    {
      link.classList.add('active');
    }
    else
    {
      link.classList.remove('active');
    }
  });
}

// Generate common navigation
function generateNavigation(currentPageName)
{
  // Determine path prefix based on current page
  const isRootPage = currentPageName === 'index' || currentPageName === 'about';
  const pathPrefix = isRootPage ? '' : '../';

  const act = (page) => currentPageName === page ? 'class="active"' : '';

  const link = (href, page, short, full) =>
    `<a href="${pathPrefix}${href}" ${act(page)}><span class="nav-short">${short}</span><span class="nav-full">${full}</span></a>`;

  const navHTML = `
        <div class="nav-content">
            <a href="${pathPrefix}index.html" class="nav-logo">
                <img src="${pathPrefix}ballistics-toolkit-icon.png" alt="BallisticsToolkit" class="nav-logo-img">
                <span class="nav-logo-text">Ballistics Toolkit</span>
            </a>
            <button class="nav-hamburger" aria-label="Menu">&#9776;</button>
            <div class="nav-links">
                ${link('ballistic-calc/ballistic-calc.html', 'ballistic-calc', 'Ballistic Calc', 'Ballistic Calculator')}
                ${link('load-comp/load-comp.html', 'load-comp', 'Load Comp', 'Load Comparison')}
                ${link('perf-matrix/perf-matrix.html', 'perf-matrix', 'Perf Matrix', 'Performance Matrix')}
                ${link('target-sim/target-sim.html', 'target-sim', 'Target Sim', 'Target Simulator')}
                ${link('hit-prob/hit-prob.html', 'hit-prob', 'Hit Sim', 'Hit Simulator')}
                ${link('wind-sim/wind-sim.html', 'wind-sim', 'Wind Sim', 'Wind Simulator')}
                ${link('steel-sim/steel-sim.html', 'steel-sim', 'Steel Sim', 'Steel Simulator')}
                ${link('fclass-sim/fclass-sim.html', 'fclass-sim', 'F-Class Sim', 'F-Class Simulator')}
                ${link('target-gen/target-gen.html', 'target-gen', 'Target Gen', 'Target Generator')}
            </div>
        </div>
    `;

  return navHTML;
}

// Common page template structure
function setupCommonPageStructure()
{
  // Ensure all pages have the basic structure
  const body = document.body;
  if (!body) return;

  // Check if nav-header exists, if not create it
  let navHeader = document.querySelector('.nav-header');
  if (!navHeader)
  {
    navHeader = document.createElement('div');
    navHeader.className = 'nav-header';
    body.insertBefore(navHeader, body.firstChild);
  }

  // Get page name from data attribute on body tag
  const currentPageName = body.dataset.page || 'index';

  // Generate navigation content
  navHeader.innerHTML = generateNavigation(currentPageName);

  // Add site footer with legal links
  let footer = document.querySelector('.site-footer');
  if (!footer)
  {
    const pathPrefix = (currentPageName === 'index' || currentPageName === 'about') ? '' : '../';
    footer = document.createElement('div');
    footer.className = 'site-footer';
    footer.style.cssText = 'margin-top:40px;padding:20px 0;border-top:1px solid #e5e5e5;color:#666;font-size:14px;';
    footer.innerHTML = `
      <div class="app-container">
        <div style="background:#fff3cd;border-left:4px solid #ffc107;padding:12px 16px;margin-bottom:20px;border-radius:4px;">
          <p style="margin:0;color:#856404;font-weight:500;font-size:13px;">
            <strong>⚠️ Safety Notice:</strong> Ballistics Toolkit is free, non‑commercial software provided &ldquo;as is&rdquo; and makes no guarantee of accuracy or correctness. It may contain errors and/or inaccuracies. Do not use this tool for any purpose where incorrect ballistic data could create a hazardous or unsafe condition. Real-world use is entirely at your own risk.
            <a href="${pathPrefix}terms.html" style="color:#856404;text-decoration:underline;">See full disclaimers</a>.
          </p>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:12px;align-items:center;">
          <span>© ${new Date().getFullYear()} Ballistics Toolkit</span>
          <span style="flex:1 1 auto"></span>
          <a href="https://github.com/chasep255/BallisticsToolkit" target="_blank" rel="noopener">GitHub</a>
          <span>·</span>
          <a href="${pathPrefix}about.html">About</a>
          <span>·</span>
          <a href="${pathPrefix}contact.html">Contact</a>
          <span>·</span>
          <a href="${pathPrefix}terms.html">Terms</a>
          <span>·</span>
          <a href="${pathPrefix}privacy.html">Privacy</a>
        </div>
      </div>`;
    document.body.appendChild(footer);
  }
}

// Initialize common functionality when DOM is loaded
document.addEventListener('DOMContentLoaded', function()
{
  // Setup common page structure and navigation
  setupCommonPageStructure();
  setActiveNavLink();

  // Hamburger menu toggle
  const hamburger = document.querySelector('.nav-hamburger');
  const navLinks = document.querySelector('.nav-links');
  if (hamburger && navLinks)
  {
    hamburger.addEventListener('click', () =>
    {
      navLinks.classList.toggle('open');
    });
  }

  // Consent modal (first visit or when consent version changes)
  btkEnsureConsentModal();

  // Optional: allow consent reset from the Privacy page control
  const resetBtn = document.getElementById('btkResetConsentBtn');
  if (resetBtn)
  {
    resetBtn.addEventListener('click', (e) =>
    {
      e.preventDefault();
      btkClearConsent();
      window.location.reload();
    });
  }
});

// Utility functions
const Utils = {
  // Format numbers with specified decimal places
  formatNumber: function(num, decimals = 2)
  {
    return parseFloat(num).toFixed(decimals);
  },

  // Show loading overlay
  showLoading: function(message = 'Loading...')
  {
    const loading = document.getElementById('loading');
    if (loading)
    {
      loading.innerHTML = `<div>${message}</div>`;
      loading.classList.add('show');
    }
  },

  // Hide loading overlay
  hideLoading: function()
  {
    const loading = document.getElementById('loading');
    if (loading)
    {
      loading.classList.remove('show');
    }
  },

  // Show error message
  showError: function(message)
  {
    alert('Error: ' + message);
  },

  // Validate numeric input
  validateNumber: function(value, min = 0, max = Infinity)
  {
    const num = parseFloat(value);
    return !isNaN(num) && num >= min && num <= max;
  },

  // Get form data as object
  getFormData: function(formId)
  {
    const form = document.getElementById(formId);
    if (!form) return {};

    const data = {};
    const inputs = form.querySelectorAll('input, select, textarea');

    inputs.forEach(input =>
    {
      if (input.type === 'checkbox')
      {
        data[input.id] = input.checked;
      }
      else if (input.type === 'number')
      {
        data[input.id] = parseFloat(input.value) || 0;
      }
      else
      {
        data[input.id] = input.value;
      }
    });

    return data;
  },

  // Set form data from object
  setFormData: function(formId, data)
  {
    const form = document.getElementById(formId);
    if (!form) return;

    Object.keys(data).forEach(key =>
    {
      const input = form.querySelector(`#${key}`);
      if (input)
      {
        if (input.type === 'checkbox')
        {
          input.checked = data[key];
        }
        else
        {
          input.value = data[key];
        }
      }
    });
  },

  // Setup help modal functionality
  setupHelpModal: function(helpBtnId, helpModalId)
  {
    const helpBtn = document.getElementById(helpBtnId);
    const helpModal = document.getElementById(helpModalId);
    const closeBtn = helpModal ? helpModal.querySelector('.help-close') : null;

    if (!helpBtn || !helpModal || !closeBtn)
    {
      console.warn('Help modal elements not found:',
      {
        helpBtnId,
        helpModalId
      });
      return;
    }

    // Open modal
    helpBtn.addEventListener('click', (e) =>
    {
      e.preventDefault();
      helpModal.style.display = 'flex';
    });

    // Close modal
    closeBtn.addEventListener('click', () =>
    {
      helpModal.style.display = 'none';
    });

    // Close modal when clicking outside
    helpModal.addEventListener('click', (e) =>
    {
      if (e.target === helpModal)
      {
        helpModal.style.display = 'none';
      }
    });

    // Close modal with Escape key
    document.addEventListener('keydown', (e) =>
    {
      if (e.key === 'Escape' && helpModal.style.display === 'flex')
      {
        helpModal.style.display = 'none';
      }
    });
  }
};

// Export for use in other scripts
window.Utils = Utils;

function btkGetPathPrefix()
{
  const body = document.body;
  const currentPageName = body?.dataset?.page || 'index';
  const isRootPage = currentPageName === 'index' || currentPageName === 'about';
  return isRootPage ? '' : '../';
}

function btkEnsureConsentModal()
{
  const existing = btkGetStoredConsent();
  if (existing) return;

  // Avoid showing consent on Terms/Privacy themselves (still accessible without blocking)
  const page = document.body?.dataset?.page;
  if (page === 'terms' || page === 'privacy') return;

  const pathPrefix = btkGetPathPrefix();

  const overlay = document.createElement('div');
  overlay.className = 'btk-consent-modal';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');

  overlay.innerHTML = `
    <div class="btk-consent-content">
      <div class="btk-consent-header">
        <div class="btk-consent-title">⚠️ Before you continue</div>
      </div>
      <div class="btk-consent-body">
        <p style="margin-top:0;">
          Ballistics Toolkit is free, non-commercial software provided “as is” and makes no guarantee of accuracy or correctness.
          It may contain errors and/or inaccuracies.
        </p>
        <p>
          Do not use this tool for any purpose where incorrect ballistic data could create a hazardous or unsafe condition.
          Real-world use is entirely at your own risk.
        </p>
        <p>
          Please review and accept the <a href="${pathPrefix}terms.html" target="_blank" rel="noopener">Terms of Service</a> and
          <a href="${pathPrefix}privacy.html" target="_blank" rel="noopener">Privacy Policy</a>.
        </p>

        <div class="btk-consent-checks">
          <label class="btk-consent-check">
            <input type="checkbox" id="btkConsentAge">
            <span>I am 18 years of age or older.</span>
          </label>

          <label class="btk-consent-check">
            <input type="checkbox" id="btkConsentTerms">
            <span>I have read and agree to the Terms of Service and Privacy Policy.</span>
          </label>

          <label class="btk-consent-check">
            <input type="checkbox" id="btkConsentEssential">
            <span>I consent to essential cookies used to remember site settings (e.g., simulator preferences).</span>
          </label>

          <label class="btk-consent-check">
            <input type="checkbox" id="btkConsentAnalytics">
            <span>Allow analytics cookies for enhanced tracking (Google Analytics). If declined, basic anonymous/aggregated analytics are still collected without cookies. (Optional)</span>
          </label>
        </div>

        <div class="btk-consent-actions">
          <button class="btn btn-secondary" id="btkConsentDecline">Decline</button>
          <button class="btn btn-primary" id="btkConsentAccept" disabled>Accept & Continue</button>
        </div>

        <div class="btk-consent-footnote">
          Basic anonymous analytics (page views, general traffic) are collected without cookies using Google Analytics Consent Mode.
          You can change your cookie preferences later by clearing site data. Consent version: ${BTK_CONSENT_VERSION}.
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const age = overlay.querySelector('#btkConsentAge');
  const terms = overlay.querySelector('#btkConsentTerms');
  const essential = overlay.querySelector('#btkConsentEssential');
  const analytics = overlay.querySelector('#btkConsentAnalytics');
  const acceptBtn = overlay.querySelector('#btkConsentAccept');
  const declineBtn = overlay.querySelector('#btkConsentDecline');

  // Require Age, Terms+Privacy, and Essential cookies to proceed.
  function updateAcceptEnabled()
  {
    acceptBtn.disabled = !(age.checked && terms.checked && essential.checked);
  }
  age.addEventListener('change', updateAcceptEnabled);
  terms.addEventListener('change', updateAcceptEnabled);
  essential.addEventListener('change', updateAcceptEnabled);
  updateAcceptEnabled();

  acceptBtn.addEventListener('click', () =>
  {
    const analyticsAccepted = !!analytics.checked;
    btkStoreConsent({
      ageVerified: true,
      termsAccepted: true,
      privacyAccepted: true,
      essentialCookiesAccepted: true,
      analyticsCookiesAccepted: analyticsAccepted
    });
    overlay.remove();
    // Update GA consent state (GA is already loaded in cookieless mode)
    btkUpdateAnalyticsConsent(analyticsAccepted);
  });

  // Decline = keep analytics off; but still require Terms/Privacy + essential to use site.
  declineBtn.addEventListener('click', () =>
  {
    analytics.checked = false;
    // Provide a gentle nudge: take them to Terms so they can decide.
    window.location.href = `${pathPrefix}terms.html`;
  });
}