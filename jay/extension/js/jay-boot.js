/* JAY customization — boot.
   Runs after Hermes' own deferred scripts (extension scripts are injected
   last), so Hermes globals exist. If JAY fails to start, it removes itself and
   leaves stock Hermes fully usable. */
(function () {
  'use strict';
  function boot() {
    const JAY = window.JAY;
    try {
      if (!JAY || !JAY.shell || !JAY.data) throw new Error('JAY modules missing');
      JAY.shell.start();
    } catch (err) {
      console.error('[jay] failed to start; falling back to Hermes', err);
      // Detach whatever start() already attached (listeners, timers,
      // observers, injected Hermes buttons) before removing JAY's DOM.
      try {
        if (JAY && JAY.shell && typeof JAY.shell.stop === 'function') JAY.shell.stop();
      } catch (stopErr) {
        console.warn('[jay] shell stop failed', stopErr);
      }
      const app = document.getElementById('jayApp');
      if (app) app.remove();
      document.documentElement.classList.remove('jay-enabled');
      delete document.documentElement.dataset.jayMode;
      delete document.documentElement.dataset.jayRoute;
      document.querySelectorAll('.app-titlebar, .layout').forEach((el) => { el.inert = false; });
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
