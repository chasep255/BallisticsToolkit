// settings-cookies.js - Cookie-based settings persistence for F-Class simulator

/**
 * Cookie management utilities for saving and loading settings
 * Automatically discovers and manages all form inputs
 */
export const SettingsCookies = {
  /**
   * Set a cookie with the given name and value
   * @param {string} name - Cookie name
   * @param {string} value - Cookie value
   * @param {number} days - Days until expiration (default: 365)
   */
  set(name, value, days = 365) {
    const expires = new Date();
    expires.setTime(expires.getTime() + (days * 24 * 60 * 60 * 1000));
    document.cookie = `${name}=${encodeURIComponent(value)};expires=${expires.toUTCString()};path=/`;
  },

  /**
   * Get a cookie value by name
   * @param {string} name - Cookie name
   * @returns {string|null} Cookie value or null if not found
   */
  get(name) {
    const nameEQ = name + '=';
    const cookies = document.cookie.split(';');
    for (let i = 0; i < cookies.length; i++) {
      let cookie = cookies[i];
      while (cookie.charAt(0) === ' ') {
        cookie = cookie.substring(1, cookie.length);
      }
      if (cookie.indexOf(nameEQ) === 0) {
        return decodeURIComponent(cookie.substring(nameEQ.length, cookie.length));
      }
    }
    return null;
  },

  /**
   * Get all setting elements from the DOM
   * Automatically finds all inputs, selects, and checkboxes with IDs
   * @returns {Array<HTMLElement>} Array of setting elements
   */
  getSettingElements() {
    // Find all form inputs with IDs (inputs, selects, textareas, checkboxes)
    const inputs = Array.from(document.querySelectorAll('input[id], select[id], textarea[id]'));
    
    // Filter out buttons and submit inputs
    return inputs.filter(el => {
      const type = el.type?.toLowerCase();
      return type !== 'button' && type !== 'submit' && type !== 'reset' && el.id;
    });
  },

  /**
   * Get the value from a form element
   * @param {HTMLElement} element - Form element
   * @returns {string} Element value
   */
  getElementValue(element) {
    if (element.type === 'checkbox') {
      return element.checked ? 'true' : 'false';
    }
    return element.value || '';
  },

  /**
   * Set the value on a form element
   * @param {HTMLElement} element - Form element
   * @param {string} value - Value to set
   */
  setElementValue(element, value) {
    if (element.type === 'checkbox') {
      element.checked = value === 'true';
    } else {
      element.value = value;
    }
  },

  /**
   * Save all current settings to cookies
   */
  saveAll() {
    const elements = this.getSettingElements();
    elements.forEach(element => {
      const settingName = element.id;
      if (settingName) {
        const value = this.getElementValue(element);
        if (value !== '') {
          this.set(`fclass_sim_${settingName}`, value);
        }
      }
    });
  },

  /**
   * Load all settings from cookies and apply to form
   */
  loadAll() {
    const elements = this.getSettingElements();
    elements.forEach(element => {
      const settingName = element.id;
      if (settingName) {
        const value = this.get(`fclass_sim_${settingName}`);
        if (value !== null) {
          this.setElementValue(element, value);
        }
      }
    });
  },

  /**
   * Attach change listeners to all settings inputs to auto-save on change
   */
  attachAutoSave() {
    const elements = this.getSettingElements();
    elements.forEach(element => {
      // Use 'change' event for selects and checkboxes, 'input' for number/text inputs
      const eventType = (element.type === 'checkbox' || element.tagName === 'SELECT') ? 'change' : 'input';
      element.addEventListener(eventType, () => {
        this.saveAll();
      });
    });
  }
};
