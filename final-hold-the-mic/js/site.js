/* Shared by both pages: the phone header and its menu sheet, the thumb-zone "Request availability" bar,
   swipe-row dots, the producers page's chip index and bio switch, and the one photo fade. */
(function () {
  'use strict';
  var doc = document, root = doc.documentElement, win = window;
  var reduceMQ = win.matchMedia('(prefers-reduced-motion: reduce)');
  var phoneMQ = win.matchMedia('(max-width: 767px)');
  var each = function (list, fn) { Array.prototype.forEach.call(list, fn); };

  var SOLID_AFTER_PX = 8;        /* the header turns solid once the page has moved */
  var SWIPE_CLOSE_PX = 80;       /* drag the sheet down this far to close it */
  var SHEET_MS = 260;
  var MIC_ZONE_PX = 120;         /* the bar steps aside when a mic sits in the bottom 120 px */
  var HDR_SLACK_PX = 6;          /* producers phones: scroll this far before the header slides */
  var HDR_HIDE_AFTER_PX = 240;   /* ...and never while still near the top */

  /* ---------------- header: transparent over the first picture, solid once scrolled ---------------- */
  var top = doc.querySelector('.top');
  var ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    win.requestAnimationFrame(function () {
      ticking = false;
      if (top) top.classList.toggle('at-top', win.scrollY <= SOLID_AFTER_PX);
      updateDock();
    });
  }
  win.addEventListener('scroll', onScroll, { passive: true });
  win.addEventListener('resize', onScroll);

  /* ---------------- menu: a bottom sheet ---------------- */
  var sheet = doc.getElementById('menu');
  var menuBtn = doc.querySelector('.menu-btn');
  var panel = sheet && sheet.querySelector('.sheet-panel');
  var lastFocus = null, closeTimer = 0;

  function focusables() {
    return Array.prototype.filter.call(panel.querySelectorAll('a[href], button:not([disabled])'), function (el) { return el.offsetParent !== null; });
  }
  function openSheet() {
    if (!sheet) return;
    clearTimeout(closeTimer);
    lastFocus = doc.activeElement;
    sheet.hidden = false;
    root.classList.add('is-locked');
    menuBtn.setAttribute('aria-expanded', 'true');
    void sheet.offsetWidth;          /* start the slide from below */
    sheet.classList.add('open');
    panel.style.transform = '';
    panel.focus({ preventScroll: true });   /* the dialog itself: Tab then walks its links */
  }
  function closeSheet(restore) {
    if (!sheet || sheet.hidden) return;
    sheet.classList.remove('open');
    panel.style.transform = '';
    root.classList.remove('is-locked');
    menuBtn.setAttribute('aria-expanded', 'false');
    closeTimer = setTimeout(function () { sheet.hidden = true; }, reduceMQ.matches ? 0 : SHEET_MS);
    if (restore !== false && lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }
  if (sheet && menuBtn && panel) {
    menuBtn.setAttribute('role', 'button');
    menuBtn.addEventListener('click', function (e) { e.preventDefault(); openSheet(); });
    each(sheet.querySelectorAll('[data-close]'), function (el) { el.addEventListener('click', function () { closeSheet(); }); });
    /* a link closes the sheet first, so the page scrolls to its target unlocked */
    each(panel.querySelectorAll('a[href]'), function (a) {
      a.addEventListener('click', function () { closeSheet(false); });
    });
    doc.addEventListener('keydown', function (e) {
      if (sheet.hidden) return;
      if (e.key === 'Escape' || e.key === 'Esc') { e.preventDefault(); closeSheet(); return; }
      if (e.key !== 'Tab') return;
      var f = focusables(); if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (doc.activeElement === panel || !panel.contains(doc.activeElement)) { e.preventDefault(); (e.shiftKey ? last : first).focus(); }
      else if (e.shiftKey && doc.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && doc.activeElement === last) { e.preventDefault(); first.focus(); }
    });
    /* drag down to close */
    var startY = null, dy = 0;
    panel.addEventListener('touchstart', function (e) {
      if (panel.scrollTop > 0) return;
      startY = e.touches[0].clientY; dy = 0;
      panel.classList.add('dragging');
    }, { passive: true });
    panel.addEventListener('touchmove', function (e) {
      if (startY === null) return;
      dy = Math.max(0, e.touches[0].clientY - startY);
      panel.style.transform = 'translateY(' + dy + 'px)';
    }, { passive: true });
    function endDrag() {
      if (startY === null) return;
      panel.classList.remove('dragging');
      startY = null;
      if (dy > SWIPE_CLOSE_PX) closeSheet(); else panel.style.transform = '';
    }
    panel.addEventListener('touchend', endDrag);
    panel.addEventListener('touchcancel', endDrag);
    /* the sheet belongs to the phone header: leaving phone width closes it */
    var navMQ = win.matchMedia('(min-width: 701px)');
    var onNav = function () { if (navMQ.matches) closeSheet(false); };
    if (navMQ.addEventListener) navMQ.addEventListener('change', onNav);
  }

  /* ---------------- the thumb-zone bar ---------------- */
  var dock = doc.querySelector('.dock');
  var dockLink = dock && dock.querySelector('a');
  var passed = false, blocked = 0;
  var blockers = dock ? doc.querySelectorAll(dock.getAttribute('data-hide') || '') : [];
  var after = dock ? doc.querySelector(dock.getAttribute('data-after') || '') : null;
  var mics = doc.querySelectorAll('.mic-btn');

  function micInZone() {
    var vh = win.innerHeight, hit = false;
    each(mics, function (b) {
      if (hit) return;
      var r = b.getBoundingClientRect();
      if (r.width && r.top < vh && r.bottom > vh - MIC_ZONE_PX) hit = true;
    });
    return hit;
  }
  function updateDock() {
    if (!dock) return;
    var show = phoneMQ.matches && passed && blocked === 0 && !root.classList.contains('mic-live') &&
      !root.classList.contains('is-locked') && !micInZone();
    dock.classList.toggle('show', show);
    if (dockLink) dockLink.tabIndex = show ? 0 : -1;
  }
  if (dock && 'IntersectionObserver' in win) {
    if (after) {
      new IntersectionObserver(function (ents) {
        ents.forEach(function (en) { passed = !en.isIntersecting && en.boundingClientRect.top < 0; });
        updateDock();
      }).observe(after);
    }
    var state = new Map();
    var io = new IntersectionObserver(function (ents) {
      ents.forEach(function (en) { state.set(en.target, en.isIntersecting); });
      blocked = 0; state.forEach(function (v) { if (v) blocked++; });
      updateDock();
    });
    each(blockers, function (el) { io.observe(el); });
    /* playing, or the menu: the bar steps aside */
    new MutationObserver(updateDock).observe(root, { attributes: true, attributeFilter: ['class'] });
    if (phoneMQ.addEventListener) phoneMQ.addEventListener('change', updateDock);
  }

  /* ---------------- swipe rows: dots follow the card in view ---------------- */
  each(doc.querySelectorAll('.swipe[data-dots]'), function (row) {
    var dots = doc.getElementById(row.getAttribute('data-dots'));
    if (!dots) return;
    var items = row.children, marks = dots.children, pending = false;
    function sync() {
      pending = false;
      var rr = row.getBoundingClientRect(), best = 0, bestD = Infinity, i;
      for (i = 0; i < items.length; i++) {
        var d = Math.abs(items[i].getBoundingClientRect().left - rr.left);
        if (d < bestD) { bestD = d; best = i; }
      }
      if (row.scrollLeft + row.clientWidth >= row.scrollWidth - 2) best = items.length - 1;
      for (i = 0; i < marks.length; i++) marks[i].classList.toggle('on', i === best);
    }
    row.addEventListener('scroll', function () { if (!pending) { pending = true; win.requestAnimationFrame(sync); } }, { passive: true });
    sync();
  });

  /* ---------------- producers: the chip index follows the section in view ---------------- */
  var chips = doc.querySelector('.p-chips');
  if (chips && 'IntersectionObserver' in win) {
    var links = chips.querySelectorAll('a[href^="#"]');
    var byId = {};
    each(links, function (a) { byId[a.getAttribute('href').slice(1)] = a; });
    var seen = {};
    var mark = function (id) {
      each(links, function (a) {
        var on = a === byId[id];
        if (on) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
        if (on && chips.scrollWidth > chips.clientWidth) {
          var left = a.offsetLeft - (chips.clientWidth - a.offsetWidth) / 2;
          try { chips.scrollTo({ left: left, behavior: reduceMQ.matches ? 'auto' : 'smooth' }); } catch (e) { chips.scrollLeft = left; }
        }
      });
    };
    var secIO = new IntersectionObserver(function (ents) {
      ents.forEach(function (en) { seen[en.target.id] = en.isIntersecting; });
      var current = null;
      each(links, function (a) { var id = a.getAttribute('href').slice(1); if (!current && seen[id]) current = id; });
      mark(current);
    }, { rootMargin: '-120px 0px -55% 0px' });
    Object.keys(byId).forEach(function (id) { var el = doc.getElementById(id); if (el) secIO.observe(el); });

    /* a soft fade at the right edge while more chips sit off screen */
    var syncMore = function () { chips.classList.toggle('more', chips.scrollLeft + chips.clientWidth < chips.scrollWidth - 2); };
    chips.addEventListener('scroll', syncMore, { passive: true });
    win.addEventListener('resize', syncMore);
    syncMore();

    /* phones: the header slides away while reading down and returns on the way up,
       so only the chips stick. A chip jump decides it before the scroll starts. */
    var slideMQ = win.matchMedia('(max-width: 700px)');
    var lastY = win.scrollY;
    var setHide = function (on) { root.classList.toggle('hdr-hide', !!on && slideMQ.matches && !root.classList.contains('is-locked')); };
    win.addEventListener('scroll', function () {
      var y = win.scrollY, dy = y - lastY;
      if (Math.abs(dy) < HDR_SLACK_PX) return;
      setHide(dy > 0 && y > HDR_HIDE_AFTER_PX);
      lastY = y;
    }, { passive: true });
    each(links, function (a) {
      a.addEventListener('click', function () {
        var el = doc.getElementById(a.getAttribute('href').slice(1));
        if (el) setHide(el.getBoundingClientRect().top > 0);
      });
    });
    if (top) top.addEventListener('focusin', function () { setHide(false); });
    if (slideMQ.addEventListener) slideMQ.addEventListener('change', function () { if (!slideMQ.matches) setHide(false); });
  }

  /* ---------------- producers: one bio at a time on phones ---------------- */
  var bioSwitch = doc.querySelector('.bio-switch');
  if (bioSwitch) {
    var bioMain = doc.querySelector('.bios-main');
    var bioBtns = bioSwitch.querySelectorAll('[data-bio]');
    var bioCopy = bioSwitch.querySelector('.copy-btn');
    var pick = function (id) {
      each(bioBtns, function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-bio') === id ? 'true' : 'false'); });
      each(doc.querySelectorAll('.bio'), function (art) { art.classList.toggle('on', art.id === id); });
      var name = (bioSwitch.querySelector('[data-bio="' + id + '"]') || {}).textContent || '';
      if (bioCopy) {
        bioCopy.setAttribute('data-copy', id + '-t');
        bioCopy.setAttribute('aria-label', 'Copy the ' + name.toLowerCase() + ' bio');
      }
    };
    each(bioBtns, function (b) { b.addEventListener('click', function () { pick(b.getAttribute('data-bio')); }); });
    pick('bio-s');
    bioSwitch.hidden = false;
    if (bioMain) bioMain.classList.add('one');
  }

  /* ---------------- photographs: one 240 ms fade as each decodes ---------------- */
  each(doc.querySelectorAll('main figure:not(.m-photo) img'), function (img) {
    if (img.complete && img.naturalWidth) return;
    img.classList.add('decoding');
    var done = function () { img.classList.remove('decoding'); };
    img.addEventListener('load', done); img.addEventListener('error', done);
  });

  onScroll();
})();
