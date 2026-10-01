/* Prototype 24 · motion core v2 (P29 §1, §4(a) contracts; CORE.md §3). CORE-owned; units build against this API only.
 *
 *   P24.register(id, { init(ctx) { ...; return optionalCleanup; } })   // page code (no-op when its root is absent)
 *   P24.component(name, factory(ctx) → api)                              // js/components/* only
 *
 * The core boots once at DOMContentLoaded (after every deferred script has registered) and calls each unit's
 * init(ctx) inside gsap.matchMedia(): if the OS reduced-motion setting flips, GSAP reverts what init created,
 * the cleanup runs and init runs again with the new ctx.motionOK.
 *
 * ctx = {
 *   gsap, SplitText, motionOK, mobile (≤ 760 px), coarse (pointer: coarse), qa (?qa=1), lite (saveData / < 4g),
 *   internalNav (arrived by a view transition), m1: { play, holdName },
 *   ease: { out, inOut, ui, window, page }, dur(s) (× 0.85 at ≤ 760 px),
 *   reveal(els, { type: 'lines'|'photo'|'group' }), enter(el, { prepare, play, final, rootMargin }),
 *   heading(el, { now }), roll(el, text), skipOnInput(tl) → off(),
 *   loadFlip(), fontsReady(ms), decodeAll(imgs, ms), whenLoaded(img), own(els), onFinal(fn),
 *   setIntro({ timeline, replay }) (only used by __p24.seek under ?qa=1),
 *   vt: { internalNav, supported, name(el, name) },
 *   story, slot, spans, viewer, player   // components: present only on pages that list them in tools/pages.json;
 *                                        // a "lazy" component is a proxy whose methods return Promises
 * }
 *
 * Idle guarantee: the core runs no requestAnimationFrame loop; GSAP's ticker sleeps after 60 idle frames.
 * Units must not use repeat: -1, yoyo, <video loop>, setInterval or their own rAF loops. No console output. */
(function (w, d) {
  'use strict';

  var h = d.documentElement;
  var MQ_MOTION = '(prefers-reduced-motion: no-preference)';
  var MQ_REDUCE = '(prefers-reduced-motion: reduce)';
  var MQ_MOBILE = '(max-width: 760px)';
  var EASE = Object.freeze({ out: 'expo.out', inOut: 'power3.inOut', ui: 'power2.out', window: 'cubic-bezier(.65,0,.35,1)', page: 'cubic-bezier(.16,1,.3,1)' });
  var FLIP_SRC = 'vendor/Flip.min.js';
  var MOBILE_FACTOR = 0.85;
  var SKIP_TO_END_S = 0.25;

  var P24 = w.P24 = w.P24 || {};
  var units = [];
  var components = [];
  var finals = [];
  var errors = P24.errors = P24.errors || [];
  var qa = h.classList.contains('qa');

  function mq(q) { return w.matchMedia(q).matches; }
  function toArray(x) {
    if (!x) return [];
    if (x.nodeType === 1) return [x];
    return Array.prototype.slice.call(x);
  }
  function timeout(ms, value) { return new Promise(function (resolve) { setTimeout(function () { resolve(value); }, ms); }); }
  function report(id, err) {
    errors.push({ unit: id, message: String(err && err.message || err) });
    setTimeout(function () { throw err; }, 0); /* surfaces in the console without breaking the other units */
  }

  /* ---------------------------------------------------------------- small helpers */

  function own(els) { toArray(els).forEach(function (el) { el.classList.add('m-owned'); }); }

  function fontsReady(ms) {
    if (!d.fonts || !d.fonts.load) return Promise.resolve(true);
    return Promise.race([
      d.fonts.load('600 1em Eczar').then(function () { return true; }, function () { return false; }),
      timeout(ms == null ? 500 : ms, false)
    ]);
  }
  function whenLoaded(img) {
    if (!img) return Promise.resolve(false);
    if (img.complete && img.naturalWidth) return Promise.resolve(true);
    return new Promise(function (resolve) {
      img.addEventListener('load', function () { resolve(true); }, { once: true });
      img.addEventListener('error', function () { resolve(false); }, { once: true });
    });
  }
  function decodeOne(img) {
    if (!img) return Promise.resolve();
    if (img.decode) return img.decode();
    return whenLoaded(img);
  }
  function decodeAll(imgs, ms) {
    return Promise.race([
      Promise.all(toArray(imgs).map(decodeOne)).then(function () { return true; }, function () { return false; }),
      timeout(ms == null ? 600 : ms, false)
    ]);
  }
  function lite() {
    var c = w.navigator.connection;
    if (!c) return false;
    return !!c.saveData || /^(slow-2g|2g|3g)$/.test(c.effectiveType || '');
  }

  var flipPromise = null;
  function loadFlip() {
    if (w.Flip && w.gsap) { w.gsap.registerPlugin(w.Flip); return Promise.resolve(w.Flip); }
    if (flipPromise) return flipPromise;
    flipPromise = new Promise(function (resolve, reject) {
      var s = d.createElement('script');
      s.src = FLIP_SRC;
      s.async = true;
      s.onload = function () {
        if (!w.Flip || !w.gsap) { reject(new Error('Flip failed to load')); return; }
        w.gsap.registerPlugin(w.Flip);
        resolve(w.Flip);
      };
      s.onerror = function () { flipPromise = null; reject(new Error('Flip failed to load')); };
      d.head.appendChild(s);
    });
    return flipPromise;
  }

  function onFinal(fn) { if (typeof fn === 'function') finals.push(fn); }

  /* A start state is created only for an element whose first observation is FULLY BELOW the viewport, so nothing
   * visible (or above the viewport after a deep link, Back or scroll restore) is ever hidden. */
  function enter(el, o) {
    if (!el || !o || typeof o.play !== 'function' || !('IntersectionObserver' in w)) return;
    var state = 'unknown';
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (state === 'unknown') {
          var below = e.boundingClientRect.top >= (w.innerHeight || h.clientHeight);
          if (!below) { state = 'static'; io.disconnect(); return; }
          state = 'waiting';
          if (o.prepare) o.prepare(el);
          onFinal(function () { if (state === 'waiting') { state = 'done'; io.disconnect(); finish(); } });
          return;
        }
        if (state === 'waiting' && e.isIntersecting) { state = 'done'; io.disconnect(); o.play(el); }
      });
    }, { rootMargin: o.rootMargin || '0px 0px -15% 0px' });
    /* A jump (End, a #link, a restored scroll) can carry a waiting element from below the viewport to above it
     * without the observer ever reporting it; it is then shown at rest, never left in its start state. */
    var jumpTimer = 0;
    function onJump() {
      clearTimeout(jumpTimer);
      jumpTimer = setTimeout(function () {
        if (state !== 'waiting') { w.removeEventListener('scroll', onJump); return; }
        if (el.getBoundingClientRect().bottom <= 0) { state = 'done'; io.disconnect(); w.removeEventListener('scroll', onJump); finish(); }
      }, 150);
    }
    w.addEventListener('scroll', onJump, { passive: true });
    function finish() {
      if (o.final) { o.final(el); return; }
      el.style.opacity = ''; el.style.transform = ''; el.style.clipPath = ''; el.style.visibility = '';
    }
    io.observe(el);
  }

  function runFinals() {
    var g = w.gsap;
    if (g && g.globalTimeline) g.globalTimeline.getChildren(true, true, true).forEach(function (t) { if (t.progress() < 1) t.progress(1); });
    if (d.getAnimations) d.getAnimations().forEach(function (a) { try { if (a.effect && a.effect.getTiming().iterations !== Infinity) a.finish(); } catch (err) { /* not finishable */ } });
    finals.slice().forEach(function (fn) { try { fn(); } catch (err) { report('final', err); } });
  }
  w.addEventListener('beforeprint', runFinals);
  d.addEventListener('beforematch', runFinals, true);

  /* ---------------------------------------------------------------- skipOnInput (M1, exact list: CORE.md §3.2) */
  var MOD_KEY = /^(Shift|Control|Alt|Meta|F\d{1,2})$/;
  function skipOnInput(tl) {
    if (!tl) return function () {};
    var coarse = mq('(pointer: coarse)');
    var startY = w.scrollY;
    var down = null;
    var opt = { passive: true, capture: true };
    var done = false;
    var list = [['keydown', onKey]];
    if (coarse) list.push(['pointerdown', onDown], ['pointerup', onUp]);
    else list.push(['wheel', fire], ['pointerdown', fire], ['scroll', onScroll]);
    function off() {
      if (done) return;
      done = true;
      list.forEach(function (p) { w.removeEventListener(p[0], p[1], opt); });
    }
    function fire() {
      off();
      if (qa) { tl.progress(1); return; }
      var rem = tl.duration() - tl.time();
      if (rem > 0) tl.timeScale(Math.max(tl.timeScale(), rem / SKIP_TO_END_S));
    }
    function onKey(e) { if (!MOD_KEY.test(e.key || '')) fire(); }
    function onScroll() { if (Math.abs(w.scrollY - startY) > 8) fire(); }
    function onDown(e) { down = { x: e.clientX, y: e.clientY, t: e.timeStamp }; }
    function onUp(e) {
      if (!down) return;
      var near = Math.abs(e.clientX - down.x) <= 10 && Math.abs(e.clientY - down.y) <= 10;
      var quick = e.timeStamp - down.t <= 300;
      down = null;
      if (near && quick) fire();
    }
    list.forEach(function (p) { w.addEventListener(p[0], p[1], opt); });
    var prev = tl.eventCallback('onComplete');
    var params = tl.vars && tl.vars.onCompleteParams;
    tl.eventCallback('onComplete', function () { off(); if (prev) prev.apply(tl, params || []); });
    return off;
  }

  /* ---------------------------------------------------------------- lazy components
   * A page may list components as "lazy" in tools/pages.json: they are not in the page bundle. ctx.<name> is then a
   * proxy whose methods return Promises; the script loads on the first hover, focus or touch of a trigger, or on
   * the first click (which then opens it), or at idle 4 s after the load event. */
  var LAZY = {
    player: { sel: 'a[data-clip], button[data-clip]', methods: ['open', 'close', 'isOpen', 'manifest', 'rail', 'hoverPreview'] },
    viewer: { sel: 'a[data-view]', methods: ['open', 'close'] }
  };
  var lazyNames = (P24.lazyComponents || []).filter(function (n) { return !!LAZY[n]; });
  var lazyLoads = {};
  var lazyReady = {};
  function findComponent(name) {
    for (var i = 0; i < components.length; i++) if (components[i].name === name) return components[i];
    return null;
  }
  function loadComponent(name) {
    if (lazyLoads[name]) return lazyLoads[name];
    lazyLoads[name] = new Promise(function (resolve, reject) {
      var s = d.createElement('script');
      s.src = 'js/components/' + name + '.js';
      s.async = true;
      s.onload = function () {
        var c = findComponent(name);
        if (!c) { reject(new Error('component ' + name + ' did not register')); return; }
        var api = c.factory(P24.ctx || makeCtx(h.classList.contains('js-motion')));
        if (P24.ctx) P24.ctx[name] = api;
        resolve(api);
      };
      s.onerror = function () { lazyLoads[name] = null; reject(new Error('component ' + name + ' failed to load')); };
      d.head.appendChild(s);
    });
    return lazyLoads[name];
  }
  function proxy(name) {
    var p = { lazy: true };
    LAZY[name].methods.forEach(function (m) {
      p[m] = function () {
        var a = arguments;
        return loadComponent(name).then(function (api) { return api[m].apply(api, a); });
      };
    });
    return p;
  }
  lazyNames.forEach(function (name) {
    var sel = LAZY[name].sel;
    d.addEventListener('click', function (e) {
      if (lazyReady[name]) return;
      var t = e.target.closest && e.target.closest(sel);
      if (!t || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
      e.preventDefault();
      loadComponent(name).then(function (api) { api.open(t); }, function () { if (t.href) w.location.href = t.href; });
    });
    var warm = function (e) {
      if (lazyReady[name] || !e.target.closest || !e.target.closest(sel)) return;
      loadComponent(name).catch(function () { /* retried on click */ });
    };
    d.addEventListener('pointerover', warm, { passive: true });
    d.addEventListener('focusin', warm);
    d.addEventListener('touchstart', warm, { passive: true });
  });
  if (lazyNames.length) {
    w.addEventListener('load', function () {
      setTimeout(function () { lazyNames.forEach(function (n) { loadComponent(n).catch(function () { /* on demand */ }); }); }, 4000);
    }, { once: true });
  }

  /* ---------------------------------------------------------------- registry, ctx and boot */

  function makeCtx(motionOK) {
    var mobile = mq(MQ_MOBILE);
    var ctx = {
      gsap: w.gsap || null,
      SplitText: w.SplitText || null,
      motionOK: motionOK,
      mobile: mobile,
      coarse: mq('(pointer: coarse)'),
      qa: qa,
      lite: lite(),
      internalNav: h.classList.contains('vt-nav'),
      m1: { play: !h.classList.contains('m1-skip'), holdName: h.classList.contains('m1-type') },
      ease: EASE,
      dur: function (s) { return mq(MQ_MOBILE) ? s * MOBILE_FACTOR : s; },
      enter: enter,
      loadFlip: loadFlip,
      fontsReady: fontsReady,
      decodeAll: decodeAll,
      whenLoaded: whenLoaded,
      own: own,
      onFinal: onFinal,
      skipOnInput: skipOnInput,
      setIntro: function (intro) { P24.intro = intro || null; },
      vt: {
        internalNav: h.classList.contains('vt-nav'),
        supported: !!(P24._vt && P24._vt.supported),
        name: function (el, n) { if (P24._vt) P24._vt.name(el, n); }
      }
    };
    ctx.reveal = function (els, opts) { return P24._reveal ? P24._reveal(ctx, els, opts || {}) : undefined; };
    ctx.heading = function (el, opts) { return P24._type ? P24._type.heading(ctx, el, opts || {}) : undefined; };
    ctx.roll = function (el, text) {
      if (P24._type) return P24._type.roll(ctx, el, text);
      if (el) el.textContent = text;
      return undefined;
    };
    components.forEach(function (c) {
      try { ctx[c.name] = c.factory(ctx); } catch (err) { report('component:' + c.name, err); }
    });
    lazyNames.forEach(function (n) { if (!ctx[n]) ctx[n] = proxy(n); });
    return ctx;
  }

  function runUnits(motionOK) {
    var ctx = makeCtx(motionOK);
    P24.ctx = ctx;
    var cleanups = [];
    units.forEach(function (u) {
      try {
        var c = u.mod.init(ctx);
        if (typeof c === 'function') cleanups.push(c);
      } catch (err) {
        report(u.id, err);
        h.classList.remove('js-motion'); /* a failed unit must not leave anything hidden */
      }
    });
    return function () { cleanups.forEach(function (c) { try { c(); } catch (err) { report('cleanup', err); } }); };
  }

  P24.register = function (id, mod) {
    if (!id || !mod || typeof mod.init !== 'function') throw new Error('P24.register(id, { init }) expects an init function');
    if (units.some(function (u) { return u.id === id; })) throw new Error('P24.register: duplicate id ' + id);
    units.push({ id: id, mod: mod });
  };
  P24.component = function (name, factory) {
    if (!name || typeof factory !== 'function') throw new Error('P24.component(name, factory) expects a factory');
    if (components.some(function (c) { return c.name === name; })) throw new Error('P24.component: duplicate ' + name);
    components.push({ name: name, factory: factory });
    if (LAZY[name]) lazyReady[name] = true;
  };

  function boot() {
    if (P24.booted) return;
    P24.booted = true;
    var g = w.gsap;
    if (!g) { h.classList.remove('js-motion'); runUnits(false); return; }
    if (w.SplitText) g.registerPlugin(w.SplitText);
    g.config({ autoSleep: 60, nullTargetWarn: false });
    g.defaults({ ease: EASE.out, duration: 0.6 });
    var mm = g.matchMedia();
    P24.mm = mm;
    mm.add({ ok: MQ_MOTION, reduce: MQ_REDUCE }, function (c) {
      var ok = !!c.conditions.ok;
      h.classList.toggle('js-motion', ok);
      return runUnits(ok);
    });
  }

  P24.ease = EASE;
  P24.loadFlip = loadFlip;
  P24.finish = runFinals;

  /* QA hooks: only under ?qa=1, with no visible UI and no console output (P29 M1). */
  if (qa) {
    w.__p24 = {
      seek: function (t) {
        var i = P24.intro;
        if (!i || !i.timeline) return false;
        i.timeline.pause();
        i.timeline.seek(Number(t) || 0, false);
        return true;
      },
      state: function () {
        return {
          booted: !!P24.booted,
          motion: h.classList.contains('js-motion'),
          classes: h.className,
          intro: !!P24.intro,
          vtLog: (P24.vtLog || []).slice(),
          errors: errors.slice()
        };
      },
      finish: runFinals
    };
  }

  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', boot, { once: true });
  else setTimeout(boot, 0);
})(window, document);
