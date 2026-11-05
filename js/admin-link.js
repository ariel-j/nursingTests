// The side "ניהול" tab. It is only a link to admin/ and grants nothing (the GitHub token is the real
// gate). It appears only in a browser where the admin was unlocked before, so visitors never see it.
// Loaded through a11y.js, which every page imports.
import { load } from './storage.js';

export const ADMIN_SEEN_KEY = 'admin-seen';

function build() {
  if (load(ADMIN_SEEN_KEY) !== true) return;
  if (new URL('../admin/', import.meta.url).pathname === location.pathname) return;
  const link = document.createElement('a');
  link.className = 'admin-tab';
  link.href = new URL('../admin/', import.meta.url).href;
  const label = document.createElement('span');
  label.textContent = 'ניהול';
  link.append(label);
  link.setAttribute('aria-label', 'פאנל ניהול האתר');
  document.body.append(link);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build, { once: true });
else build();
