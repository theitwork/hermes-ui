/* JAY customization — core runtime.
   Namespace, safe DOM builder, icons, event bus, browser-local storage,
   formatting, drawers/sheets, toasts, menus and the widget state machine.
   No innerHTML is ever used with data: text always goes through textContent. */
(function () {
  'use strict';
  if (window.JAY && window.JAY.__core) return;
  const JAY = (window.JAY = window.JAY || {});
  JAY.__core = true;
  JAY.version = '0.1.0';

  /* ── DOM builder ─────────────────────────────────────────────────────── */
  function append(parent, child) {
    if (child === null || child === undefined || child === false || child === true) return;
    if (Array.isArray(child)) { child.forEach((c) => append(parent, c)); return; }
    if (child instanceof Node) { parent.appendChild(child); return; }
    parent.appendChild(document.createTextNode(String(child)));
  }

  function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    if (attrs && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) {
      children.unshift(attrs);
      attrs = null;
    }
    if (attrs) {
      for (const key of Object.keys(attrs)) {
        const val = attrs[key];
        if (val === null || val === undefined || val === false) continue;
        if (key === 'class' || key === 'className') el.className = Array.isArray(val) ? val.filter(Boolean).join(' ') : val;
        else if (key === 'text') el.textContent = String(val);
        else if (key === 'style' && typeof val === 'object') {
          Object.keys(val).forEach((prop) => {
            if (prop.startsWith('--')) el.style.setProperty(prop, val[prop]);
            else el.style[prop] = val[prop];
          });
        }
        else if (key.startsWith('on') && typeof val === 'function') el.addEventListener(key.slice(2).toLowerCase(), val);
        else if (key === 'dataset' && typeof val === 'object') Object.assign(el.dataset, val);
        else if (val === true) el.setAttribute(key, '');
        else el.setAttribute(key, String(val));
      }
    }
    append(el, children);
    return el;
  }

  function clear(el) { while (el && el.firstChild) el.removeChild(el.firstChild); return el; }
  function mount(el, ...children) { clear(el); append(el, children); return el; }

  /* ── Icons (Lucide, stroke 1.75 — same family as Hermes' static/icons.js) ── */
  const ICONS = {
    home: '<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    chat: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    tasks: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="m9 12 2 2 4-4"/>',
    projects: '<path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/><path d="M8 10v4"/><path d="M12 10v2"/><path d="M16 10v6"/>',
    calendar: '<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/>',
    notes: '<path d="M16 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8Z"/><path d="M15 3v4a2 2 0 0 0 2 2h4"/>',
    files: '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
    automations: '<rect width="8" height="8" x="3" y="3" rx="2"/><path d="M7 11v4a2 2 0 0 0 2 2h4"/><rect width="8" height="8" x="13" y="13" rx="2"/>',
    people: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    integrations: '<rect width="7" height="7" x="14" y="3" rx="1"/><path d="M10 21V8a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-5a1 1 0 0 0-1-1H3"/>',
    system: '<path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2"/>',
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>',
    moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
    plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
    minus: '<path d="M5 12h14"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    'chevron-right': '<path d="m9 18 6-6-6-6"/>',
    'chevron-left': '<path d="m15 18-6-6 6-6"/>',
    'chevron-down': '<path d="m6 9 6 6 6-6"/>',
    'arrow-up': '<path d="m5 12 7-7 7 7"/><path d="M12 19V5"/>',
    'arrow-left': '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
    'arrow-right': '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
    'arrow-up-right': '<path d="M7 7h10v10"/><path d="M7 17 17 7"/>',
    mic: '<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/>',
    paperclip: '<path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/>',
    expand: '<polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" x2="14" y1="3" y2="10"/><line x1="3" x2="10" y1="21" y2="14"/>',
    compose: '<path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z"/>',
    clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    circle: '<circle cx="12" cy="12" r="9"/>',
    'circle-check': '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
    'circle-dashed': '<path d="M10.1 2.182a10 10 0 0 1 3.8 0"/><path d="M13.9 21.818a10 10 0 0 1-3.8 0"/><path d="M17.609 3.721a10 10 0 0 1 2.69 2.7"/><path d="M2.182 13.9a10 10 0 0 1 0-3.8"/><path d="M20.279 17.609a10 10 0 0 1-2.7 2.69"/><path d="M21.818 10.1a10 10 0 0 1 0 3.8"/><path d="M3.721 6.391a10 10 0 0 1 2.7-2.69"/><path d="M6.391 20.279a10 10 0 0 1-2.69-2.7"/>',
    'alert-triangle': '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
    'alert-circle': '<circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/>',
    mail: '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
    reply: '<polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/>',
    user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    'user-check': '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><polyline points="16 11 18 13 22 9"/>',
    more: '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
    filter: '<path d="M3 6h18"/><path d="M7 12h10"/><path d="M10 18h4"/>',
    sort: '<path d="m21 16-4 4-4-4"/><path d="M17 20V4"/><path d="m3 8 4-4 4 4"/><path d="M7 4v16"/>',
    list: '<line x1="8" x2="21" y1="6" y2="6"/><line x1="8" x2="21" y1="12" y2="12"/><line x1="8" x2="21" y1="18" y2="18"/><line x1="3" x2="3.01" y1="6" y2="6"/><line x1="3" x2="3.01" y1="12" y2="12"/><line x1="3" x2="3.01" y1="18" y2="18"/>',
    board: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/><path d="M15 3v18"/>',
    lightbulb: '<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/>',
    phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>',
    flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" x2="4" y1="22" y2="15"/>',
    external: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
    sliders: '<line x1="21" x2="14" y1="4" y2="4"/><line x1="10" x2="3" y1="4" y2="4"/><line x1="21" x2="12" y1="12" y2="12"/><line x1="8" x2="3" y1="12" y2="12"/><line x1="21" x2="16" y1="20" y2="20"/><line x1="12" x2="3" y1="20" y2="20"/><line x1="14" x2="14" y1="2" y2="6"/><line x1="8" x2="8" y1="10" y2="14"/><line x1="16" x2="16" y1="18" y2="22"/>',
    'file-text': '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>',
    file: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/>',
    image: '<rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>',
    grid: '<rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/>',
    'wifi-off': '<path d="M12 20h.01"/><path d="M8.5 16.429a5 5 0 0 1 7 0"/><path d="M5 12.859a10 10 0 0 1 5.17-2.69"/><path d="M19 12.859a10 10 0 0 0-2.007-1.523"/><path d="M2 8.82a15 15 0 0 1 4.177-2.643"/><path d="M22 8.82a15 15 0 0 0-11.288-3.764"/><path d="m2 2 20 20"/>',
    refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
    trash: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/>',
    inbox: '<polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
    hourglass: '<path d="M5 22h14"/><path d="M5 2h14"/><path d="M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22"/><path d="M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2"/>',
    snooze: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2"/><path d="M5 3 2 6"/><path d="m22 6-3-3"/><path d="M6.38 18.7 4 21"/><path d="M17.64 18.67 20 21"/>',
    eye: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
    server: '<rect width="20" height="8" x="2" y="2" rx="2" ry="2"/><rect width="20" height="8" x="2" y="14" rx="2" ry="2"/><line x1="6" x2="6.01" y1="6" y2="6"/><line x1="6" x2="6.01" y1="18" y2="18"/>',
    'message-circle': '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
    send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
    wallet: '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
    weather: '<path d="M12 2v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="M20 12h2"/><path d="m19.07 4.93-1.41 1.41"/><path d="M15.947 12.65a4 4 0 0 0-5.925-4.128"/><path d="M13 22H7a5 5 0 1 1 4.9-6H13a3 3 0 0 1 0 6Z"/>',
    news: '<path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2"/><path d="M18 14h-8"/><path d="M15 18h-5"/><path d="M10 6h8v4h-8V6Z"/>',
    tag: '<path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r=".5"/>',
    history: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>',
    database: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5V19A9 3 0 0 0 21 19V5"/><path d="M3 12A9 3 0 0 0 21 12"/>',
    repeat: '<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
    lock: '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    wave: '<path d="M2 10v3"/><path d="M6 6v11"/><path d="M10 3v18"/><path d="M14 8v7"/><path d="M18 5v13"/><path d="M22 10v3"/>',
    globe: '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
    building: '<rect width="16" height="20" x="4" y="2" rx="2" ry="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01"/><path d="M16 6h.01"/><path d="M12 6h.01"/><path d="M12 10h.01"/><path d="M12 14h.01"/><path d="M16 10h.01"/><path d="M16 14h.01"/><path d="M8 10h.01"/><path d="M8 14h.01"/>',
    heart: '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
    'map-pin': '<path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>',
    video: '<path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5"/><rect x="2" y="6" width="14" height="12" rx="2"/>',
    grip: '<circle cx="9" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="19" r="1"/>',
    enter: '<polyline points="9 10 4 15 9 20"/><path d="M20 4v7a4 4 0 0 1-4 4H4"/>',
    plug: '<path d="M12 22v-5"/><path d="M9 8V2"/><path d="M15 8V2"/><path d="M18 8v5a6 6 0 0 1-12 0V8Z"/>',
    sparkle: '<path d="M12 3v3"/><path d="M12 18v3"/><path d="M3 12h3"/><path d="M18 12h3"/><path d="m5.6 5.6 2.1 2.1"/><path d="m16.3 16.3 2.1 2.1"/><path d="m5.6 18.4 2.1-2.1"/><path d="m16.3 7.7 2.1-2.1"/>',
    command: '<path d="M15 6v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3"/>',
    monitor: '<rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/>',
    star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
    'bell-off': '<path d="M8.7 3A6 6 0 0 1 18 8a21.3 21.3 0 0 0 .6 5"/><path d="M17 17H3s3-2 3-9a4.67 4.67 0 0 1 .3-1.7"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/><path d="m2 2 20 20"/>',
    'more-vertical': '<circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/>',
    comment: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
    'check-square': '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="m9 12 2 2 4-4"/>',
    table: '<path d="M12 3v18"/><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M3 15h18"/>',
    'log-out': '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/>',
    sum: '<path d="M18 7V4H6l6 8-6 8h12v-3"/>',
    percent: '<line x1="19" x2="5" y1="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>',
    'calendar-days': '<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/><path d="M8 14h.01"/><path d="M12 14h.01"/><path d="M16 14h.01"/><path d="M8 18h.01"/><path d="M12 18h.01"/><path d="M16 18h.01"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/>',
    'log-in': '<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" x2="3" y1="12" y2="12"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/>',
    'chevron-up': '<path d="m18 15-6-6-6 6"/>',
    'layout-grid': '<rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
    target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
  };

  const SVG_NS = 'http://www.w3.org/2000/svg';
  function icon(name, size, extraClass) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    const s = String(size || 18);
    svg.setAttribute('width', s);
    svg.setAttribute('height', s);
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.75');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    svg.setAttribute('class', 'jay-icon' + (extraClass ? ' ' + extraClass : ''));
    // ICONS are static, trusted constants shipped with this file.
    svg.innerHTML = ICONS[name] || ICONS.circle;
    return svg;
  }

  /* ── Event bus ───────────────────────────────────────────────────────── */
  const listeners = new Map();
  function on(evt, fn) {
    if (!listeners.has(evt)) listeners.set(evt, new Set());
    listeners.get(evt).add(fn);
    return () => listeners.get(evt) && listeners.get(evt).delete(fn);
  }
  function emit(evt, payload) {
    const set = listeners.get(evt);
    if (!set) return;
    Array.from(set).forEach((fn) => {
      try { fn(payload); } catch (err) { console.warn('[jay] listener failed for', evt, err); }
    });
  }

  /* ── Browser-local storage (demo state + UI prefs only; never secrets) ── */
  const PREFIX = 'jay:';
  const storage = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem(PREFIX + key);
        return raw === null ? fallback : JSON.parse(raw);
      } catch (_) { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(PREFIX + key, JSON.stringify(value)); } catch (_) { /* storage blocked */ }
    },
    remove(key) {
      try { localStorage.removeItem(PREFIX + key); } catch (_) { /* storage blocked */ }
    },
    clearAll() {
      try {
        Object.keys(localStorage).filter((k) => k.startsWith(PREFIX)).forEach((k) => localStorage.removeItem(k));
      } catch (_) { /* storage blocked */ }
    },
  };

  /* ── Formatting ──────────────────────────────────────────────────────── */
  const DAY = 86400000;
  function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
  function dayDiff(a, b) { return Math.round((startOfDay(a) - startOfDay(b)) / DAY); }
  const fmt = {
    time(d) {
      const x = new Date(d);
      return String(x.getHours()).padStart(2, '0') + ':' + String(x.getMinutes()).padStart(2, '0');
    },
    weekday(d) { return new Date(d).toLocaleDateString(undefined, { weekday: 'long' }); },
    dayLong(d) { return new Date(d).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' }); },
    dateShort(d) { return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); },
    dateFull(d) { return new Date(d).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }); },
    relative(d, now) {
      const t = new Date(d).getTime();
      const n = (now || new Date()).getTime();
      const diff = n - t;
      if (diff < 60000 && diff > -60000) return 'Just now';
      if (diff > 0 && diff < 3600000) { const m = Math.round(diff / 60000); return m + (m === 1 ? ' minute ago' : ' minutes ago'); }
      const days = dayDiff(n, t);
      if (days === 0) { const hrs = Math.round(diff / 3600000); return hrs + (hrs === 1 ? ' hour ago' : ' hours ago'); }
      if (days === 1) return 'Yesterday';
      if (days > 1 && days < 7) return fmt.weekday(t);
      return fmt.dateShort(t);
    },
    ago(d, now) {
      const diff = ((now || new Date()).getTime() - new Date(d).getTime()) / 60000;
      if (diff < 1) return 'now';
      if (diff < 60) return Math.round(diff) + 'm';
      if (diff < 1440) return Math.round(diff / 60) + 'h';
      return Math.round(diff / 1440) + 'd';
    },
    due(d, now) {
      if (!d) return 'No date';
      const days = dayDiff(d, now || new Date());
      if (days === 0) return 'Today';
      if (days === 1) return 'Tomorrow';
      if (days === -1) return 'Yesterday';
      if (days < -1) return Math.abs(days) + ' days ago';
      if (days < 7) return new Date(d).toLocaleDateString(undefined, { weekday: 'short' });
      return fmt.dateShort(d);
    },
    dueState(d, now) {
      if (!d) return 'none';
      const days = dayDiff(d, now || new Date());
      if (days < 0) return 'overdue';
      if (days === 0) return 'today';
      if (days <= 7) return 'soon';
      return 'later';
    },
    greeting(now) {
      const hr = (now || new Date()).getHours();
      if (hr < 5) return 'Good evening';
      if (hr < 12) return 'Good morning';
      if (hr < 18) return 'Good afternoon';
      return 'Good evening';
    },
    initials(name) {
      return String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('');
    },
    plural(n, one, many) { return n + ' ' + (n === 1 ? one : (many || one + 's')); },
    isoDate(d) {
      const x = new Date(d);
      return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0');
    },
  };

  /* ── Viewport helpers ───────────────────────────────────────────────── */
  const mqMobile = window.matchMedia('(max-width: 767.98px)');
  const mqReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  function isMobile() { return mqMobile.matches; }

  let uid = 0;
  function nextId(prefix) { uid += 1; return (prefix || 'jay') + '-' + Date.now().toString(36) + '-' + uid; }

  /* ── Overlay host (inside #jayApp so it shares JAY's stacking context) ── */
  function overlayHost() {
    return document.getElementById('jayOverlays') || document.body;
  }

  /* ── Toasts ─────────────────────────────────────────────────────────── */
  function toast(message, opts) {
    const o = opts || {};
    let host = document.getElementById('jayToasts');
    if (!host) {
      host = h('div', { id: 'jayToasts', class: 'jay-toasts', role: 'status', 'aria-live': 'polite' });
      overlayHost().appendChild(host);
    }
    const node = h('div', { class: ['jay-toast', o.tone ? 'is-' + o.tone : ''] },
      o.icon ? icon(o.icon, 16) : null,
      h('span', { class: 'jay-toast-text' }, message),
      o.action ? h('button', {
        type: 'button', class: 'jay-toast-action',
        onclick: () => { try { o.action.run(); } finally { dismiss(); } },
      }, o.action.label) : null);
    host.appendChild(node);
    requestAnimationFrame(() => node.classList.add('is-in'));
    let timer = setTimeout(dismiss, o.duration || 3600);
    function dismiss() {
      clearTimeout(timer);
      node.classList.remove('is-in');
      setTimeout(() => node.remove(), mqReducedMotion.matches ? 0 : 180);
    }
    return dismiss;
  }

  /* ── Focus management ───────────────────────────────────────────────── */
  const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  function focusables(root) {
    return Array.from(root.querySelectorAll(FOCUSABLE)).filter((el) => el.offsetParent !== null || el === document.activeElement);
  }
  function trapFocus(root, evt) {
    if (evt.key !== 'Tab') return;
    const items = focusables(root);
    if (!items.length) { evt.preventDefault(); return; }
    const first = items[0];
    const last = items[items.length - 1];
    if (evt.shiftKey && document.activeElement === first) { evt.preventDefault(); last.focus(); }
    else if (!evt.shiftKey && document.activeElement === last) { evt.preventDefault(); first.focus(); }
  }

  /* ── Panel: right drawer on desktop, bottom sheet on mobile ─────────── */
  let activePanel = null;
  function openPanel(opts) {
    const o = opts || {};
    if (activePanel) activePanel.close({ silent: true });
    const returnFocus = document.activeElement;
    const titleId = nextId('jay-panel-title');
    const mobile = isMobile();
    const closeBtn = h('button', { type: 'button', class: 'jay-icon-btn', 'aria-label': 'Close', onclick: () => api.close() }, icon('x', 18));
    const body = h('div', { class: 'jay-panel-body' });
    append(body, o.body);
    const footer = o.footer ? h('div', { class: 'jay-panel-footer' }, o.footer) : null;
    const panel = h('div', {
      class: ['jay-panel', mobile ? 'is-sheet' : (o.placement === 'center' ? 'is-center' : 'is-drawer'), o.size ? 'is-' + o.size : ''],
      role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId, tabindex: '-1',
    },
    mobile ? h('div', { class: 'jay-sheet-grabber', 'aria-hidden': 'true' }) : null,
    h('header', { class: 'jay-panel-head' },
      h('div', { class: 'jay-panel-titles' },
        o.eyebrow ? h('div', { class: 'jay-eyebrow' }, o.eyebrow) : null,
        h('h2', { class: 'jay-panel-title', id: titleId }, o.title || '')),
      h('div', { class: 'jay-panel-head-actions' }, o.headActions || null, closeBtn)),
    body, footer);
    const scrim = h('div', { class: 'jay-scrim', onclick: () => api.close() });
    const wrap = h('div', { class: ['jay-panel-wrap', o.placement === 'center' && !mobile ? 'is-center' : ''] }, scrim, panel);
    overlayHost().appendChild(wrap);
    document.documentElement.classList.add('jay-panel-open');
    requestAnimationFrame(() => wrap.classList.add('is-open'));

    function onKey(e) {
      if (e.key === 'Escape') { e.stopPropagation(); api.close(); return; }
      trapFocus(panel, e);
    }
    panel.addEventListener('keydown', onKey);

    // Swipe-down to dismiss on the mobile sheet grabber/header.
    if (mobile) {
      let startY = null;
      const head = panel.querySelector('.jay-panel-head');
      const grab = panel.querySelector('.jay-sheet-grabber');
      [head, grab].forEach((zone) => {
        if (!zone) return;
        zone.addEventListener('touchstart', (e) => { startY = e.touches[0].clientY; }, { passive: true });
        zone.addEventListener('touchmove', (e) => {
          if (startY === null) return;
          const dy = Math.max(0, e.touches[0].clientY - startY);
          panel.style.transform = 'translateY(' + dy + 'px)';
        }, { passive: true });
        zone.addEventListener('touchend', (e) => {
          const dy = startY === null ? 0 : e.changedTouches[0].clientY - startY;
          startY = null;
          panel.style.transform = '';
          if (dy > 90) api.close();
        });
      });
    }

    const api = {
      el: panel,
      body,
      close(closeOpts) {
        if (!wrap.isConnected) return;
        wrap.classList.remove('is-open');
        panel.removeEventListener('keydown', onKey);
        const done = () => { wrap.remove(); };
        if (mqReducedMotion.matches) done(); else setTimeout(done, 200);
        if (activePanel === api) activePanel = null;
        if (!activePanel) document.documentElement.classList.remove('jay-panel-open');
        if (!(closeOpts && closeOpts.silent)) {
          if (returnFocus && returnFocus.isConnected && typeof returnFocus.focus === 'function') returnFocus.focus();
          if (typeof o.onClose === 'function') o.onClose();
        }
      },
    };
    activePanel = api;
    setTimeout(() => {
      const target = o.initialFocus ? panel.querySelector(o.initialFocus) : null;
      (target || panel).focus({ preventScroll: true });
    }, 30);
    return api;
  }
  function closePanel() { if (activePanel) activePanel.close(); }
  function hasOpenPanel() { return !!activePanel; }

  /* ── Popover menu ───────────────────────────────────────────────────── */
  let activeMenu = null;
  function menu(anchor, items, opts) {
    closeMenu();
    const o = opts || {};
    const list = h('div', { class: 'jay-menu', role: 'menu', 'aria-label': o.label || 'Options' },
      items.filter(Boolean).map((it) => it === '-' ? h('div', { class: 'jay-menu-sep', role: 'separator' }) :
        h('button', {
          type: 'button', role: 'menuitem', class: ['jay-menu-item', it.tone ? 'is-' + it.tone : '', it.active ? 'is-active' : ''],
          onclick: () => { closeMenu(); it.run && it.run(); },
        }, it.icon ? icon(it.icon, 16) : null, h('span', null, it.label), it.hint ? h('span', { class: 'jay-menu-hint' }, it.hint) : null)));
    overlayHost().appendChild(list);
    const r = anchor.getBoundingClientRect();
    const mw = Math.max(200, list.offsetWidth);
    let left = o.align === 'right' ? r.right - mw : r.left;
    left = Math.max(8, Math.min(left, window.innerWidth - mw - 8));
    let top = r.bottom + 6;
    if (top + list.offsetHeight > window.innerHeight - 8) top = Math.max(8, r.top - list.offsetHeight - 6);
    list.style.left = left + 'px';
    list.style.top = top + 'px';
    list.style.minWidth = mw + 'px';
    const first = list.querySelector('.jay-menu-item');
    if (first) first.focus();
    function onDoc(e) { if (!list.contains(e.target) && e.target !== anchor) closeMenu(); }
    function onKey(e) {
      const btns = Array.from(list.querySelectorAll('.jay-menu-item'));
      const i = btns.indexOf(document.activeElement);
      if (e.key === 'Escape') { e.preventDefault(); closeMenu(); anchor.focus(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); (btns[i + 1] || btns[0]).focus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); (btns[i - 1] || btns[btns.length - 1]).focus(); }
      else if (e.key === 'Tab') { closeMenu(); }
    }
    setTimeout(() => document.addEventListener('pointerdown', onDoc, true), 0);
    list.addEventListener('keydown', onKey);
    activeMenu = { el: list, cleanup() { document.removeEventListener('pointerdown', onDoc, true); } };
    return activeMenu;
  }
  function closeMenu() {
    if (!activeMenu) return;
    activeMenu.cleanup();
    activeMenu.el.remove();
    activeMenu = null;
  }

  /* ── Reusable data states ───────────────────────────────────────────── */
  const STATE_DEFAULTS = {
    loading: { icon: null, title: 'Loading…' },
    empty: { icon: 'check', title: 'Nothing here yet.' },
    error: { icon: 'alert-circle', title: 'Couldn’t load this.', text: 'The rest of JAY keeps working.' },
    disconnected: { icon: 'wifi-off', title: 'Disconnected', text: 'JAY will retry automatically.' },
    'not-connected': { icon: 'plug', title: 'Not connected yet' },
  };
  function state(kind, opts) {
    const o = Object.assign({}, STATE_DEFAULTS[kind] || {}, opts || {});
    if (kind === 'loading') {
      const rows = o.rows || 3;
      const sk = h('div', { class: 'jay-skeleton', 'aria-busy': 'true', 'aria-label': o.title });
      for (let i = 0; i < rows; i += 1) sk.appendChild(h('div', { class: 'jay-skeleton-row', style: { width: (92 - (i % 3) * 18) + '%' } }));
      return sk;
    }
    return h('div', { class: ['jay-state', 'is-' + kind, o.compact ? 'is-compact' : ''] },
      o.icon ? h('span', { class: 'jay-state-icon' }, icon(o.icon, 18)) : null,
      h('div', { class: 'jay-state-title' }, o.title),
      o.text ? h('div', { class: 'jay-state-text' }, o.text) : null,
      o.action ? h('button', { type: 'button', class: 'jay-btn is-ghost is-sm', onclick: o.action.run }, o.action.icon ? icon(o.action.icon, 15) : null, o.action.label) : null);
  }

  /* ── Widget: isolates load / empty / error per dashboard block so one
        failing source never takes down the rest of Home. ── */
  function widget(container, cfg) {
    let disposed = false;
    let seq = 0;
    async function refresh(opts) {
      const my = ++seq;
      if (!(opts && opts.quiet) || !container.firstChild) mount(container, state('loading', { rows: cfg.skeletonRows || 3 }));
      try {
        const data = await cfg.load();
        if (disposed || my !== seq) return;
        if (data && data.__state) {
          if (cfg.quietStates) { clear(container); return; }
          mount(container, state(data.__state, cfg.states && cfg.states[data.__state]));
          return;
        }
        const empty = cfg.isEmpty ? cfg.isEmpty(data) : (Array.isArray(data) && data.length === 0);
        if (empty && cfg.empty) { mount(container, state('empty', cfg.empty)); return; }
        mount(container, cfg.render(data));
      } catch (err) {
        if (disposed || my !== seq) return;
        console.warn('[jay] widget failed:', cfg.name || '', err);
        mount(container, state('error', Object.assign({
          action: { label: 'Retry', icon: 'refresh', run: () => refresh() },
        }, cfg.error || {})));
      }
    }
    const offs = (cfg.domains || []).map((d) => on('data:' + d, () => refresh({ quiet: true })));
    refresh();
    return {
      refresh,
      dispose() { disposed = true; offs.forEach((off) => off()); },
    };
  }

  /* ── Shared visual components (v2). Markup is defined here once so every
        screen renders identical structures; styling lives in jay-components.css. ── */
  const HUES = ['blue', 'purple', 'green', 'orange', 'red', 'yellow', 'cyan', 'pink', 'lime', 'neutral'];
  const TAG_HUE = {
    client: 'blue', enterprise: 'blue', work: 'blue',
    proposal: 'purple', voice: 'purple', upsell: 'purple',
    content: 'green', health: 'green', renewal: 'green', personal: 'green',
    design: 'orange', suppliers: 'orange', pilot: 'orange',
    urgent: 'red', blocked: 'red', strategic: 'red',
    finance: 'yellow', bills: 'yellow', business: 'yellow',
    ops: 'cyan', infra: 'cyan',
    research: 'pink',
    errands: 'neutral', admin: 'neutral',
  };
  function hashHue(str, list) {
    let x = 0;
    const s = String(str || '');
    for (let i = 0; i < s.length; i += 1) x = (x * 31 + s.charCodeAt(i)) >>> 0;
    const pool = list || HUES.slice(0, 8);
    return pool[x % pool.length];
  }
  function tagHue(label) { return TAG_HUE[String(label || '').toLowerCase()] || hashHue(label); }

  // Tinted pill (CRM table) or small solid chip (kanban cards).
  function tag(label, opts) {
    const o = opts || {};
    const hue = o.hue || tagHue(label);
    return h('span', { class: ['jay-tag', 'is-' + hue, o.solid ? 'is-solid' : ''] }, label);
  }
  // Up to `max` tags, then a neutral "+N" chip that lists the rest in its title.
  function tags(list, opts) {
    const o = Object.assign({ max: 2 }, opts || {});
    const items = (list || []).filter(Boolean);
    const shown = items.slice(0, o.max).map((t) => (typeof t === 'string' ? tag(t, { solid: o.solid }) : tag(t.label, { hue: t.hue, solid: o.solid })));
    const rest = items.slice(o.max);
    if (rest.length) shown.push(h('span', { class: 'jay-tag is-more', title: rest.map((t) => (typeof t === 'string' ? t : t.label)).join(', ') }, '+' + rest.length));
    return h('span', { class: 'jay-tags' }, shown);
  }

  // Segmented meter: n thin bars ramping red → orange → yellow → green, filled up to pct.
  function meter(pct, opts) {
    const o = Object.assign({ segments: 14, showValue: true }, opts || {});
    const v = Math.max(0, Math.min(100, Math.round(Number(pct) || 0)));
    const on = Math.round((v / 100) * o.segments);
    const bars = h('span', { class: 'jay-meter-bars', 'aria-hidden': 'true' });
    for (let i = 0; i < o.segments; i += 1) {
      const band = 1 + Math.min(3, Math.floor((i / o.segments) * 4));
      bars.appendChild(h('i', { class: i < on ? 'is-on is-b' + band : '' }));
    }
    return h('span', { class: 'jay-meter', role: 'meter', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(v), 'aria-label': (o.label || 'Progress') + ' ' + v + '%' },
      bars, o.showValue ? h('span', { class: 'jay-meter-val' }, v + '%') : null);
  }

  // Mini bar sparkline (activity trend). Values are relative; empty days render as a dot.
  function spark(values, opts) {
    const o = opts || {};
    const vals = (values || []).map((n) => Math.max(0, Number(n) || 0));
    const max = Math.max(1, ...vals);
    return h('span', { class: ['jay-spark', o.hue ? 'is-' + o.hue : ''], role: 'img', 'aria-label': o.label || ('Activity, last ' + vals.length + ' days') },
      vals.map((n) => h('i', { class: n ? '' : 'is-zero', style: { height: (n ? Math.max(18, Math.round((n / max) * 100)) : 12) + '%' } })));
  }

  // Colored initials avatar; Jay gets the lime monogram tile.
  const AVATAR_HUES = ['blue', 'purple', 'green', 'orange', 'pink', 'cyan', 'yellow', 'red'];
  function avatar(name, opts) {
    const o = opts || {};
    const isJay = o.id === 'jay' || name === 'Jay';
    const hue = o.hue || hashHue(o.id || name, AVATAR_HUES);
    return h('span', {
      class: ['jay-av', 'is-' + (o.size || 'sm'), isJay ? 'is-jay' : 'is-' + hue],
      title: o.title === false ? null : name, 'aria-hidden': o.decorative ? 'true' : null,
      role: o.decorative ? null : 'img', 'aria-label': o.decorative ? null : name,
    }, isJay ? 'J' : fmt.initials(name));
  }
  function avatarStack(people, opts) {
    const o = Object.assign({ max: 3, size: 'sm' }, opts || {});
    const list = (people || []).filter(Boolean);
    const extra = list.length - o.max;
    return h('span', { class: 'jay-av-stack', 'aria-label': list.map((p) => p.name).join(', ') },
      list.slice(0, o.max).map((p) => avatar(p.name, { id: p.id, size: o.size, decorative: true })),
      extra > 0 ? h('span', { class: ['jay-av', 'is-' + o.size, 'is-more'], 'aria-hidden': 'true' }, '+' + extra) : null);
  }

  // Count badge: neutral (CRM sidebar "241") or accent (lime "16").
  function badge(n, opts) {
    const o = opts || {};
    if (n === null || n === undefined || n === '') return null;
    return h('span', { class: ['jay-badge', o.accent ? 'is-accent' : '', o.tone ? 'is-' + o.tone : ''] }, String(n));
  }
  // "● Active" status pill.
  function dotPill(label, hue) { return h('span', { class: ['jay-dotpill', 'is-' + (hue || 'green')] }, h('i', { 'aria-hidden': 'true' }), label); }

  // Underline tabs with optional badges. items: [{ id, label, badge, disabled }]
  function tabs(items, opts) {
    const o = opts || {};
    const wrap = h('div', { class: ['jay-tabs', o.variant ? 'is-' + o.variant : ''], role: 'tablist', 'aria-label': o.label || 'Views' });
    function sync(active) {
      wrap.querySelectorAll('.jay-tab').forEach((b) => {
        const on = b.dataset.tab === active;
        b.classList.toggle('is-active', on);
        b.setAttribute('aria-selected', on ? 'true' : 'false');
        b.tabIndex = on ? 0 : -1;
      });
    }
    items.forEach((it) => wrap.appendChild(h('button', {
      type: 'button', role: 'tab', class: 'jay-tab', 'data-tab': it.id, disabled: it.disabled || null,
      onclick: () => { sync(it.id); if (o.onSelect) o.onSelect(it.id); },
    }, it.icon ? icon(it.icon, 15) : null, h('span', null, it.label), it.badge !== undefined && it.badge !== null ? badge(it.badge, { accent: it.badgeAccent !== false }) : null)));
    wrap.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const btns = Array.from(wrap.querySelectorAll('.jay-tab:not([disabled])'));
      const i = btns.indexOf(document.activeElement);
      const next = btns[(i + (e.key === 'ArrowRight' ? 1 : -1) + btns.length) % btns.length];
      if (next) { e.preventDefault(); next.focus(); next.click(); }
    });
    sync(o.active || (items[0] && items[0].id));
    wrap.sync = sync;
    return wrap;
  }

  // Filter pill: "Sort by  Due date ⌄" (key muted, value strong).
  function fpill(cfg) {
    const btn = h('button', { type: 'button', class: ['jay-fpill', cfg.active ? 'is-active' : ''], 'aria-haspopup': cfg.onClick ? 'menu' : null, onclick: (e) => cfg.onClick && cfg.onClick(e.currentTarget) },
      cfg.icon ? icon(cfg.icon, 14) : null,
      cfg.key ? h('span', { class: 'jay-fpill-k' }, cfg.key) : null,
      h('span', { class: 'jay-fpill-v' }, cfg.value),
      icon('chevron-down', 14, 'jay-fpill-chev'));
    btn.setValue = (v, active) => { btn.querySelector('.jay-fpill-v').textContent = v; btn.classList.toggle('is-active', !!active); };
    return btn;
  }

  // Short file-type label for the attachment badge ("PDF", "XLS", …).
  const FILE_BADGE = { sheet: 'XLS', xlsx: 'XLS', docx: 'DOC', image: 'IMG', jpeg: 'JPG', file: 'FILE' };
  function fileBadgeLabel(att) {
    if (att.badge) return String(att.badge).slice(0, 4).toUpperCase();
    const kind = String(att.kind || 'file').toLowerCase();
    return FILE_BADGE[kind] || kind.slice(0, 3).toUpperCase();
  }

  // Activity feed item (Deepsleep-style). cfg: { who: {id,name} | null, icon, hue, verb, target, onTarget,
  //   context: [..], time, attachment: {name, kind, meta}, quote, actions: [{label, primary, icon, run}], unread, level }
  function feedItem(cfg) {
    const lead = cfg.who ? avatar(cfg.who.name, { id: cfg.who.id, size: 'md', decorative: true })
      : h('span', { class: ['jay-feed-icon', 'is-' + (cfg.hue || 'neutral')], 'aria-hidden': 'true' }, icon(cfg.icon || 'bell', 16));
    const title = h('div', { class: 'jay-feed-line' },
      cfg.who ? h('strong', null, cfg.who.name + ' ') : null,
      cfg.verb ? h('span', null, cfg.verb + ' ') : null);
    const target = cfg.target ? (cfg.onTarget
      ? h('button', { type: 'button', class: 'jay-feed-target', onclick: cfg.onTarget }, cfg.target)
      : h('span', { class: 'jay-feed-target' }, cfg.target)) : null;
    const att = cfg.attachment ? h('div', { class: 'jay-feed-att' },
      h('span', { class: ['jay-file-badge', 'is-' + (cfg.attachment.kind || 'file')], 'aria-hidden': 'true' }, fileBadgeLabel(cfg.attachment)),
      h('span', { class: 'jay-feed-att-main' }, h('span', { class: 'jay-feed-att-name' }, cfg.attachment.name), cfg.attachment.meta ? h('span', { class: 'jay-feed-att-meta' }, cfg.attachment.meta) : null)) : null;
    const quote = cfg.quote ? h('div', { class: 'jay-feed-quote' }, cfg.quote) : null;
    const actions = cfg.actions && cfg.actions.length ? h('div', { class: 'jay-feed-actions' }, cfg.actions.map((a) => h('button', {
      type: 'button', class: ['jay-btn', 'is-sm', a.primary ? 'is-primary' : 'is-outline'], onclick: (e) => a.run(e.currentTarget), 'aria-label': a.aria || null,
    }, a.icon ? icon(a.icon, 14) : null, a.label))) : null;
    return h('article', { class: ['jay-feed-item', cfg.unread ? 'is-unread' : '', cfg.level ? 'is-' + cfg.level : ''] },
      lead,
      h('div', { class: 'jay-feed-body' },
        h('div', { class: 'jay-feed-top' }, title, cfg.time ? h('span', { class: 'jay-feed-time' }, cfg.time) : null),
        target,
        cfg.context && cfg.context.length ? h('div', { class: 'jay-feed-ctx' }, cfg.context.map((c, i) => [i ? h('span', { class: 'jay-sep', 'aria-hidden': 'true' }, '|') : null, h('span', null, c)])) : null,
        att, quote, actions));
  }

  // Contextual tree navigation panel (Deepsleep-style second column).
  // cfg: { label, search: {placeholder, onInput}, sections: [{ id, title, open, collapsible,
  //        items: [{ id, label, icon, dot (hue), count, countAccent, active, depth, run }] }], footer: {label, icon, run} }
  function sideNav(cfg) {
    const aside = h('aside', { class: 'jay-box jay-side', 'aria-label': cfg.label || 'Navigation' });
    if (cfg.search) {
      const id = nextId('side-search');
      const input = h('input', { id, class: 'jay-input is-search is-inset', type: 'search', placeholder: cfg.search.placeholder || 'Search', autocomplete: 'off', 'aria-label': cfg.search.placeholder || 'Search' });
      if (cfg.search.onInput) input.addEventListener('input', () => cfg.search.onInput(input.value));
      aside.appendChild(h('div', { class: 'jay-side-search jay-search' }, icon('search', 15), input));
    }
    const scroll = h('nav', { class: 'jay-side-scroll' });
    (cfg.sections || []).forEach((sec) => {
      const listId = nextId('side-list');
      const list = h('ul', { class: 'jay-side-list', id: listId }, (sec.items || []).map((it) => h('li', null, h('button', {
        type: 'button', class: ['jay-side-item', it.active ? 'is-active' : '', it.depth ? 'is-depth-' + it.depth : ''],
        'aria-current': it.active ? 'true' : null, 'data-side': it.id || null, onclick: it.run,
      },
      it.dot ? h('span', { class: ['jay-side-dot', 'is-' + it.dot, it.hollow ? 'is-hollow' : ''], 'aria-hidden': 'true' }) : (it.icon ? icon(it.icon, 16, 'jay-side-icon') : null),
      h('span', { class: 'jay-side-label' }, it.label),
      it.count !== undefined && it.count !== null && it.count !== '' ? badge(it.count, { accent: !!it.countAccent }) : null))));
      const open = sec.open !== false;
      if (!open) list.hidden = true;
      const head = sec.title ? (sec.collapsible === false
        ? h('div', { class: 'jay-side-title' }, sec.title)
        : h('button', {
          type: 'button', class: 'jay-side-head', 'aria-expanded': open ? 'true' : 'false', 'aria-controls': listId,
          onclick: (e) => { const b = e.currentTarget; const now = b.getAttribute('aria-expanded') !== 'true'; b.setAttribute('aria-expanded', now ? 'true' : 'false'); list.hidden = !now; },
        }, icon('chevron-down', 14, 'jay-side-chev'), h('span', null, sec.title))) : null;
      scroll.appendChild(h('div', { class: 'jay-side-section' }, head, list));
    });
    aside.appendChild(scroll);
    if (cfg.footer) {
      aside.appendChild(h('div', { class: 'jay-side-foot' }, h('button', { type: 'button', class: 'jay-btn is-inset is-block', onclick: cfg.footer.run }, icon(cfg.footer.icon || 'plus', 15), cfg.footer.label)));
    }
    return aside;
  }

  // Floating panel wrapper.
  function box(attrs, ...children) {
    const a = Object.assign({}, attrs || {});
    a.class = ['jay-box'].concat(a.class || []);
    return h('section', a, ...children);
  }

  Object.assign(JAY, {
    h, mount, clear, append, icon, ICONS, on, emit, storage, fmt, isMobile, mqMobile, mqReducedMotion, nextId,
    ui: {
      toast, openPanel, closePanel, hasOpenPanel, menu, closeMenu, state, trapFocus,
      tag, tags, tagHue, hashHue, meter, spark, avatar, avatarStack, badge, dotPill, tabs, fpill, feedItem, sideNav, box,
    },
    widget,
  });
})();
