export function createSettingsCookies(prefix)
{
  return {
    set(name, value, days = 365)
    {
      const expires = new Date();
      expires.setTime(expires.getTime() + (days * 24 * 60 * 60 * 1000));
      const secure = window.location.protocol === 'https:' ? ';Secure' : '';
      document.cookie = `${name}=${encodeURIComponent(value)};expires=${expires.toUTCString()};path=/;SameSite=Lax${secure}`;
    },

    get(name)
    {
      const nameEQ = name + '=';
      const cookies = document.cookie.split(';');
      for (let i = 0; i < cookies.length; i++)
      {
        let cookie = cookies[i];
        while (cookie.charAt(0) === ' ')
        {
          cookie = cookie.substring(1, cookie.length);
        }
        if (cookie.indexOf(nameEQ) === 0)
        {
          return decodeURIComponent(cookie.substring(nameEQ.length, cookie.length));
        }
      }
      return null;
    },

    getSettingElements()
    {
      const inputs = Array.from(document.querySelectorAll('input[id], select[id], textarea[id]'));
      return inputs.filter(el =>
      {
        const type = el.type?.toLowerCase();
        return type !== 'button' && type !== 'submit' && type !== 'reset' && el.id;
      });
    },

    getElementValue(element)
    {
      if (element.type === 'checkbox')
      {
        return element.checked ? 'true' : 'false';
      }
      return element.value || '';
    },

    setElementValue(element, value)
    {
      if (element.type === 'checkbox')
      {
        element.checked = value === 'true';
      }
      else if (element.tagName === 'SELECT')
      {
        // Reject cookie values that aren't one of the current options (e.g. an
        // option was renamed or removed since the cookie was saved). Leaving
        // the HTML-declared default in place is better than clearing the
        // select to a blank state.
        const validValues = Array.from(element.options).map(o => o.value);
        if (validValues.includes(value))
        {
          element.value = value;
        }
      }
      else
      {
        element.value = value;
      }
    },

    saveAll()
    {
      const elements = this.getSettingElements();
      elements.forEach(element =>
      {
        const settingName = element.id;
        if (settingName)
        {
          const value = this.getElementValue(element);
          if (value !== '')
          {
            this.set(`${prefix}${settingName}`, value);
          }
        }
      });
    },

    loadAll()
    {
      const elements = this.getSettingElements();
      elements.forEach(element =>
      {
        const settingName = element.id;
        if (settingName)
        {
          const value = this.get(`${prefix}${settingName}`);
          if (value !== null)
          {
            this.setElementValue(element, value);
          }
        }
      });
    },

    attachAutoSave()
    {
      const elements = this.getSettingElements();
      elements.forEach(element =>
      {
        const eventType = (element.type === 'checkbox' || element.tagName === 'SELECT') ? 'change' : 'input';
        element.addEventListener(eventType, () =>
        {
          this.saveAll();
        });
      });
    }
  };
}
