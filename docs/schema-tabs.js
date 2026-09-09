export function initializeTabs(document, window) {
  const ids = ['schemas', 'architecture', 'responsibilities'];
  const panels = ids.map(id => document.getElementById(id));
  if (panels.some(panel => !panel)) return;
  const list = document.createElement('div');
  list.className = 'schema-tabs';
  list.setAttribute('role', 'tablist');
  list.setAttribute('aria-label', 'Data Schema Overview');
  const buttons = panels.map((panel, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.id = `tab-${ids[index]}`;
    button.textContent = panel.querySelector('h2').textContent;
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-controls', panel.id);
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', button.id);
    panel.tabIndex = 0;
    button.addEventListener('click', () => { window.location.hash = ids[index]; select(); button.focus(); });
    button.addEventListener('keydown', event => {
      const target = {ArrowRight: (index + 1) % 3, ArrowLeft: (index + 2) % 3, Home: 0, End: 2}[event.key];
      if (target === undefined) return;
      event.preventDefault();
      buttons[target].click();
      buttons[target].focus();
    });
    list.append(button);
    return button;
  });
  function select() {
    const index = Math.max(0, ids.indexOf(window.location.hash.slice(1)));
    panels.forEach((panel, i) => {
      panel.hidden = i !== index;
      buttons[i].setAttribute('aria-selected', String(i === index));
      buttons[i].tabIndex = i === index ? 0 : -1;
    });
  }
  panels[0].before(list);
  select();
  window.addEventListener('hashchange', select);
}
if (typeof document !== 'undefined') initializeTabs(document, window);
