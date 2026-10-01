/* Prototype 24 · inline head script v2 (P29 §1, M1, M6). CORE-owned. tools/assemble.cjs inlines it into every page.
 * Runs synchronously before first paint. <html data-page> is set by the template.
 *  - html.js; html.js-motion unless prefers-reduced-motion: reduce.
 *  - html.m1-skip (Home only plays M1 on a direct load or reload): set for Back/Forward, ?qa=0, reduced motion,
 *    every page other than Home, and (in pagereveal) view-transition arrivals.
 *  - html.m1-type (Home, ≥ 761 px, M1 will play): the Latin name is held ≤ 300 ms (motion.css fail-safe).
 *  - html.h1-hold (inner pages, ≥ 761 px, direct load): the H1 is held ≤ 300 ms for the M8 line rise.
 *  - html[data-family] from ?family=, html.vt-from-site for a same-origin referrer, html.qa for ?qa=1.
 *  - pagereveal: vt-nav on view-transition arrivals; Back/Forward (traverse) skips the transition; names the one
 *    shared-element target the old page announced (sessionStorage p24-vt), only if it is in view and its image
 *    is complete; clears every name when the transition finishes. pageshow (bfcache): clears names.
 *  - Boot watchdog: if the core has not booted 1.2 s after DOMContentLoaded (or an error fires first),
 *    js-motion and every hold are dropped so nothing can stay hidden. */
(function (d, w) {
  var h = d.documentElement;
  var page = h.getAttribute('data-page') || '';
  var cls = h.classList;
  cls.add('js');
  function mq(q) { try { return w.matchMedia(q).matches; } catch (e) { return false; } }
  var reduce = mq('(prefers-reduced-motion: reduce)');
  var wide = mq('(min-width: 761px)');
  var q = null;
  try { q = new URLSearchParams(w.location.search); } catch (e) { q = null; }
  var qa = q ? q.get('qa') : null;
  var navType = 'navigate';
  try { var nav = performance.getEntriesByType('navigation')[0]; if (nav && nav.type) navType = nav.type; } catch (e) { navType = 'navigate'; }

  if (!reduce) cls.add('js-motion');
  if (qa === '1') cls.add('qa');

  var m1 = page === 'home' && !reduce && qa !== '0' && navType !== 'back_forward';
  if (!m1) cls.add('m1-skip');
  else if (wide) cls.add('m1-type');
  if (page !== 'home' && !reduce && wide && navType !== 'back_forward' && qa !== '0') cls.add('h1-hold');

  var fam = q ? q.get('family') : null;
  if (fam && /^[a-z-]{1,40}$/.test(fam)) h.setAttribute('data-family', fam);
  try { if (d.referrer && new URL(d.referrer).origin === w.location.origin) cls.add('vt-from-site'); } catch (e) { /* no referrer */ }

  /* ?qa=1: a log of the transition for the QA overlay (motion.js renders it). */
  var P24 = w.P24 = w.P24 || {};
  P24.vtLog = [];
  function namedNow() {
    var out = [];
    if (qa !== '1') return out;
    var all = d.querySelectorAll('body *');
    for (var i = 0; i < all.length; i++) {
      var n = w.getComputedStyle(all[i]).viewTransitionName;
      if (n && n !== 'none') out.push(n + '=' + all[i].tagName.toLowerCase() + (all[i].id ? '#' + all[i].id : '') + (all[i].className && typeof all[i].className === 'string' ? '.' + all[i].className.split(' ')[0] : ''));
    }
    return out;
  }
  function log(entry) { if (qa === '1') P24.vtLog.push(entry); }

  function unhold() { cls.remove('m1-type'); cls.remove('h1-hold'); }
  function clearNames() {
    var named = d.querySelectorAll('[data-vt-named]');
    for (var i = 0; i < named.length; i++) { named[i].style.viewTransitionName = ''; named[i].removeAttribute('data-vt-named'); }
  }
  function inView(el) {
    var r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < (w.innerHeight || h.clientHeight);
  }
  function imagesReady(el) {
    var imgs = el.tagName === 'IMG' ? [el] : el.querySelectorAll('img');
    var shown = 0;
    for (var i = 0; i < imgs.length; i++) {
      if (!imgs[i].getClientRects().length) continue; /* a hidden alternative (e.g. another family's picture) */
      shown++;
      if (!imgs[i].complete || !imgs[i].naturalWidth) return false;
    }
    return shown > 0 || !imgs.length;
  }
  /* The element the URL hash points at (Enquire: #availability or #enquiry). */
  function hashEl() {
    var id = (w.location.hash || '').slice(1);
    if (!id || !/^[\w-]+$/.test(id)) return null;
    return d.getElementById(id);
  }
  /* A section that is the page's destination by hash names its own heading as the page title (the H1 higher up
   * is far above the viewport): <section data-hash-title> … <h2 data-hash-heading>. */
  function hashTitle() {
    var sec = hashEl();
    if (!sec || !sec.hasAttribute('data-hash-title')) return;
    var hd = sec.querySelector('[data-hash-heading]');
    var h1 = d.querySelector('[data-page-title]');
    if (hd && h1 && hd !== h1) {
      h1.style.viewTransitionName = 'none';
      h1.setAttribute('data-vt-named', '');
      hd.style.viewTransitionName = 'page-title';
      hd.setAttribute('data-vt-named', '');
    }
  }
  /* The document title for a hash destination, set before first paint: <html data-title-enquiry="…">. */
  function docTitle() {
    var id = (w.location.hash || '').slice(1);
    var t = id && /^[\w-]+$/.test(id) ? h.getAttribute('data-title-' + id) : null;
    if (t) d.title = t;
  }
  docTitle();
  w.addEventListener('hashchange', docTitle);
  /* A destination late in the page (<html data-expect-hash="enquiry">) holds first render until it is parsed only
   * when the URL points at it (the M6 pair needs it; a plain load should not wait for the whole page). */
  (function () {
    var id = (w.location.hash || '').slice(1);
    var want = (h.getAttribute('data-expect-hash') || '').split(' ');
    if (!id || want.indexOf(id) < 0) return;
    var l = d.createElement('link');
    l.rel = 'expect';
    l.href = '#' + id;
    l.setAttribute('blocking', 'render');
    d.head.appendChild(l);
  })();

  /* The destination of each shared-element pair on this page (one element per name, ever). */
  function target(name) {
    if (name === 'family-hero') return d.querySelector('[data-vt-target="family-hero"]');
    if (name === 'cta-panel') {
      var scope = w.location.hash === '#enquiry' ? '#enquiry' : '#availability';
      return d.querySelector(scope + ' [data-vt-target="cta-panel"]') || d.querySelector(scope + '[data-vt-target="cta-panel"]');
    }
    return null;
  }

  w.addEventListener('pagereveal', function (e) {
    var vt = e.viewTransition;
    var wanted = null;
    try { wanted = w.sessionStorage.getItem('p24-vt'); w.sessionStorage.removeItem('p24-vt'); } catch (err) { wanted = null; }
    if (qa === '1') {
      try { var prevLog = w.sessionStorage.getItem('p24-vtlog'); if (prevLog) log({ event: 'pageswap (old page)', data: JSON.parse(prevLog) }); w.sessionStorage.removeItem('p24-vtlog'); } catch (err) { /* storage off */ }
    }
    if (!vt) { log({ event: 'pagereveal', viewTransition: false }); return; }
    /* A skipped transition rejects these promises: handle them so a skip is never an unhandled rejection. */
    [vt.ready, vt.finished, vt.updateCallbackDone].forEach(function (p) { if (p && p.catch) p.catch(function () {}); });
    cls.add('vt-nav');
    cls.add('m1-skip');
    unhold();
    var act = w.navigation && w.navigation.activation;
    if (act && act.navigationType === 'traverse') { log({ event: 'pagereveal', traverse: true, skipped: true }); vt.skipTransition(); return; }
    try {
      hashTitle();
      /* A hash destination (#enquiry): pagereveal can run before the browser's fragment scroll, so the target
       * would test as out of view and never be named (QA vt-07). Scroll to the fragment first (the same place
       * the browser would land), then test. */
      var anchor = hashEl();
      if (anchor && (w.scrollY || h.scrollTop) < 1 && anchor.getBoundingClientRect().top > 1) anchor.scrollIntoView({ block: 'start' });
      var el = wanted ? target(wanted) : null;
      if (el && inView(el) && imagesReady(el)) {
        el.style.viewTransitionName = wanted;
        el.setAttribute('data-vt-named', '');
      } else if (wanted) {
        /* No destination: the old page's snapshot for this name leaves with the old page (no orphan pill). */
        cls.add('vt-unpaired');
      }
      var names = namedNow();
      log({ event: 'pagereveal', viewTransition: true, wanted: wanted, named: names });
      var done = function () { cls.remove('vt-unpaired'); clearNames(); };
      vt.finished.then(function () { log({ event: 'finished' }); done(); }, function () { log({ event: 'finished (skipped)' }); done(); });
    } catch (err) {
      vt.skipTransition();
    }
  });
  w.addEventListener('pageshow', function (e) { if (e.persisted) { clearNames(); cls.add('m1-skip'); unhold(); } });

  function booted() { return !!(w.P24 && w.P24.booted); }
  function drop() { if (!booted()) { cls.remove('js-motion'); unhold(); } }
  w.addEventListener('error', drop);
  d.addEventListener('DOMContentLoaded', function () { setTimeout(drop, 1200); });
})(document, window);
