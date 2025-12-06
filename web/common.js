// Google Analytics - only load on production domain
(function()
{
  const hostname = window.location.hostname;
  const isProduction = hostname === 'ballisticstoolkit.com' || hostname === 'www.ballisticstoolkit.com';

  if (isProduction)
  {
    const GA_MEASUREMENT_ID = 'G-JWTD9KG6D6';
    const gtagScript = document.createElement('script');
    gtagScript.async = true;
    gtagScript.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
    document.head.appendChild(gtagScript);

    window.dataLayer = window.dataLayer || [];

    function gtag()
    {
      dataLayer.push(arguments);
    }
    window.gtag = gtag;
    gtag('js', new Date());
    gtag('config', GA_MEASUREMENT_ID,
    {
      'anonymize_ip': true
    });
  }
})();

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
    'target-sim': 'target-sim/target-sim.html',
    'wind-sim': 'wind-sim/wind-sim.html',
    'steel-sim': 'steel-sim/steel-sim.html',
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
  const isLoadComp = currentPageName === 'load-comp';
  const isTargetSim = currentPageName === 'target-sim';
  const isWindSim = currentPageName === 'wind-sim';
  const isSteelSim = currentPageName === 'steel-sim';
  const isWindGame = currentPageName === 'wind-game';
  const isFClassSim = currentPageName === 'fclass-sim';

  const navHTML = `
        <div class="nav-content">
            <a href="${pathPrefix}index.html" class="nav-logo">
                <img src="${pathPrefix}ballistics-toolkit-icon.png" alt="BallisticsToolkit" class="nav-logo-img">
                <span class="nav-logo-text">Ballistics Toolkit</span>
            </a>
            <div class="nav-links">
                <a href="${pathPrefix}ballistic-calc/ballistic-calc.html" ${isBallisticCalc ? 'class="active"' : ''}>Ballistic Calc</a>
                <a href="${pathPrefix}load-comp/load-comp.html" ${isLoadComp ? 'class="active"' : ''}>Load Comp</a>
                <a href="${pathPrefix}target-sim/target-sim.html" ${isTargetSim ? 'class="active"' : ''}>Target Sim</a>
                <a href="${pathPrefix}wind-sim/wind-sim.html" ${isWindSim ? 'class="active"' : ''}>Wind Sim</a>
                <a href="${pathPrefix}steel-sim/steel-sim.html" ${isSteelSim ? 'class="active"' : ''}>Steel Sim</a>
                <a href="${pathPrefix}fclass-sim/fclass-sim.html" ${isFClassSim ? 'class="active"' : ''}>F-Class Sim</a>
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