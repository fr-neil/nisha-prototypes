/* Prototype 24 · M2 reveals (P28 §4.2 M2, P29 §1.3). CORE-owned. Called through ctx.reveal(elOrEls, opts).
 *
 * Scope rule: only a section's H2 and its first photo or first group. NEVER CTAs, captions, record rows,
 * Asked-back rows or form content.
 *
 * opts.type:
 *   'lines' — a heading. SplitText lines in padded masks (.p24-line-mask), 0.7 s expo.out, stagger 0.08
 *             (0.6 s at 390). The split is reverted when it lands, so the DOM goes back to plain text.
 *   'photo' — a .p24-figure (or any element containing .p24-frame > img). The frame is revealed by a clip-path
 *             window from below and the image settles from a uniform 1.06 to 1.0 (P29 §1.3: no scale on a box
 *             that contains a photo; the image itself ends at 1.0). 0.8 s expo.out (× 0.85 at 390).
 *   'group' — a container; its element children rise 16 px (12 px at 390) and fade in, stagger 0.06.
 * opts.rootMargin overrides '0px 0px -15% 0px'. Start states follow §4.1 #6 (ctx.enter).
 * With reduced motion / no GSAP it does nothing: the static layout is the final state. */
(function (w) {
  'use strict';
  var P24 = w.P24 = w.P24 || {};

  function list(x) {
    if (!x) return [];
    if (x.nodeType === 1) return [x];
    return Array.prototype.slice.call(x);
  }

  function lines(ctx, el, opts) {
    if (ctx.heading) { ctx.heading(el, { rootMargin: opts.rootMargin }); return; }
    var g = ctx.gsap;
    var ST = ctx.SplitText;
    ctx.enter(el, {
      rootMargin: opts.rootMargin,
      prepare: function () { g.set(el, { autoAlpha: 0 }); },
      play: function () {
        g.set(el, { autoAlpha: 1 });
        if (!ST) { g.from(el, { y: ctx.mobile ? 12 : 20, autoAlpha: 0, duration: ctx.dur(0.7) }); return; }
        var split = ST.create(el, { type: 'lines', mask: 'lines', linesClass: 'p24-line', aria: 'auto' });
        g.from(split.lines, {
          yPercent: 110,
          duration: ctx.dur(0.7),
          stagger: 0.08,
          ease: ctx.ease.out,
          onComplete: function () { split.revert(); }
        });
      },
      final: function () { g.set(el, { clearProps: 'opacity,visibility' }); }
    });
  }

  function photo(ctx, el, opts) {
    var g = ctx.gsap;
    var frame = el.classList.contains('p24-frame') ? el : el.querySelector('.p24-frame') || el;
    var img = frame.querySelector('img, video');
    ctx.enter(el, {
      rootMargin: opts.rootMargin,
      prepare: function () {
        g.set(frame, { clipPath: 'inset(100% 0% 0% 0%)' });
        if (img) g.set(img, { scale: 1.06, transformOrigin: '50% 100%' });
      },
      play: function () {
        var open = function () {
          var d = ctx.dur(0.8);
          g.to(frame, { clipPath: 'inset(0% 0% 0% 0%)', duration: d, ease: ctx.ease.out, clearProps: 'clipPath' });
          if (img) g.to(img, { scale: 1, duration: d, ease: ctx.ease.out, clearProps: 'transform' });
        };
        /* Never open the window onto an empty frame (QA em-line): wait for the photo to decode. If it has not
         * decoded in 900 ms, show the figure at rest instead (no window), as it would be without JS. */
        if (!img || img.tagName !== 'IMG' || !ctx.decodeAll) { open(); return; }
        if (img.loading === 'lazy') img.loading = 'eager';
        ctx.decodeAll([img], 900).then(function (ok) {
          if (ok) { open(); return; }
          g.set(frame, { clearProps: 'clipPath' });
          g.set(img, { clearProps: 'transform' });
        });
      },
      final: function () {
        g.set(frame, { clearProps: 'clipPath' });
        if (img) g.set(img, { clearProps: 'transform' });
      }
    });
  }

  function group(ctx, el, opts) {
    var g = ctx.gsap;
    var kids = Array.prototype.slice.call(el.children);
    if (!kids.length) return;
    ctx.enter(el, {
      rootMargin: opts.rootMargin,
      prepare: function () { g.set(kids, { y: ctx.mobile ? 12 : 16, autoAlpha: 0 }); }, /* travel ≤ 24 px */
      play: function () {
        g.to(kids, {
          y: 0,
          autoAlpha: 1,
          duration: ctx.dur(0.7),
          stagger: opts.stagger == null ? 0.06 : opts.stagger,
          ease: ctx.ease.out,
          clearProps: 'transform,opacity,visibility'
        });
      },
      final: function () { g.set(kids, { clearProps: 'transform,opacity,visibility' }); }
    });
  }

  P24._reveal = function (ctx, els, opts) {
    if (!ctx.motionOK || !ctx.gsap) return;
    var type = opts.type || 'group';
    list(els).forEach(function (el) {
      if (type === 'lines') lines(ctx, el, opts);
      else if (type === 'photo') photo(ctx, el, opts);
      else group(ctx, el, opts);
    });
  };
})(window);
