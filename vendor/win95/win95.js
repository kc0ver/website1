/*! win95.js v0.1.0 | MIT License */
/*
 * win95.js — window manager for win95.css. No dependencies.
 *
 * Markup contract:
 *   <section class="w95-window" id="readme" data-icon="notepad" data-w="480" data-h="360" hidden>…</section>
 *   [data-open="readme"]     opens/focuses that window (desktop icons: double-click; touch: tap)
 *   [data-action="close|minimize|maximize"] inside a window
 *   [data-action="shutdown"] shows the "safe to turn off" screen
 *   [data-modal] on a window blocks the desktop until it closes
 *   [data-contextmenu="menu-id"] opens that .w95-menu on right-click, long-press or Shift+F10
 *   .w95-menubar > li > button[aria-controls]   drop-down menus
 *   button[aria-haspopup="menu"][aria-controls] inside a menu   cascading submenu
 *   [role="tablist"] > [role="tab"][aria-controls] tabs
 *   .w95-clock               taskbar clock
 *   #readme in the URL opens that window on load.
 */
(() => {
  const PHONE = matchMedia('(max-width: 640px)');
  const COARSE = matchMedia('(pointer: coarse)');
  const SCHEMES = ['standard', 'desert', 'rainy-day', 'eggplant', 'high-contrast'];
  let desktop, tasks, startBtn, startMenu;
  let z = 10;
  let cascade = 0;
  const modals = [];

  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
  const winOf = (el) => el.closest('.w95-window');
  const FOCUSABLE = 'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';
  const visibleIn = (el) => $$(FOCUSABLE, el).filter((f) => f.offsetParent !== null);

  /* ---------- Windows ---------- */

  function place(win) {
    const W = desktop.clientWidth;
    const H = desktop.clientHeight;
    const w = Math.min(+win.dataset.w || 420, W - 8);
    win.style.width = w + 'px';
    const auto = win.dataset.h === 'auto';
    const h = Math.min(auto ? win.offsetHeight : +win.dataset.h || 300, H - 8);
    if (!auto || win.offsetHeight > H - 8) win.style.height = h + 'px';
    let x, y;
    if (win.hasAttribute('data-center') || win.hasAttribute('data-modal')) {
      x = (W - w) / 2;
      y = Math.max(4, (H - h) / 2.6);
    } else {
      x = 96 + (cascade % 8) * 24;
      y = 16 + (cascade % 8) * 24;
      cascade++;
    }
    win.style.left = Math.max(0, Math.min(x, W - w)) + 'px';
    win.style.top = Math.max(0, Math.min(y, H - h)) + 'px';
    win.dataset.placed = '';
  }

  function open(id) {
    const win = typeof id === 'string' ? document.getElementById(id) : id;
    if (!win || !win.classList.contains('w95-window')) return;
    const top = topModal();
    if (top && top !== win && !win.hasAttribute('data-modal')) return flash(top);
    closeMenus();
    const wasHidden = win.hidden;
    win.hidden = false;
    if (!('placed' in win.dataset)) place(win);
    delete win.dataset.minimized;
    ensureTask(win);
    if (win.hasAttribute('data-modal') && wasHidden) openModal(win);
    focus(win);
    if (win.hasAttribute('data-modal')) (win.querySelector('.is-default') || visibleIn(win)[0])?.focus();
    win.dispatchEvent(new CustomEvent('w95:open', { bubbles: true }));
  }

  function close(win) {
    if (!win || win.hidden) return;
    win.hidden = true;
    delete win.dataset.minimized;
    taskFor(win)?.remove();
    closeModal(win);
    win.dispatchEvent(new CustomEvent('w95:close', { bubbles: true }));
    focusTop();
  }

  function minimize(win) {
    if (win.hasAttribute('data-modal')) return flash(win);
    win.hidden = true;
    win.dataset.minimized = '';
    focusTop();
  }

  function toggleMax(win) {
    win.classList.toggle('is-maximized');
    const btn = $('[data-action="maximize"]', win);
    if (btn) btn.setAttribute('aria-label', win.classList.contains('is-maximized') ? 'Restore' : 'Maximize');
  }

  function focus(win) {
    win.style.zIndex = ++z;
    $$('.w95-desktop > .w95-window').forEach((w) => w.classList.toggle('is-inactive', w !== win));
    $$('button', tasks).forEach((b) => b.classList.toggle('is-active', b.dataset.for === win.id));
  }

  function focusTop() {
    const visible = $$('.w95-desktop > .w95-window:not([hidden])').sort((a, b) => b.style.zIndex - a.style.zIndex);
    if (visible[0]) focus(visible[0]);
    else $$('button', tasks).forEach((b) => b.classList.remove('is-active'));
  }

  /* ---------- Modal dialogs ---------- */

  const topModal = () => modals[modals.length - 1]?.win;

  function openModal(win) {
    const backdrop = document.createElement('div');
    backdrop.className = 'w95-modal-backdrop';
    backdrop.style.zIndex = ++z;
    backdrop.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      flash(win);
    });
    desktop.append(backdrop);
    modals.push({ win, backdrop, returnTo: document.activeElement });
  }

  function closeModal(win) {
    const i = modals.findIndex((m) => m.win === win);
    if (i < 0) return;
    const [m] = modals.splice(i, 1);
    m.backdrop.remove();
    if (m.returnTo && document.contains(m.returnTo)) m.returnTo.focus({ preventScroll: true });
  }

  // Clicking outside a modal dialog flashes its title bar, the way Windows refuses.
  function flash(win) {
    win.classList.remove('is-flashing');
    void win.offsetWidth;
    win.classList.add('is-flashing');
    setTimeout(() => win.classList.remove('is-flashing'), 600);
    (win.querySelector('.is-default') || visibleIn(win)[0])?.focus();
  }

  /* ---------- Taskbar ---------- */

  const taskFor = (win) => $(`button[data-for="${win.id}"]`, tasks);

  function ensureTask(win) {
    if (taskFor(win)) return;
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.for = win.id;
    const title = $('.w95-title', win)?.textContent.trim() || win.id;
    b.title = title;
    b.innerHTML = `<span class="w95-ico-${win.dataset.icon || 'folder'}"></span><span></span>`;
    b.lastChild.textContent = title;
    b.addEventListener('click', () => {
      const modal = topModal();
      if (modal && modal !== win) return flash(modal);
      const active = b.classList.contains('is-active') && !win.hidden;
      if (active) minimize(win);
      else open(win.id);
    });
    tasks.append(b);
  }

  /* ---------- Drag & resize ---------- */

  function drag(e) {
    const bar = e.target.closest('.w95-titlebar');
    if (!bar || e.target.closest('button') || e.button !== 0) return;
    const win = winOf(bar);
    if (!win || PHONE.matches || win.classList.contains('is-maximized')) return;
    const sx = e.clientX, sy = e.clientY;
    const ox = win.offsetLeft, oy = win.offsetTop;
    const W = desktop.clientWidth, H = desktop.clientHeight;
    bar.setPointerCapture(e.pointerId);
    const move = (ev) => {
      // Keep at least 40px of title bar on screen, like the real thing.
      const x = Math.max(40 - win.offsetWidth, Math.min(ox + ev.clientX - sx, W - 40));
      const y = Math.max(0, Math.min(oy + ev.clientY - sy, H - 20));
      win.style.left = x + 'px';
      win.style.top = y + 'px';
    };
    const up = () => {
      bar.removeEventListener('pointermove', move);
      bar.removeEventListener('pointerup', up);
      bar.removeEventListener('pointercancel', up);
    };
    bar.addEventListener('pointermove', move);
    bar.addEventListener('pointerup', up);
    bar.addEventListener('pointercancel', up);
  }

  function resize(e) {
    const grip = e.target.closest('.w95-grip');
    if (!grip || e.button !== 0) return;
    const win = winOf(grip);
    if (win.classList.contains('is-maximized')) return;
    e.preventDefault();
    const sx = e.clientX, sy = e.clientY;
    const ow = win.offsetWidth, oh = win.offsetHeight;
    const minW = +win.dataset.minW || 220, minH = +win.dataset.minH || 140;
    grip.setPointerCapture(e.pointerId);
    const move = (ev) => {
      win.style.width = Math.max(minW, Math.min(ow + ev.clientX - sx, desktop.clientWidth - win.offsetLeft)) + 'px';
      win.style.height = Math.max(minH, Math.min(oh + ev.clientY - sy, desktop.clientHeight - win.offsetTop)) + 'px';
    };
    const up = () => grip.removeEventListener('pointermove', move);
    grip.addEventListener('pointermove', move);
    grip.addEventListener('pointerup', up, { once: true });
  }

  /* ---------- Menus ---------- */

  const subOf = (btn) => document.getElementById(btn.getAttribute('aria-controls'));

  function collapse(btn) {
    if (btn.getAttribute('aria-expanded') !== 'true') return;
    btn.setAttribute('aria-expanded', 'false');
    const menu = subOf(btn);
    if (!menu) return;
    $$('[aria-haspopup="menu"][aria-expanded="true"]', menu).forEach(collapse);
    menu.hidden = true;
  }

  function closeMenus(except) {
    $$('.w95-menubar > li > button[aria-expanded="true"]').forEach((b) => b !== except && collapse(b));
    $$('.w95-menu [aria-haspopup="menu"][aria-expanded="true"], .w95-startmenu [aria-haspopup="menu"][aria-expanded="true"]').forEach((b) => {
      if (!except || !subOf(b)?.contains(except)) collapse(b);
    });
    $$('.w95-menu.is-context:not([hidden])').forEach((m) => (m.hidden = true));
    if (except !== startBtn && startBtn?.getAttribute('aria-expanded') === 'true') {
      startBtn.setAttribute('aria-expanded', 'false');
      startMenu.hidden = true;
    }
  }

  function toggleMenu(btn, force) {
    const menu = subOf(btn);
    const show = force ?? btn.getAttribute('aria-expanded') !== 'true';
    closeMenus(btn);
    btn.setAttribute('aria-expanded', String(show));
    menu.hidden = !show;
    if (show && btn !== startBtn) firstItem(menu)?.focus({ preventScroll: true });
  }

  const itemsOf = (list) => $$(':scope > li > :is(button:not(:disabled), a)', list);
  const firstItem = (list) => itemsOf(list)[0];

  function openSub(btn, focusFirst) {
    const list = btn.closest('ul');
    $$(':scope > li > [aria-haspopup="menu"][aria-expanded="true"]', list).forEach((b) => b !== btn && collapse(b));
    const menu = subOf(btn);
    if (!menu) return;
    btn.setAttribute('aria-expanded', 'true');
    menu.hidden = false;
    // Flip to the left if the submenu would run off the screen.
    menu.style.left = menu.style.right = '';
    if (menu.getBoundingClientRect().right > innerWidth) {
      menu.style.left = 'auto';
      menu.style.right = 'calc(100% - 3px)';
    }
    if (focusFirst) firstItem(menu)?.focus({ preventScroll: true });
  }

  /* ---------- Right-click menus ---------- */

  function openContext(menu, x, y, target) {
    if (typeof menu === 'string') menu = document.getElementById(menu);
    if (!menu) return;
    if (topModal() && !(target && winOf(target) === topModal())) return flash(topModal());
    closeMenus();
    const host = target?.closest('.w95') || $('.w95') || document.body;
    if (menu.parentElement !== host) host.append(menu);
    menu.classList.add('is-context');
    menu.hidden = false;
    menu.style.left = Math.max(0, Math.min(x, innerWidth - menu.offsetWidth - 2)) + 'px';
    menu.style.top = Math.max(0, Math.min(y, innerHeight - menu.offsetHeight - 2)) + 'px';
    menu.dispatchEvent(new CustomEvent('w95:contextmenu', { bubbles: true, detail: { target } }));
    firstItem(menu)?.focus({ preventScroll: true });
  }

  let pressTimer = null;
  let suppressClick = false;

  /* ---------- Tabs ---------- */

  function selectTab(tab) {
    const list = tab.closest('[role="tablist"]');
    $$('[role="tab"]', list).forEach((t) => {
      const on = t === tab;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      document.getElementById(t.getAttribute('aria-controls')).hidden = !on;
    });
  }

  /* ---------- Desktop icons ---------- */

  function selectIcon(icon) {
    const scope = icon?.parentElement || document;
    $$('.w95-desk-icon', scope).forEach((i) => i.setAttribute('aria-selected', String(i === icon)));
    if (!icon) $$('.w95-desk-icon').forEach((i) => i.setAttribute('aria-selected', 'false'));
  }

  /* ---------- Colour schemes ---------- */

  function scheme(name) {
    const root = document.documentElement;
    if (name === undefined) return root.dataset.scheme || 'standard';
    if (!name || name === 'standard') delete root.dataset.scheme;
    else root.dataset.scheme = name;
    document.dispatchEvent(new CustomEvent('w95:scheme', { detail: { scheme: name || 'standard' } }));
    return name || 'standard';
  }

  /* ---------- Clock ---------- */

  function tick() {
    const now = new Date();
    $$('.w95-clock').forEach((c) => {
      c.textContent = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      c.dataset.tip = now.toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    });
  }

  /* ---------- Shut down ---------- */

  function shutdown() {
    closeMenus();
    const s = document.createElement('div');
    s.className = 'w95-safe';
    s.tabIndex = 0;
    s.setAttribute('role', 'button');
    s.innerHTML = "<p>It's now safe to turn off<br>your computer.<small>Click anywhere to start again.</small></p>";
    const restart = () => s.remove();
    s.addEventListener('click', restart);
    s.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && restart());
    ($('.w95') || document.body).append(s);
    s.focus();
  }

  /* ---------- Wiring ---------- */

  function init() {
    desktop = $('.w95-desktop');
    tasks = $('.w95-tasks');
    startBtn = $('.w95-start');
    startMenu = startBtn && subOf(startBtn);
    if (!desktop || !tasks) return;

    document.addEventListener('pointerdown', (e) => {
      const win = e.target.closest('.w95-desktop > .w95-window');
      if (win) focus(win);
      if (!e.target.closest('.w95-menu, .w95-menubar, .w95-startmenu, .w95-start')) closeMenus();
      if (!e.target.closest('.w95-desk-icon') && e.target.closest('.w95-desktop') && !win) selectIcon(null);
      drag(e);
      resize(e);

      // Long-press opens the right-click menu on touch screens.
      const ctx = e.pointerType === 'touch' && e.target.closest('[data-contextmenu]');
      if (ctx) {
        const sx = e.clientX, sy = e.clientY;
        clearTimeout(pressTimer);
        pressTimer = setTimeout(() => {
          suppressClick = true;
          const icon = e.target.closest('.w95-desk-icon');
          if (icon) selectIcon(icon);
          openContext(ctx.dataset.contextmenu, sx, sy, e.target);
        }, 550);
        const cancel = (ev) => {
          if (ev.type === 'pointermove' && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 8) return;
          clearTimeout(pressTimer);
          removeEventListener('pointermove', cancel);
          removeEventListener('pointerup', cancel);
          removeEventListener('pointercancel', cancel);
        };
        addEventListener('pointermove', cancel);
        addEventListener('pointerup', cancel);
        addEventListener('pointercancel', cancel);
      }
    });

    document.addEventListener('contextmenu', (e) => {
      const ctx = e.target.closest('[data-contextmenu]');
      if (!ctx) return;
      e.preventDefault();
      if (suppressClick) return;
      const icon = e.target.closest('.w95-desk-icon');
      if (icon) selectIcon(icon);
      openContext(ctx.dataset.contextmenu, e.clientX, e.clientY, e.target);
    });

    // The finger lifting after a long-press must not also click what is under it.
    document.addEventListener('click', (e) => {
      if (!suppressClick) return;
      suppressClick = false;
      if (!e.target.closest('.w95-menu.is-context')) {
        e.stopPropagation();
        e.preventDefault();
      }
    }, true);

    document.addEventListener('click', (e) => {
      const t = e.target;

      const icon = t.closest('.w95-desk-icon');
      if (icon) {
        selectIcon(icon);
        // Touch screens open on one tap. Mice keep the double-click.
        if (COARSE.matches || e.detail === 0) open(icon.dataset.open);
        return;
      }

      const sub = t.closest('.w95-menu [aria-haspopup="menu"][aria-controls], .w95-startmenu [aria-haspopup="menu"][aria-controls]');
      if (sub) {
        if (sub.getAttribute('aria-expanded') === 'true' && e.detail !== 0) collapse(sub);
        else openSub(sub, e.detail === 0);
        return;
      }

      const action = t.closest('[data-action]');
      if (action) {
        const win = winOf(action);
        const a = action.dataset.action;
        if (a === 'close' && win) close(win);
        else if (a === 'minimize' && win) minimize(win);
        else if (a === 'maximize' && win) toggleMax(win);
        else if (a === 'shutdown') shutdown();
      }

      const opener = t.closest('[data-open]');
      if (opener) {
        e.preventDefault();
        open(opener.dataset.open);
      }

      // Choosing any item closes the menus, as in Windows.
      const item = t.closest('.w95-menu :is(button, a), .w95-startmenu > ul > li > :is(button, a)');
      if (item && !item.disabled) closeMenus();

      const menuBtn = t.closest('.w95-menubar > li > button[aria-controls]');
      if (menuBtn) toggleMenu(menuBtn);
      if (startBtn && t.closest('.w95-start')) toggleMenu(startBtn);

      const tab = t.closest('[role="tab"]');
      if (tab) selectTab(tab);
    });

    document.addEventListener('dblclick', (e) => {
      const icon = e.target.closest('.w95-desk-icon');
      if (icon) open(icon.dataset.open);
      const bar = e.target.closest('.w95-titlebar');
      if (bar && !e.target.closest('button') && !PHONE.matches) {
        const win = winOf(bar);
        if ($('[data-action="maximize"]', win)) toggleMax(win);
      }
    });

    document.addEventListener('pointerover', (e) => {
      // Moving across an open menu bar switches menus, as in Windows.
      const btn = e.target.closest('.w95-menubar > li > button[aria-controls]');
      if (btn && btn.getAttribute('aria-expanded') !== 'true' && $('[aria-expanded="true"]', btn.closest('.w95-menubar'))) {
        toggleMenu(btn, true);
        return;
      }
      // Hovering an item opens its submenu and closes its siblings'.
      if (e.pointerType === 'touch') return;
      const li = e.target.closest('.w95-menu > li, .w95-startmenu > ul > li');
      if (!li) return;
      const own = li.querySelector(':scope > [aria-haspopup="menu"]');
      $$(':scope > li > [aria-haspopup="menu"][aria-expanded="true"]', li.parentElement).forEach((b) => b !== own && collapse(b));
      if (own) openSub(own);
    });

    document.addEventListener('keydown', (e) => {
      const modal = topModal();
      if (e.key === 'Escape') {
        const wasOpen = $('.w95-menubar [aria-expanded="true"], .w95-menu.is-context:not([hidden])') || startBtn?.getAttribute('aria-expanded') === 'true';
        closeMenus();
        if (wasOpen) return;
        if (modal) return close(modal);
      }
      // Keep Tab inside an open modal dialog.
      if (e.key === 'Tab' && modal) {
        const f = visibleIn(modal);
        if (!f.length) return;
        const i = f.indexOf(document.activeElement);
        if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && (i === f.length - 1 || i < 0)) { e.preventDefault(); f[0].focus(); }
        return;
      }
      if (e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) {
        const ctx = document.activeElement?.closest?.('[data-contextmenu]');
        if (ctx) {
          e.preventDefault();
          const r = document.activeElement.getBoundingClientRect();
          openContext(ctx.dataset.contextmenu, r.left + 8, r.top + r.height / 2, document.activeElement);
          return;
        }
      }
      const icon = e.target.closest?.('.w95-desk-icon');
      if (icon && e.key === 'Enter') {
        e.preventDefault();
        open(icon.dataset.open);
      }
      const tab = e.target.closest?.('[role="tab"]');
      if (tab && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
        const all = $$('[role="tab"]', tab.closest('[role="tablist"]'));
        const next = all[(all.indexOf(tab) + (e.key === 'ArrowRight' ? 1 : all.length - 1)) % all.length];
        selectTab(next);
        next.focus();
      }
      const list = e.target.closest?.('ul.w95-menu, .w95-startmenu > ul');
      if (list) {
        const items = itemsOf(list);
        const i = items.indexOf(document.activeElement);
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus();
        } else if (e.key === 'ArrowRight' && document.activeElement?.matches('[aria-haspopup="menu"]')) {
          e.preventDefault();
          openSub(document.activeElement, true);
        } else if (e.key === 'ArrowLeft') {
          const parent = list.closest('li')?.querySelector(':scope > [aria-haspopup="menu"]');
          if (parent) {
            e.preventDefault();
            collapse(parent);
            parent.focus();
          }
        }
      }
    });

    // Windows opened at load time get their taskbar buttons.
    $$('.w95-desktop > .w95-window:not([hidden])').forEach((w) => {
      if (!('placed' in w.dataset)) place(w);
      ensureTask(w);
      if (w.hasAttribute('data-modal')) openModal(w);
      focus(w);
    });

    const fromHash = () => {
      const id = location.hash.slice(1);
      if (id && /^[\w.~-]+$/.test(id)) open(id);
    };
    fromHash();
    addEventListener('hashchange', fromHash);

    // Pull windows back inside the desktop when the viewport shrinks.
    addEventListener('resize', () => {
      const W = desktop.clientWidth, H = desktop.clientHeight;
      $$('.w95-desktop > .w95-window[data-placed]').forEach((w) => {
        if (w.offsetLeft > W - 40) w.style.left = Math.max(0, W - w.offsetWidth) + 'px';
        if (w.offsetTop > H - 20) w.style.top = Math.max(0, H - w.offsetHeight) + 'px';
      });
    });

    tick();
    setInterval(tick, 15000);
  }

  window.W95 = {
    open,
    close: (id) => close(typeof id === 'string' ? document.getElementById(id) : id),
    focus: (id) => focus(typeof id === 'string' ? document.getElementById(id) : id),
    shutdown,
    scheme,
    schemes: SCHEMES,
    contextMenu: (menu, x, y) => openContext(menu, x, y),
    closeMenus: () => closeMenus(),
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
