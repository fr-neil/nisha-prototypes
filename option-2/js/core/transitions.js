/* Prototype 24 · M6 page transitions, old-page side (P29 §2 M6). CORE-owned.
 * The root cross-fade, the page title, the header, the dock and the nav indicator are CSS (css/base/transitions.css).
 * This file only names the ONE shared element that belongs to the link the visitor used:
 *  - a capture-phase click listener records the activated a[data-vt] (keyboard Enter fires click too);
 *  - in pageswap, if a view transition runs and that link's href is the destination, its source element gets the
 *    name, and sessionStorage "p24-vt" tells the new page which destination to name (js/head-inline.js).
 * Sources: data-vt="cta-panel" → the link itself. data-vt="family-hero" → the visible story stage window next to
 * the link (the nearest ancestor that holds a [data-story-stage]), else the link's [data-vt-source] selector.
 * Any failure skips the transition (skipTransition), never the navigation. */
(function (w, d) {
  'use strict';
  var P24 = w.P24 = w.P24 || {};
  var lastLink = null;
  var NAMES = { 'cta-panel': 1, 'family-hero': 1 };

  function visible(el) {
    if (!el) return false;
    var r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < w.innerHeight;
  }

  function sourceFor(link, name) {
    if (name === 'cta-panel') return link;
    var sel = link.getAttribute('data-vt-source');
    if (sel) { var s = d.querySelector(sel); if (visible(s)) return s; }
    var node = link.parentElement;
    while (node && node !== d.body) {
      var stages = node.querySelectorAll('[data-story-stage]');
      for (var i = 0; i < stages.length; i++) {
        var win = stages[i].querySelector('.p24-story__window') || stages[i];
        if (visible(win)) return win;
      }
      node = node.parentElement;
    }
    return null;
  }

  /* "See <family> work →": the window may be showing any row's photo when the link is used, but Work lands on the
   * block's key frame. Show that frame (already built by the story engine) instantly before the snapshot, so the
   * morph goes photo-to-same-photo instead of cross-fading two different people. No key layer yet: left as is. */
  function showKeyFrame(link, win) {
    var block = link.closest('[data-story-block]');
    if (!block || !win || !win.classList.contains('p24-story__window')) return;
    var key = block.getAttribute('data-story-key');
    if (!key) { var st = block.querySelector('[data-story-step]'); key = st ? (st.getAttribute('data-story-step') || '').split(/\s+/)[0] : ''; }
    var layer = key ? win.querySelector('.p24-story__layer[data-frame="' + key + '"]') : null;
    if (!layer || !layer.style.width) return;
    var img = layer.querySelector('img');
    if (img && !img.complete) return;
    var all = win.querySelectorAll('.p24-story__layer');
    for (var i = 0; i < all.length; i++) {
      if (all[i].getAnimations) all[i].getAnimations().forEach(function (an) { an.cancel(); });
      if (all[i] !== layer) all[i].classList.remove('is-on', 'is-top');
    }
    if (win.getAnimations) win.getAnimations().forEach(function (an) { an.cancel(); });
    layer.classList.add('is-on');
    layer.style.clipPath = '';
    var area = win.parentElement || win;
    var l = parseFloat(layer.style.left) || 0, t = parseFloat(layer.style.top) || 0;
    var lw = parseFloat(layer.style.width) || 0, lh = parseFloat(layer.style.height) || 0;
    win.style.clipPath = 'inset(' + t + 'px ' + Math.max(0, area.clientWidth - l - lw) + 'px ' + Math.max(0, area.clientHeight - t - lh) + 'px ' + l + 'px)';
  }

  /* One element per name, ever: clear any element that already carries it. */
  function name(el, n) {
    if (!el || !n) return;
    var prev = d.querySelectorAll('[data-vt-named]');
    for (var i = 0; i < prev.length; i++) {
      if (prev[i].style.viewTransitionName === n) { prev[i].style.viewTransitionName = ''; prev[i].removeAttribute('data-vt-named'); }
    }
    el.style.viewTransitionName = n;
    el.setAttribute('data-vt-named', '');
  }
  function clearAll() {
    var named = d.querySelectorAll('[data-vt-named]');
    for (var i = 0; i < named.length; i++) { named[i].style.viewTransitionName = ''; named[i].removeAttribute('data-vt-named'); }
  }

  d.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    lastLink = a && a.hasAttribute('data-vt') ? a : null;
  }, true);

  w.addEventListener('pageswap', function (e) {
    var vt = e.viewTransition;
    try { w.sessionStorage.removeItem('p24-vt'); } catch (err) { /* storage off: pairs are skipped */ }
    if (!vt) return;
    try {
      clearAll();
      var link = lastLink;
      lastLink = null;
      var entry = e.activation && e.activation.entry;
      if (!link || !entry || link.href !== entry.url) return;
      var n = link.getAttribute('data-vt');
      if (!NAMES[n]) return;
      var src = sourceFor(link, n);
      if (!visible(src)) return;
      if (n === 'family-hero') showKeyFrame(link, src);
      name(src, n);
      w.sessionStorage.setItem('p24-vt', n);
      if (d.documentElement.classList.contains('qa')) {
        var r = src.getBoundingClientRect();
        w.sessionStorage.setItem('p24-vtlog', JSON.stringify({ name: n, source: src.tagName.toLowerCase() + '.' + String(src.className).split(' ')[0], rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)], url: entry.url }));
      }
    } catch (err) {
      vt.skipTransition();
    }
  });

  /* bfcache: a page restored from the back/forward cache must not keep an old name. */
  w.addEventListener('pageshow', function (e) { if (e.persisted) { clearAll(); lastLink = null; } });

  P24._vt = {
    name: name,
    clear: clearAll,
    internalNav: function () { return d.documentElement.classList.contains('vt-nav'); },
    supported: typeof d.startViewTransition === 'function' && !!w.CSS && CSS.supports('view-transition-name: none')
  };
})(window, document);
