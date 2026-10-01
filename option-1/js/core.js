/* Prototype 22 · core behaviour. SHARED, READ-ONLY for page builders. No build step, no dependencies.
 *  - mobile nav (Menu button, Escape, focus return), header scrolled state, aria-current
 *  - mobile dock (sticky Request availability / Make an enquiry) after the first-screen CTAs leave view
 *  - clip players: poster-first, muted, tap to play, one at a time, pause when out of view
 *  - once-only micro-loops ([data-loop-once]); never loop, poster only under reduced motion
 *  - window.P22: { reducedMotion(), pauseClips(except), initClips(scope) }
 * Every page is complete without this file (SPEC.md §5, no-JS contract).
 */
(function () {
  'use strict';

  var doc = document;
  var root = doc.documentElement;
  var body = doc.body;
  var mqReduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  var mqDesktop = window.matchMedia('(min-width: 900px)');
  var hasIO = 'IntersectionObserver' in window;

  root.classList.add('js');
  function syncMotionClass() {
    root.classList.toggle('reduce-motion', mqReduce.matches);
    root.classList.toggle('motion-ok', !mqReduce.matches);
  }
  syncMotionClass();
  if (mqReduce.addEventListener) mqReduce.addEventListener('change', syncMotionClass);

  function each(list, fn) { Array.prototype.forEach.call(list, fn); }

  /* ------------------------------------------------------------ active link */
  var page = body.getAttribute('data-page');
  each(doc.querySelectorAll('[data-nav]'), function (a) {
    if (page && a.getAttribute('data-nav') === page) a.setAttribute('aria-current', 'page');
  });

  /* ------------------------------------------------------------ header */
  var header = doc.querySelector('[data-header]');
  var toggle = doc.querySelector('[data-nav-toggle]');
  var nav = doc.getElementById('site-nav');

  function setOpen(open, returnFocus) {
    if (!header || !toggle) return;
    if (open) header.setAttribute('data-open', '');
    else header.removeAttribute('data-open');
    toggle.setAttribute('aria-expanded', String(open));
    /* Phones: the open panel fills the screen, so the page behind it must not scroll. */
    root.classList.toggle('nav-open', open && !mqDesktop.matches);
    var label = toggle.querySelector('.nav-toggle__label');
    if (label) label.textContent = open ? 'Close' : 'Menu';
    /* Focus stays on the toggle when opening: the nav follows it in the DOM, so Tab reaches it next. */
    if (!open && returnFocus) {
      toggle.focus();
    }
  }

  if (toggle && header) {
    toggle.hidden = false;
    toggle.addEventListener('click', function () { setOpen(toggle.getAttribute('aria-expanded') !== 'true', false); });
    doc.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && header.hasAttribute('data-open')) setOpen(false, true);
    });
    if (nav) nav.addEventListener('click', function (e) { if (e.target.closest('a')) setOpen(false, false); });
    doc.addEventListener('click', function (e) {
      if (header.hasAttribute('data-open') && !header.contains(e.target)) setOpen(false, false);
    });
    var onDesktop = function () { if (mqDesktop.matches) setOpen(false, false); };
    if (mqDesktop.addEventListener) mqDesktop.addEventListener('change', onDesktop);
  }

  if (header) {
    var ticking = false;
    var syncScrolled = function () {
      ticking = false;
      if (window.scrollY > 8) header.setAttribute('data-scrolled', '');
      else header.removeAttribute('data-scrolled');
    };
    window.addEventListener('scroll', function () {
      if (!ticking) { ticking = true; window.requestAnimationFrame(syncScrolled); }
    }, { passive: true });
    syncScrolled();
  }

  /* ------------------------------------------------------------ dock */
  var dock = doc.querySelector('[data-dock]');
  if (dock && !body.hasAttribute('data-no-dock')) {
    dock.hidden = false;
    var sentinels = doc.querySelectorAll('[data-dock-sentinel]');
    var footerCta = doc.querySelector('[data-footer-cta]');
    var state = { sentinelVisible: sentinels.length > 0, footerVisible: false, typing: false, pastFold: false };
    var render = function () {
      var show = !state.sentinelVisible && !state.footerVisible && !state.typing && (sentinels.length > 0 || state.pastFold);
      if (show) dock.setAttribute('data-show', '');
      else dock.removeAttribute('data-show');
      /* Keeps focused fields and in-page anchors clear of the dock (WCAG 2.4.11). */
      root.classList.toggle('dock-on', show);
      dock.setAttribute('aria-hidden', String(!show));
      each(dock.querySelectorAll('a, button'), function (el) { el.tabIndex = show ? 0 : -1; });
    };
    if (hasIO && sentinels.length) {
      var visibleSet = new Set();
      var ioS = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) { if (e.isIntersecting) visibleSet.add(e.target); else visibleSet.delete(e.target); });
        state.sentinelVisible = visibleSet.size > 0;
        render();
      });
      each(sentinels, function (s) { ioS.observe(s); });
    } else {
      var syncFold = function () { state.pastFold = window.scrollY > window.innerHeight * 0.8; render(); };
      window.addEventListener('scroll', syncFold, { passive: true });
      syncFold();
    }
    if (hasIO && footerCta) {
      new IntersectionObserver(function (entries) {
        state.footerVisible = entries[0].isIntersecting;
        render();
      }).observe(footerCta);
    }
    doc.addEventListener('focusin', function (e) {
      state.typing = !!(e.target.closest && e.target.closest('input, select, textarea'));
      render();
    });
    render();
  }

  /* ------------------------------------------------------------ clip players */
  var clips = [];

  function pauseClips(except) {
    clips.forEach(function (c) { if (c.video !== except && !c.video.paused) c.video.pause(); });
  }

  function setState(fig, s) { fig.setAttribute('data-state', s); }

  function clock(t) {
    var s = Math.max(0, Math.floor(t || 0));
    return Math.floor(s / 60) + ':' + (s % 60 < 10 ? '0' : '') + (s % 60);
  }

  function el(tag, cls, text) {
    var n = doc.createElement(tag);
    if (cls) n.className = cls;
    if (text) n.textContent = text;
    return n;
  }

  /* Once a clip plays, a small bar stands in for the native controls: pause/play, progress, time, and
     either a "Sound on" toggle (figure[data-sound]: the file carries her voice; it still starts muted)
     or a plain "No sound" note (the other clips are silent social-media copies, so a mute icon would mislead). */
  function buildBar(fig, video, start) {
    var bar = el('div', 'clip__bar');
    var toggle = el('button', 'clip__ctl clip__ctl--toggle');
    toggle.type = 'button';
    toggle.appendChild(el('span', 'clip__ctl-icon'));
    toggle.setAttribute('aria-label', 'Pause');
    var track = el('span', 'clip__track');
    track.setAttribute('aria-hidden', 'true');
    var fill = el('span', 'clip__fill');
    track.appendChild(fill);
    var time = el('span', 'clip__time', '0:00');
    time.setAttribute('aria-hidden', 'true');
    bar.appendChild(toggle);
    bar.appendChild(track);
    bar.appendChild(time);

    if (fig.hasAttribute('data-sound')) {
      var sound = el('button', 'clip__ctl clip__snd', 'Sound on');
      sound.type = 'button';
      sound.setAttribute('aria-pressed', 'false');
      sound.addEventListener('click', function () {
        var on = video.muted;
        video.muted = !on;
        if (on) video.removeAttribute('muted'); else video.setAttribute('muted', '');
        sound.setAttribute('aria-pressed', String(on));
        sound.textContent = on ? 'Sound off' : 'Sound on';
        if (on && video.paused) start();
      });
      bar.appendChild(sound);
    } else {
      bar.appendChild(el('span', 'clip__nosound', 'No sound'));
    }

    toggle.addEventListener('click', function () {
      if (video.paused || video.ended) start(); else video.pause();
    });
    var sync = function () {
      var playing = !video.paused && !video.ended;
      toggle.setAttribute('aria-label', playing ? 'Pause' : 'Play');
      toggle.classList.toggle('is-paused', !playing);
    };
    video.addEventListener('play', sync);
    video.addEventListener('pause', sync);
    video.addEventListener('timeupdate', function () {
      var d = video.duration || 0;
      fill.style.transform = 'scaleX(' + (d ? Math.min(1, video.currentTime / d) : 0) + ')';
      time.textContent = clock(video.currentTime);
    });
    (fig.querySelector('.clip__frame') || fig).appendChild(bar);
  }

  function initClip(fig) {
    if (fig.__p22) return;
    fig.__p22 = true;
    var video = fig.querySelector('video');
    var play = fig.querySelector('.clip__play');
    if (!video) return;
    video.removeAttribute('controls');
    video.muted = true;
    video.setAttribute('muted', '');
    video.playsInline = true;
    if (play) play.hidden = false;
    setState(fig, 'idle');
    var c = { fig: fig, video: video };
    clips.push(c);

    var start = function () {
      pauseClips(video);
      var p = video.play();
      if (p && p.catch) p.catch(function () { video.setAttribute('controls', ''); });
    };
    buildBar(fig, video, start);
    if (play) play.addEventListener('click', start);
    /* A tap on the picture pauses and resumes; the bar's button is the keyboard route. */
    video.addEventListener('click', function () {
      var s = fig.getAttribute('data-state');
      if (s === 'playing') video.pause();
      else if (s === 'paused') start();
    });
    video.addEventListener('play', function () {
      setState(fig, 'playing');
      fig.dispatchEvent(new CustomEvent('p22:clip-play', { bubbles: true }));
    });
    video.addEventListener('pause', function () { if (!video.ended) setState(fig, 'paused'); });
    video.addEventListener('ended', function () {
      setState(fig, 'ended');
      try { video.currentTime = 0; } catch (e) { /* not seekable yet */ }
      if (play) play.focus({ preventScroll: true });
    });
    if (hasIO) {
      new IntersectionObserver(function (entries) {
        if (!entries[0].isIntersecting && !video.paused) video.pause();
      }, { threshold: 0.25 }).observe(fig);
    }
  }

  function initLoop(video) {
    if (video.__p22) return;
    video.__p22 = true;
    video.muted = true;
    video.loop = false;
    video.removeAttribute('loop');
    video.removeAttribute('controls');
    if (mqReduce.matches || !hasIO) return; /* poster is the designed still */
    var io = new IntersectionObserver(function (entries) {
      var e = entries[0];
      if (e.isIntersecting && e.intersectionRatio >= 0.6) {
        io.disconnect();
        var p = video.play();
        if (p && p.catch) p.catch(function () { /* autoplay refused: the poster stays */ });
      }
    }, { threshold: [0, 0.6] });
    io.observe(video);
  }

  function initClips(scope) {
    each((scope || doc).querySelectorAll('[data-clip]'), initClip);
    each((scope || doc).querySelectorAll('video[data-loop-once]'), initLoop);
  }
  initClips();

  window.P22 = {
    reducedMotion: function () { return mqReduce.matches; },
    pauseClips: pauseClips,
    initClips: initClips
  };
})();
