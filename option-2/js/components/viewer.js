/* Prototype 24 · component: viewer (photo viewer, P29 §2 M4 / §3.4). CORE-owned. ctx.viewer on pages that list "viewer".
 * Extracted from the checkpoint's u3.js and generalised (About gallery, Asked-back photos, the slot).
 *
 * Triggers (clicks delegated): <a data-view href="<full jpg>" [data-full-avif="<avif url or srcset>"]
 *   data-w data-h data-cap="what · client · place · date" [data-title] [data-view-group="<name>"]>
 *   <img …thumbnail…></a>
 * (data-view-group may sit on an ancestor.) Without JS the link opens the full image.
 * API: ctx.viewer.open(trigger, { from, group }) · close().
 * Motion: the photo grows out of the thumbnail (0.6 s Move): the frame starts centred on the thumbnail at the
 * thumbnail's size with ONE uniform scale (never stretched, never above 1) and moves to its place; Close / Esc /
 * the scrim returns it the same way and returns focus. The full photo stays hidden until it has decoded (the
 * thumbnail, at the new photo's aspect, shows meanwhile), so Previous / Next never shows a stretched old photo.
 * "← Previous photo" / "Next photo →" within the group; ArrowLeft/Right when focus is not in a form control.
 * Reduced motion: a 150 ms fade; Previous/Next swap instantly. A light scrim (opaque on phones). */
(function (w, d) {
  'use strict';
  var P24 = w.P24 = w.P24 || {};
  var h = d.documentElement;
  var MOVE_MS = 600;
  var BACK_MS = 450;
  var EASE = 'cubic-bezier(.65,0,.35,1)';
  var DECODE_MS = 400;
  var MIN_SCALE = 0.08;

  var dlg = null;
  var ui = {};
  var state = null;

  function motionOK() { return h.classList.contains('js-motion'); }
  function el(tag, cls, text) { var n = d.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function btn(cls, text) { var b = el('button', 'p24-player__ctl ' + (cls || ''), text); b.type = 'button'; return b; }

  function build() {
    if (dlg) return;
    dlg = el('dialog', 'p24-viewer');
    dlg.setAttribute('aria-labelledby', 'p24-viewer-title');
    var bar = el('div', 'p24-viewer__bar');
    ui.close = btn('p24-player__ctl--close', 'Close');
    bar.appendChild(ui.close);
    var body = el('div', 'p24-viewer__body');
    ui.frame = el('div', 'p24-viewer__frame');
    ui.pic = el('picture');
    ui.source = el('source');
    ui.source.type = 'image/avif';
    ui.img = el('img');
    ui.img.decoding = 'async';
    ui.pic.appendChild(ui.source);
    ui.pic.appendChild(ui.img);
    ui.frame.appendChild(ui.pic);
    var meta = el('div', 'p24-viewer__meta');
    ui.title = el('h2', 'p24-viewer__title');
    ui.title.id = 'p24-viewer-title';
    ui.cap = el('p', 'p24-cap p24-cap--wrap p24-viewer__cap');
    ui.nav = el('div', 'p24-player__nav');
    ui.prev = btn('p24-player__step', '← Previous photo');
    ui.next = btn('p24-player__step', 'Next photo →');
    ui.nav.appendChild(ui.prev);
    ui.nav.appendChild(ui.next);
    meta.appendChild(ui.title);
    meta.appendChild(ui.cap);
    meta.appendChild(ui.nav);
    body.appendChild(ui.frame);
    body.appendChild(meta);
    dlg.appendChild(bar);
    dlg.appendChild(body);
    d.body.appendChild(dlg);
    ui.close.addEventListener('click', close);
    ui.prev.addEventListener('click', function () { step(-1); });
    ui.next.addEventListener('click', function () { step(1); });
    dlg.addEventListener('cancel', function (e) { e.preventDefault(); close(); });
    dlg.addEventListener('click', function (e) { if (e.target === dlg) close(); });
    dlg.addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      var a = d.activeElement;
      if (a && (/^(INPUT|SELECT|TEXTAREA|VIDEO)$/.test(a.tagName) || a.getAttribute('role') === 'slider')) return;
      e.preventDefault();
      step(e.key === 'ArrowLeft' ? -1 : 1);
    });
  }

  function groupOf(trigger, opts) {
    var gEl = trigger.closest('[data-view-group]');
    var name = (opts && opts.group) || (gEl ? gEl.getAttribute('data-view-group') : null);
    if (!name) return [trigger];
    /* A photo whose row is not displayed (e.g. filtered out of the record) is left out of Previous / Next. */
    return Array.prototype.slice.call(d.querySelectorAll('a[data-view]')).filter(function (t) {
      var gEl = t.closest('[data-view-group]');
      var row = t.closest('li');
      return t === trigger || (gEl && gEl.getAttribute('data-view-group') === name && !(row && !row.getClientRects().length));
    });
  }

  /* Resolves when the full photo has decoded, or after DECODE_MS; the img is hidden until then. */
  var fillToken = 0;
  var dims = { w: 4, h: 5 };
  function fill(t) {
    var thumb = t.querySelector('img');
    var avif = t.getAttribute('data-full-avif') || '';
    var mine = ++fillToken;
    ui.img.style.visibility = 'hidden';
    ui.source.srcset = avif;
    ui.img.src = t.getAttribute('href');
    /* img.width reads back the RENDERED width (0 before load), so the photo's own size is kept in dims. */
    dims.w = +t.getAttribute('data-w') || (thumb ? thumb.naturalWidth : 4) || 4;
    dims.h = +t.getAttribute('data-h') || (thumb ? thumb.naturalHeight : 5) || 5;
    ui.img.setAttribute('width', dims.w);
    ui.img.setAttribute('height', dims.h);
    ui.img.alt = thumb ? thumb.alt : '';
    ui.frame.style.setProperty('--ar', dims.w + ' / ' + dims.h);
    sizeImg();
    ui.frame.style.backgroundImage = thumb ? 'url("' + (thumb.currentSrc || thumb.src) + '")' : '';
    ui.title.textContent = t.getAttribute('data-title') || 'Photo';
    ui.cap.textContent = t.getAttribute('data-cap') || '';
    var many = state.group.length > 1;
    ui.nav.hidden = !many;
    var reveal = function () { if (mine === fillToken) ui.img.style.visibility = ''; };
    var dec = ui.img.decode ? ui.img.decode().then(reveal, reveal) : Promise.resolve().then(reveal);
    return Promise.race([dec, new Promise(function (r) { setTimeout(function () { reveal(); r(); }, DECODE_MS); })]);
  }

  /* The photo's display size, set before it loads (an unloaded img sized auto is 0 x 0, which made the opening
   * start as a keyhole): the attribute size, capped by the column, 720 px and the screen height. */
  function sizeImg() {
    if (!dlg || !dlg.open) return;
    var body = ui.frame.parentElement;
    var cs = w.getComputedStyle(body);
    var phone = w.matchMedia('(max-width: 760px)').matches;
    var avail = body.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0);
    if (!phone) avail -= (parseFloat(cs.columnGap) || 0) + 360;
    var maxH = phone ? w.innerHeight * 0.62 : w.innerHeight - 150;
    var ar = dims.w / dims.h;
    var wd = Math.max(120, Math.min(dims.w, avail, phone ? avail : 720, maxH * ar));
    ui.img.style.width = Math.round(wd) + 'px';
    ui.img.style.height = Math.round(wd / ar) + 'px';
  }
  function onResize() { if (state) sizeImg(); }
  w.addEventListener('resize', onResize, { passive: true });

  /* The transform that puts the frame over the thumbnail: centres matched, one uniform scale (area-matched, <= 1). */
  function fromThumb(src) {
    var F = ui.frame.getBoundingClientRect();
    var S = src.getBoundingClientRect();
    if (!F.width || !F.height) return 'none';
    var k = Math.sqrt((S.width * S.height) / (F.width * F.height));
    k = Math.max(MIN_SCALE, Math.min(1, k));
    var dx = (S.left + S.width / 2) - (F.left + F.width / 2);
    var dy = (S.top + S.height / 2) - (F.top + F.height / 2);
    return 'translate(' + Math.round(dx) + 'px, ' + Math.round(dy) + 'px) scale(' + k.toFixed(4) + ')';
  }
  function onScreen(n) {
    if (!n || !n.isConnected) return false;
    var r = n.getBoundingClientRect();
    return r.width > 0 && r.bottom > 0 && r.top < w.innerHeight;
  }

  function open(trigger, opts) {
    if (!trigger || state || (dlg && dlg.open)) return;
    build();
    opts = opts || {};
    var group = groupOf(trigger, opts);
    state = { trigger: trigger, from: opts.from || trigger.querySelector('img') || trigger, group: group, index: Math.max(0, group.indexOf(trigger)), busy: true };
    dlg.showModal();
    fill(trigger);
    var done = function () { if (state) state.busy = false; dlg.setAttribute('data-phase', 'open'); };
    if (motionOK() && ui.frame.animate && onScreen(state.from)) {
      dlg.setAttribute('data-phase', 'opening');
      dlg.animate([{ backgroundColor: 'rgba(252,251,249,0)' }, {}], { duration: 300, easing: 'ease-out' });
      ui.frame.animate([{ transform: fromThumb(state.from), opacity: 0.6 }, { opacity: 1, offset: 0.25 }, { transform: 'none', opacity: 1 }], { duration: MOVE_MS, easing: EASE }).finished.then(done, done);
      return;
    }
    if (ui.frame.animate) dlg.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 150 }).finished.then(done, done);
    else done();
  }

  function finish() {
    var s = state;
    dlg.close();
    dlg.removeAttribute('data-phase');
    if (ui.frame.getAnimations) ui.frame.getAnimations().concat(dlg.getAnimations()).forEach(function (a) { a.cancel(); });
    state = null;
    if (s && s.trigger && s.trigger.isConnected) s.trigger.focus({ preventScroll: true });
  }

  function close() {
    if (!state || state.busy || !dlg || !dlg.open) return;
    state.busy = true;
    var from = state.group[state.index] ? (state.group[state.index].querySelector('img') || state.group[state.index]) : state.from;
    if (motionOK() && ui.frame.animate && onScreen(from)) {
      dlg.setAttribute('data-phase', 'opening');
      ui.frame.animate([{ transform: 'none', opacity: 1 }, { opacity: 1, offset: 0.75 }, { transform: fromThumb(from), opacity: 0 }], { duration: BACK_MS, easing: EASE, fill: 'forwards' }).finished.then(finish, finish);
      dlg.animate([{}, { backgroundColor: 'rgba(252,251,249,0)' }], { duration: BACK_MS, easing: 'ease-out', fill: 'forwards' });
      return;
    }
    if (ui.frame.animate) dlg.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 150, fill: 'forwards' }).finished.then(finish, finish);
    else finish();
  }

  function step(dir) {
    if (!state || state.busy || state.group.length < 2) return;
    state.index = (state.index + dir + state.group.length) % state.group.length;
    state.trigger = state.group[state.index];
    if (!motionOK() || !ui.frame.animate) { fill(state.trigger); return; }
    state.busy = true;
    ui.frame.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateX(' + (-dir * 40) + 'px)' }], { duration: 180, easing: 'ease-in', fill: 'forwards' }).finished.then(function () {
      return state ? fill(state.trigger) : null;
    }).then(function () {
      if (!state) return null;
      ui.frame.getAnimations().forEach(function (a) { a.cancel(); });
      return ui.frame.animate([{ opacity: 0, transform: 'translateX(' + (dir * 40) + 'px)' }, { opacity: 1, transform: 'none' }], { duration: 270, easing: EASE }).finished;
    }).then(function () { if (state) state.busy = false; }, function () { if (state) state.busy = false; });
  }

  d.addEventListener('click', function (e) {
    var t = e.target.closest && e.target.closest('a[data-view]');
    if (!t || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    open(t);
  });

  var api = { open: open, close: close };
  if (P24.component) P24.component('viewer', function () { return api; });
})(window, document);
