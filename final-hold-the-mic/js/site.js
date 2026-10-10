
(function () {
  'use strict';
  var doc = document, root = doc.documentElement, win = window;
  var reduceMQ = win.matchMedia('(prefers-reduced-motion: reduce)');
  var each = function (list, fn) { Array.prototype.forEach.call(list, fn); };

  var SOLID_AFTER_PX = 8;        
  var HDR_SLACK_PX = 6;          
  var HDR_HIDE_AFTER_PX = 240;   
  var REEL_MIN_VISIBLE = 0.25;   

  function session(key, value) {
    try { if (value === undefined) return sessionStorage.getItem(key); sessionStorage.setItem(key, value); } catch (e) {  }
    return null;
  }

  var SOURCE_NAMES = { ig: 'Instagram', instagram: 'Instagram', 'ig-story': 'Instagram story', 'ig-bio': 'Instagram bio',
    li: 'LinkedIn', linkedin: 'LinkedIn', wa: 'WhatsApp', whatsapp: 'WhatsApp', email: 'Email', card: 'Card', qr: 'QR code' };
  var source = (function () {
    var raw = null;
    try {
      var q = new URLSearchParams(win.location.search);
      raw = q.get('from') || q.get('utm_source');
    } catch (e) { raw = null; }
    if (raw) {
      raw = String(raw).toLowerCase().replace(/[^a-z0-9 _-]/g, '').slice(0, 24);
      if (raw) session('ns-from', raw);
    }
    return raw || session('ns-from') || '';
  })();
  function sourceLabel() {
    if (!source) return '';
    return SOURCE_NAMES[source] || source.charAt(0).toUpperCase() + source.slice(1).replace(/[-_]/g, ' ');
  }
  win.siteSource = sourceLabel;

  win.track = function (name, props) {
    var p = {};
    var k;
    for (k in props || {}) if (Object.prototype.hasOwnProperty.call(props, k)) p[k] = props[k];
    if (source) p.from = source;
    try { doc.dispatchEvent(new CustomEvent('nisha:track', { detail: { name: name, props: p } })); } catch (e) {  }
    if (typeof win.plausible === 'function') win.plausible(name, { props: p });
    else if (typeof win.gtag === 'function') win.gtag('event', name, p);
  };
  each(doc.querySelectorAll('[data-channel]'), function (a) {
    a.addEventListener('click', function () { win.track('contact_tap', { channel: a.getAttribute('data-channel') }); });
  });
  each(doc.querySelectorAll('[data-track]'), function (a) {
    a.addEventListener('click', function () { win.track('link', { name: a.getAttribute('data-track') }); });
  });

  var CV_AFTER_LOAD_MS = 800;
  function realSizes() { root.classList.add('cv-off'); }
  doc.addEventListener('click', function (e) {
    var a = e.target && e.target.closest && e.target.closest('a[href*="#"]');
    if (a && a.hash && a.pathname === win.location.pathname) realSizes();
  }, true);
  win.addEventListener('load', function () {
    var later = win.requestIdleCallback || function (fn) { return setTimeout(fn, 1); };
    setTimeout(function () { later(realSizes); }, CV_AFTER_LOAD_MS);
  });

  var top = doc.querySelector('.top');
  var ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    win.requestAnimationFrame(function () {
      ticking = false;
      if (top) top.classList.toggle('at-top', win.scrollY <= SOLID_AFTER_PX);
    });
  }
  win.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  each(doc.querySelectorAll('[data-reel]'), function (fig) {
    var video = fig.querySelector('video');
    var frame = fig.querySelector('.reel-frame');
    var play = fig.querySelector('[data-reel-play]');
    if (!video || !play) return;
    video.removeAttribute('controls');          
    play.hidden = false;
    var started = false;
    function captionsOn() {
      for (var i = 0; i < video.textTracks.length; i++) if (video.textTracks[i].kind === 'captions') video.textTracks[i].mode = 'showing';
    }
    function start() {
      try { doc.dispatchEvent(new CustomEvent('reel:play')); } catch (e) {  }
      video.preload = 'auto';
      video.muted = false;
      video.controls = true;
      captionsOn();
      frame.classList.add('is-playing');
      var p;
      try { p = video.play(); } catch (e) { p = null; }
      if (p && p.catch) {
        p.catch(function () {

          frame.classList.remove('is-playing');
          play.hidden = true;
        });
      }
      if (!started) { started = true; win.track('reel_play', {}); win.track('sound_on', { where: 'reel' }); }
    }
    play.addEventListener('click', start);
    video.addEventListener('play', function () {
      frame.classList.add('is-playing');
      try { doc.dispatchEvent(new CustomEvent('reel:play')); } catch (e) {  }
    });
    video.addEventListener('ended', function () { video.controls = true; });

    doc.addEventListener('mic:live', function () { if (!video.paused) video.pause(); });
    if ('IntersectionObserver' in win) {
      new IntersectionObserver(function (ents) {
        ents.forEach(function (en) { if (en.intersectionRatio < REEL_MIN_VISIBLE && !video.paused) video.pause(); });
      }, { threshold: [0, REEL_MIN_VISIBLE] }).observe(frame);
    }
  });

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

    var syncMore = function () { chips.classList.toggle('more', chips.scrollLeft + chips.clientWidth < chips.scrollWidth - 2); };
    chips.addEventListener('scroll', syncMore, { passive: true });
    win.addEventListener('resize', syncMore);
    syncMore();

    var slideMQ = win.matchMedia('(max-width: 700px)');
    var lastY = win.scrollY;
    var setHide = function (on) { root.classList.toggle('hdr-hide', !!on && slideMQ.matches); };
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

  each(doc.querySelectorAll('main picture img:not(.still-img)'), function (img) {
    if (img.complete && img.naturalWidth) return;
    img.classList.add('decoding');
    var done = function () { img.classList.remove('decoding'); };
    img.addEventListener('load', done); img.addEventListener('error', done);
  });

})();
