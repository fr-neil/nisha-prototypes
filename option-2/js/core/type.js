/* Prototype 24 · M8 kinetic type, with restraint (P29 §2 M8). CORE-owned. Used through ctx.heading and ctx.roll.
 *
 * ctx.heading(el)              a section H2: lines rise in padded masks once, when it enters (0.7 s expo.out,
 *                              stagger 0.08; × 0.85 on phones). Only if its first observation is fully below the
 *                              viewport, so visible text is never hidden.
 * ctx.heading(el, { now: true }) an inner page's H1 on a direct load (desktop): it is held ≤ 300 ms by
 *                              html.h1-hold; if it is still held at boot it rises now, otherwise (fail-safe fired,
 *                              phones, view-transition arrival, reduced motion) it stays at rest. Never re-hidden.
 * ctx.roll(el, text)           a value that changes in place: the real text is updated first (it is the element
 *                              that rises in); the old words lift out 8 px on an aria-hidden copy. 0.3 s.
 * SplitText: aria 'auto', lines mask padded .18em (type.css); the split is reverted when the rise lands, so a
 * late font swap or a resize after it can never leave stale line boxes. (autoSplit is not used: with a revert on
 * complete it re-split a reverted instance and threw in SplitText 3.15.) Devanagari ([lang="hi"]) is never split. */
(function (w, d) {
  'use strict';
  var P24 = w.P24 = w.P24 || {};
  var ROLL_TRAVEL = 8;

  function hasDeva(el) { return !!(el.closest('[lang="hi"]') || el.querySelector('[lang="hi"]')); }

  function rise(ctx, el, done) {
    var g = ctx.gsap;
    var ST = ctx.SplitText;
    var dur = ctx.mobile ? 0.6 : 0.7;
    g.set(el, { autoAlpha: 1 });
    if (!ST || hasDeva(el)) {
      g.from(el, { y: ctx.mobile ? 12 : 20, autoAlpha: 0, duration: dur, ease: ctx.ease.out, clearProps: 'transform,opacity,visibility', onComplete: done });
      return;
    }
    var tween = null;
    var split = ST.create(el, {
      type: 'lines',
      mask: 'lines',
      linesClass: 'p24-line',
      aria: 'auto'
    });
    tween = g.from(split.lines, {
      yPercent: 110,
      duration: dur,
      stagger: 0.08,
      ease: ctx.ease.out,
      onComplete: function () { split.revert(); if (done) done(); }
    });
    return split;
  }

  function heading(ctx, el, opts) {
    if (!el || !ctx.motionOK || !ctx.gsap) return;
    var g = ctx.gsap;
    if (opts.now) {
      if (ctx.internalNav) return;                                  /* the CSS page-title rise is the entrance */
      if (w.getComputedStyle(el).opacity !== '0') return;             /* fail-safe fired, or never held: at rest */
      ctx.own(el);
      rise(ctx, el);
      return;
    }
    ctx.enter(el, {
      rootMargin: opts.rootMargin,
      prepare: function () { g.set(el, { autoAlpha: 0 }); },
      play: function () { rise(ctx, el); },
      final: function () { g.set(el, { clearProps: 'opacity,visibility' }); }
    });
  }

  function roll(ctx, el, text) {
    if (!el) return;
    text = text == null ? '' : String(text);
    if (el._p24roll) { el._p24roll.progress(1); el._p24roll = null; }
    var oldText = el.textContent;
    if (oldText === text) return;
    var g = ctx.gsap;
    if (!ctx.motionOK || !g || !el.isConnected || !oldText) { el.textContent = text; return; }
    el.classList.add('p24-roll');
    el.textContent = '';
    var next = d.createElement('span');
    next.className = 'p24-roll__new';
    next.textContent = text;
    var ghost = d.createElement('span');
    ghost.className = 'p24-roll__old';
    ghost.setAttribute('aria-hidden', 'true');
    ghost.textContent = oldText;
    el.appendChild(next);
    el.appendChild(ghost);
    var dur = ctx.dur(0.3);
    el._p24roll = g.timeline({
      onComplete: function () { el.textContent = text; el.classList.remove('p24-roll'); el._p24roll = null; }
    })
      .to(ghost, { y: -ROLL_TRAVEL, autoAlpha: 0, duration: dur * 0.7, ease: 'power2.in' }, 0)
      .from(next, { y: ROLL_TRAVEL, autoAlpha: 0, duration: dur, ease: ctx.ease.ui }, dur * 0.3);
  }

  P24._type = { heading: heading, roll: roll };
})(window, document);
