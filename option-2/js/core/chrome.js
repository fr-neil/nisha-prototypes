/* Prototype 24 · chrome behaviour (P28 §2.1, P29 §1.4). CORE-owned.
 *  - aria-current on nav links (body[data-page]; the assembly also bakes it into the HTML)
 *  - mobile menu: a full-screen light panel in a native modal <dialog> (focus stays inside; Esc closes)
 *  - dock (≤ 760 px): shown (instantly, never animated) whenever no [data-dock-sentinel] is FULLY in the viewport,
 *    and hidden while the footer CTAs ([data-footer-cta]) are visible, a form field has focus, or a phone story
 *    stage is stuck (html.story-stuck; the story component dispatches "p24:dock" when that changes)
 *  - "Replay opening" in the prototype line (Home): a reload from the top, which plays M1 (a direct load)
 *  - ?qa=1: a small QA overlay with the view-transition log (P29 M6 verification)
 * M6 itself is CSS (transitions.css) plus js/core/transitions.js. */
(function (w, d) {
  'use strict';
  var h = d.documentElement;
  var body = d.body;
  var hasIO = 'IntersectionObserver' in w;
  function each(sel, fn) { Array.prototype.forEach.call(d.querySelectorAll(sel), fn); }

  /* ---- current page ---- */
  var page = body.getAttribute('data-page');
  each('[data-nav]', function (a) {
    if (page && a.getAttribute('data-nav') === page) a.setAttribute('aria-current', 'page');
  });

  /* ---- mobile menu ---- */
  var menuBtn = d.querySelector('[data-menu-open]');
  var menu = d.getElementById('p24-menu');
  if (menuBtn && menu && typeof menu.showModal === 'function') {
    var closeBtn = menu.querySelector('[data-menu-close]');
    var setOpen = function (open) {
      if (open && !menu.open) menu.showModal();
      if (!open && menu.open) menu.close();
      menuBtn.setAttribute('aria-expanded', String(open));
    };
    menuBtn.addEventListener('click', function () { setOpen(true); });
    if (closeBtn) closeBtn.addEventListener('click', function () { setOpen(false); });
    menu.addEventListener('close', function () {
      menuBtn.setAttribute('aria-expanded', 'false');
      menuBtn.focus({ preventScroll: true });
    });
    menu.addEventListener('click', function (e) {
      var a = e.target.closest('a');
      if (a && a.getAttribute('href').charAt(0) === '#') setOpen(false);
    });
    /* Back / Forward restores this page from the bfcache as it was left: never with the menu still open (QA nav2,
     * nav3). The menu is closed when the page is hidden (after the old-page snapshot, so the transition still
     * starts from the open menu) and again, as a safety net, when a cached page is shown; focus returns to Menu. */
    var closedOnHide = false;
    var reset = function () {
      menuBtn.setAttribute('aria-expanded', 'false');
      menuBtn.textContent = 'Menu';
      if (menu.open) menu.close();
    };
    w.addEventListener('pagehide', function () { if (menu.open) { closedOnHide = true; reset(); } });
    w.addEventListener('pageshow', function (e) {
      if (!e.persisted) return;
      var was = closedOnHide || menu.open;
      closedOnHide = false;
      reset();
      if (was) menuBtn.focus({ preventScroll: true });
    });
    var mqWide = w.matchMedia('(min-width: 761px)');
    var onWide = function () { if (mqWide.matches) setOpen(false); };
    if (mqWide.addEventListener) mqWide.addEventListener('change', onWide);
  } else if (menuBtn) {
    /* No <dialog> support: the button jumps to the footer page list. */
    menuBtn.addEventListener('click', function () { var f = d.getElementById('p24-footer-pages'); if (f) f.scrollIntoView(); });
  }

  /* ---- dock ---- */
  var dock = d.querySelector('[data-dock]');
  if (dock && !body.hasAttribute('data-no-dock')) {
    var sentinels = d.querySelectorAll('[data-dock-sentinel]');
    var footerCta = d.querySelector('[data-footer-cta]');
    var state = { sentinel: sentinels.length > 0, footer: false, typing: false }; /* assume visible until measured: no flash at load */
    d.addEventListener('p24:dock', function () { render(); });
    var links = dock.querySelectorAll('a, button');
    var render = function () {
      var show = !state.sentinel && !state.footer && !state.typing && !h.classList.contains('story-stuck');
      if (show) dock.setAttribute('data-show', ''); else dock.removeAttribute('data-show');
      h.classList.toggle('dock-on', show);
      dock.setAttribute('aria-hidden', String(!show));
      Array.prototype.forEach.call(links, function (l) { l.tabIndex = show ? 0 : -1; });
    };
    if (hasIO && sentinels.length) {
      var seen = new Set();
      var ioS = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting && e.intersectionRatio >= 0.99) seen.add(e.target); else seen.delete(e.target);
        });
        state.sentinel = seen.size > 0;
        render();
      }, { threshold: [0, 0.99, 1] });
      Array.prototype.forEach.call(sentinels, function (s) { ioS.observe(s); });
    }
    if (hasIO && footerCta) {
      new IntersectionObserver(function (entries) {
        state.footer = entries[0].isIntersecting;
        render();
      }).observe(footerCta);
    }
    d.addEventListener('focusin', function (e) {
      state.typing = !!(e.target.closest && e.target.closest('input, select, textarea'));
      render();
    });
    render();
  }

  /* ---- prototype line: "Replay opening" (Home). A reload from the top is a direct load, so M1 plays. ---- */
  each('[data-replay-opening]', function (a) {
    a.addEventListener('click', function (e) {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
      e.preventDefault();
      if ('scrollRestoration' in w.history) w.history.scrollRestoration = 'manual';
      w.scrollTo(0, 0);
      w.location.reload();
    });
  });

  /* ---- ?qa=1: the view-transition log, drawn once at load and once after the transition settles ---- */
  if (h.classList.contains('qa')) {
    var qaBox = d.createElement('pre');
    qaBox.className = 'p24-qa';
    qaBox.setAttribute('aria-hidden', 'true');
    var draw = function () {
      var P24 = w.P24 || {};
      var NL = String.fromCharCode(10);
      qaBox.textContent = 'P24 QA · ' + h.className + NL + (P24.vtLog || []).map(function (x) { return JSON.stringify(x); }).join(NL);
    };
    draw();
    body.appendChild(qaBox);
    setTimeout(draw, 1200);
  }
})(window, document);
