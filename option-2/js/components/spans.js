/* Prototype 24 · component: spans (M7 v2 drawn lines, P29 §2 M7). CORE-owned. ctx.spans on pages that list "spans".
 *
 *   ctx.spans(root, { mode: 'bars' })   year spans: every [data-span-fill] draws from the left once (scaleX, 0.6 s
 *                                        Enter, stagger 0.08), then the [data-span-mark] occasion marks fade in
 *                                        (0.2 s). On phones each [data-span] item draws as it enters.
 *   ctx.spans(root, { mode: 'line' })   one [data-span-line] draws down once (scaleY, 0.8 s Enter) and each
 *                                        [data-span-step] turns to full ink as the line reaches it.
 * Start states only when the element is first seen fully below the viewport (ctx.enter), so nothing visible is
 * ever hidden. Reduced motion and no JS: drawn at rest (the static CSS). No numbers are rendered. */
(function (w) {
  'use strict';
  var P24 = w.P24 = w.P24 || {};

  function list(root, sel) { return Array.prototype.slice.call(root.querySelectorAll(sel)); }

  function bars(ctx, scope, stagger) {
    var g = ctx.gsap;
    var fills = list(scope, '[data-span-fill]');
    var marks = list(scope, '[data-span-mark]');
    if (scope.hasAttribute('data-span-fill')) fills = [scope];
    if (!fills.length) return;
    ctx.enter(scope, {
      prepare: function () { g.set(fills, { scaleX: 0, transformOrigin: '0% 50%' }); g.set(marks, { autoAlpha: 0 }); },
      play: function () {
        g.timeline()
          .to(fills, { scaleX: 1, duration: ctx.dur(0.6), ease: ctx.ease.out, stagger: stagger, clearProps: 'transform' })
          .to(marks, { autoAlpha: 1, duration: 0.2, ease: ctx.ease.ui, stagger: 0.03, clearProps: 'opacity,visibility' }, '-=0.25');
      },
      final: function () { g.set(fills.concat(marks), { clearProps: 'transform,opacity,visibility' }); }
    });
  }

  function line(ctx, root) {
    var g = ctx.gsap;
    var ln = root.querySelector('[data-span-line]');
    if (!ln) return;
    var stepsEls = list(root, '[data-span-step]');
    ctx.enter(root, {
      prepare: function () {
        g.set(ln, { scaleY: 0, transformOrigin: '50% 0%' });
        stepsEls.forEach(function (s) { s.classList.add('is-waiting'); });
      },
      play: function () {
        var top = ln.getBoundingClientRect().top;
        var hgt = Math.max(1, ln.offsetHeight);
        var at = stepsEls.map(function (s) { return Math.max(0, Math.min(1, (s.getBoundingClientRect().top - top) / hgt)); });
        g.to(ln, {
          scaleY: 1,
          duration: ctx.dur(0.8),
          ease: ctx.ease.out,
          clearProps: 'transform',
          onUpdate: function () {
            var p = g.getProperty(ln, 'scaleY');
            stepsEls.forEach(function (s, i) { if (p >= at[i]) s.classList.remove('is-waiting'); });
          },
          onComplete: function () { stepsEls.forEach(function (s) { s.classList.remove('is-waiting'); }); }
        });
      },
      final: function () { g.set(ln, { clearProps: 'transform' }); stepsEls.forEach(function (s) { s.classList.remove('is-waiting'); }); }
    });
  }

  function factory(ctx) {
    return function spans(root, opts) {
      if (!root || !ctx.motionOK || !ctx.gsap) return;
      opts = opts || {};
      if (opts.mode === 'line') { line(ctx, root); return; }
      var stagger = opts.stagger == null ? 0.08 : opts.stagger;
      if (ctx.mobile) {
        var items = list(root, '[data-span]');
        if (items.length) { items.forEach(function (it) { bars(ctx, it, 0); }); return; }
      }
      bars(ctx, root, stagger);
    };
  }

  if (P24.component) P24.component('spans', factory);
})(window);
