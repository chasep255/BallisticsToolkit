export const SettingsCookies = {
  set(name, value, days = 365)
  {
    const expires = new Date();
    expires.setTime(expires.getTime() + (days * 24 * 60 * 60 * 1000));
    document.cookie = `${name}=${encodeURIComponent(value)};expires=${expires.toUTCString()};path=/`;
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
          this.set(`hit_prob_${settingName}`, value);
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
        const value = this.get(`hit_prob_${settingName}`);
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
