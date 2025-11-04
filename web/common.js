// Cookie consent management
const CookieConsent = {
  STORAGE_KEY: 'btk_cookie_consent',
  
  // Get current consent status
  getConsent: function()
  {
    const stored = localStorage.getItem(this.STORAGE_KEY);
    if (stored === 'accepted') return true;
    return null; // No decision yet (rejections are not saved)
  },
  
  // Set consent status
  setConsent: function(accepted)
  {
    if (accepted)
    {
      // Only save preference if accepted
      localStorage.setItem(this.STORAGE_KEY, 'accepted');
      this.loadGoogleAnalytics();
    }
    else
    {
      // Don't save rejection - remove any existing preference so banner shows again
      localStorage.removeItem(this.STORAGE_KEY);
      this.removeGoogleAnalytics();
    }
  },
  
  // Load Google Analytics (only on production)
  loadGoogleAnalytics: function()
  {
    const hostname = window.location.hostname;
    const isProduction = hostname === 'ballisticstoolkit.com' || hostname === 'www.ballisticstoolkit.com';
    
    if (!isProduction || window.gtag) return; // Already loaded or not production
    
    const GA_MEASUREMENT_ID = 'G-JWTD9KG6D6';
    const gtagScript = document.createElement('script');
    gtagScript.async = true;
    gtagScript.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
    document.head.appendChild(gtagScript);
    
    window.dataLayer = window.dataLayer || [];
    function gtag(){ dataLayer.push(arguments); }
    window.gtag = gtag;
    gtag('js', new Date());
    gtag('config', GA_MEASUREMENT_ID, { 'anonymize_ip': true });
  },
  
  // Remove Google Analytics cookies (if user revokes consent)
  removeGoogleAnalytics: function()
  {
    // Clear GA cookies
    const cookies = document.cookie.split(';');
    cookies.forEach(cookie =>
    {
      const eqPos = cookie.indexOf('=');
      const name = eqPos > -1 ? cookie.substr(0, eqPos).trim() : cookie.trim();
      if (name.startsWith('_ga') || name.startsWith('_gid') || name.startsWith('_gat'))
      {
        document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/;`;
        document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/;domain=.${window.location.hostname};`;
      }
    });
  },
  
  // Clear all cookies for this domain
  clearAllCookies: function()
  {
    const cookies = document.cookie.split(';');
    cookies.forEach(cookie =>
    {
      const eqPos = cookie.indexOf('=');
      const name = eqPos > -1 ? cookie.substr(0, eqPos).trim() : cookie.trim();
      // Clear cookie for current path and root path
      document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/;`;
      document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/;domain=.${window.location.hostname};`;
      document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/;domain=${window.location.hostname};`;
    });
  },
  
  // Show cookie banner
  showBanner: function()
  {
    // Check if banner already exists
    if (document.getElementById('cookie-banner')) return;
    
    // Determine path prefix based on current page
    const body = document.body;
    const currentPageName = body ? (body.dataset.page || 'index') : 'index';
    const isRootPage = currentPageName === 'index' || currentPageName === 'about';
    const pathPrefix = isRootPage ? '' : '../';
    
    const banner = document.createElement('div');
    banner.id = 'cookie-banner';
    banner.className = 'cookie-banner';
    banner.innerHTML = `
      <div class="cookie-banner-content">
        <p>We use analytics cookies to improve our site. <a href="${pathPrefix}privacy.html#cookies">Learn more</a></p>
        <div class="cookie-banner-buttons">
          <button id="cookie-accept" class="cookie-btn cookie-btn-accept">Accept</button>
          <button id="cookie-reject" class="cookie-btn cookie-btn-reject">Reject</button>
        </div>
      </div>
    `;
    document.body.appendChild(banner);
    
    // Button handlers
    document.getElementById('cookie-accept').addEventListener('click', () =>
    {
      this.setConsent(true);
      this.hideBanner();
    });
    
    document.getElementById('cookie-reject').addEventListener('click', () =>
    {
      this.setConsent(false);
      this.hideBanner();
    });
    
    // Show banner with animation
    setTimeout(() => banner.classList.add('show'), 100);
  },
  
  // Hide cookie banner
  hideBanner: function()
  {
    const banner = document.getElementById('cookie-banner');
    if (banner)
    {
      banner.classList.remove('show');
      setTimeout(() => banner.remove(), 300);
    }
  },
  
  // Reset cookie preferences (clear consent and all cookies, show banner)
  resetCookiePreferences: function()
  {
    // Clear consent preference
    localStorage.removeItem(this.STORAGE_KEY);
    
    // Clear all cookies
    this.clearAllCookies();
    this.removeGoogleAnalytics();
    
    // Show banner again
    this.showBanner();
  },
  
  // Initialize (check consent and load GA or show banner)
  init: function()
  {
    const consent = this.getConsent();
    if (consent === true)
    {
      this.loadGoogleAnalytics();
    }
    else if (consent === null)
    {
      this.showBanner();
    }
    // If rejected, do nothing (GA not loaded)
  }
};

// Initialize cookie consent on page load
document.addEventListener('DOMContentLoaded', function()
{
  CookieConsent.init();
});

// Export for global access
window.CookieConsent = CookieConsent;

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
    'target-sim': 'target-sim/target-sim.html',
    'wind-sim': 'wind-sim/wind-sim.html',
    'fclass-sim': 'fclass-sim/fclass-sim.html'
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

  // Determine active states
  const isHome = currentPageName === 'index';
  const isBallisticCalc = currentPageName === 'ballistic-calc';
  const isTargetSim = currentPageName === 'target-sim';
  const isWindSim = currentPageName === 'wind-sim';
  const isWindGame = currentPageName === 'wind-game';
  const isFClassSim = currentPageName === 'fclass-sim';

  const navHTML = `
        <div class="nav-content">
            <a href="${pathPrefix}index.html" class="nav-logo">
                <img src="${pathPrefix}ballistics-toolkit-icon.png" alt="BallisticsToolkit" class="nav-logo-img">
                <span class="nav-logo-text">Ballistics Toolkit</span>
            </a>
            <div class="nav-links">
                <a href="${pathPrefix}index.html" ${isHome ? 'class="active"' : ''}>Home</a>
                <a href="${pathPrefix}ballistic-calc/ballistic-calc.html" ${isBallisticCalc ? 'class="active"' : ''}>Ballistic Calculator</a>
                <a href="${pathPrefix}target-sim/target-sim.html" ${isTargetSim ? 'class="active"' : ''}>Target Simulator</a>
                <a href="${pathPrefix}wind-sim/wind-sim.html" ${isWindSim ? 'class="active"' : ''}>Wind Simulator</a>
                <a href="${pathPrefix}fclass-sim/fclass-sim.html" ${isFClassSim ? 'class="active"' : ''}>F-Class Simulator</a>
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
      <div class="app-container" style="display:flex;flex-wrap:wrap;gap:12px;align-items:center;">
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