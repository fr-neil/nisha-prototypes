/* Prototype 22 · signature motion (SPEC.md §4). SHARED, READ-ONLY for page builders.
 *
 * S1 "The cue"      A red cue light leaves the hero's lower-third tick ([data-cue-source]) and lands
 *                   on the primary "Request availability" ([data-cue-target]): its tally flares, the
 *                   button takes one pulse, then rests lit (the landed state is the CSS default).
 *                   Once per session, after the first screen has painted. When the hero CTA scrolls
 *                   out of view, the header/dock CTA ([data-cue-header]) takes the cue (one ring).
 * S2 "Lower third"  Every .strap that starts off-screen wipes in once when it enters view.
 *
 * Designed stills: without JS, or with prefers-reduced-motion, nothing moves; tallies are lit and
 * straps are shown (CSS default). Plain script, no build step, no dependencies.
 */
(function () {
  'use strict';

  var doc = document;
  var root = doc.documentElement;
  var SEEN_KEY = 'p22-cue-seen';
  var CUED_MS = 1300; /* the arrival pulse (signature.css .is-cued, 1.1s) plays once, then the button rests lit */
  var reduce = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };

  function storage(fn) { try { return fn(window.sessionStorage); } catch (e) { return null; } }
  function motionOK() { return !reduce.matches && 'IntersectionObserver' in window; }
  function inView(el) {
    var r = el.getBoundingClientRect();
    return r.bottom > 0 && r.top < window.innerHeight && r.right > 0 && r.left < window.innerWidth;
  }
  function center(el) {
    var r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2 + window.scrollX, y: r.top + r.height / 2 + window.scrollY };
  }
  function ring(tally) {
    if (!tally || reduce.matches) return;
    var r = doc.createElement('span');
    r.className = 'cue-ring';
    tally.appendChild(r);
    window.setTimeout(function () { if (r.parentNode) r.parentNode.removeChild(r); }, 800);
  }
  function lightTarget(target, withRing) {
    root.classList.remove('cue-pending');
    var tally = target && target.querySelector('.tally');
    if (!tally) return;
    if (withRing) {
      ring(tally);
      target.classList.add('is-cued');
      window.setTimeout(function () { target.classList.remove('is-cued'); }, CUED_MS);
    }
  }

  /* ---------------------------------------------------------------- S1: the cue */
  function runCue() {
    var target = doc.querySelector('[data-cue-target]');
    var source = doc.querySelector('[data-cue-source]');
    if (!target) { root.classList.remove('cue-pending'); return; }

    var seen = storage(function (s) { return s.getItem(SEEN_KEY); });
    if (!motionOK() || seen || !source || !inView(target) || !inView(source) || !Element.prototype.animate) {
      lightTarget(target, false);
      return;
    }

    /* Start at the red tick of the strap (its left edge), else the centre of the source. */
    var strap = source.matches('.strap') ? source : source.querySelector('.strap');
    var from = center(source);
    if (strap) {
      var sr = strap.getBoundingClientRect();
      from = { x: sr.left + 2 + window.scrollX, y: sr.top + sr.height / 2 + window.scrollY };
    }
    var tally = target.querySelector('.tally') || target;
    var to = center(tally);

    /* Beat 1: her lower third's red tick lights and holds, so the eye finds where the cue starts. */
    if (strap) strap.classList.add('cue-armed');

    /* Beat 2: the cue leaves the tick with a short trail (a lead light and three fading echoes). */
    var dots = [0, 1, 2, 3].map(function (i) {
      var d = doc.createElement('span');
      d.className = i ? 'cue-dot cue-dot--trail' : 'cue-dot';
      d.setAttribute('aria-hidden', 'true');
      d.style.opacity = '0';
      doc.body.appendChild(d);
      return d;
    });

    /* A gentle arc: x eases out, y eases in-out, with a lift at the midpoint. */
    var lift = Math.min(160, Math.abs(to.x - from.x) * 0.35 + 40);
    var midX = from.x + (to.x - from.x) * 0.55;
    var midY = Math.min(from.y, to.y) - lift;
    function frames(peak) {
      return [
        { transform: 'translate(' + from.x + 'px,' + from.y + 'px) scale(0.5)', opacity: 0 },
        { transform: 'translate(' + from.x + 'px,' + from.y + 'px) scale(1)', opacity: peak, offset: 0.1 },
        { transform: 'translate(' + midX + 'px,' + midY + 'px) scale(1)', opacity: peak, offset: 0.56 },
        { transform: 'translate(' + to.x + 'px,' + to.y + 'px) scale(0.75)', opacity: peak, offset: 0.95 },
        { transform: 'translate(' + to.x + 'px,' + to.y + 'px) scale(0.5)', opacity: 0 }
      ];
    }
    var HOLD = 380;     /* the tick holds, lit, before the cue leaves */
    var FLIGHT = 1500;  /* long enough to follow with the eye, short enough not to hold up the page */
    var PEAKS = [1, 0.5, 0.3, 0.16];
    var anims = [];
    var landed = false;
    var timer = window.setTimeout(function () {
      dots.forEach(function (d, i) {
        var a = d.animate(frames(PEAKS[i]), { duration: FLIGHT, delay: i * 32, easing: 'cubic-bezier(0.45, 0, 0.2, 1)', fill: 'forwards' });
        anims.push(a);
        if (i === 0) a.onfinish = land;
      });
    }, HOLD);
    function land() {
      if (landed) return;
      landed = true;
      window.clearTimeout(timer);
      anims.forEach(function (a) { try { a.cancel(); } catch (e) { /* already finished */ } });
      dots.forEach(function (d) { if (d.parentNode) d.parentNode.removeChild(d); });
      if (strap) strap.classList.remove('cue-armed');
      lightTarget(target, true);
      storage(function (s) { s.setItem(SEEN_KEY, '1'); });
    }
    /* If the visitor scrolls or taps mid-flight, land immediately (never leave the tally dark). */
    window.addEventListener('scroll', land, { once: true, passive: true });
    window.addEventListener('pointerdown', land, { once: true, passive: true });
    window.setTimeout(land, HOLD + FLIGHT + 900);
  }

  /* Header / dock handover: stand-by while the hero CTA is visible, lit once it leaves. */
  function initHandover() {
    var target = doc.querySelector('[data-cue-target]');
    var headers = doc.querySelectorAll('[data-cue-header]');
    if (!target || !headers.length || !motionOK()) return;
    var wasVisible = null;
    var io = new IntersectionObserver(function (entries) {
      var visible = entries[0].isIntersecting;
      if (visible === wasVisible) return;
      if (visible) {
        root.classList.add('cue-standby');
      } else {
        root.classList.remove('cue-standby');
        if (wasVisible !== null) {
          Array.prototype.forEach.call(headers, function (h) {
            if (h.offsetParent !== null) ring(h.querySelector('.tally'));
          });
        }
      }
      wasVisible = visible;
    }, { threshold: 0 });
    io.observe(target);
  }

  /* ---------------------------------------------------------------- S2: lower third */
  function initStraps(scope) {
    if (!motionOK()) return;
    var straps = (scope || doc).querySelectorAll('.strap:not(.strap-armed):not([data-strap-static])');
    if (!straps.length) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting && e.intersectionRatio >= 0.5) {
          e.target.__strap.classList.add('is-in');
          io.unobserve(e.target);
        }
      });
    }, { threshold: [0, 0.5, 1] });
    Array.prototype.forEach.call(straps, function (s) {
      if (s.closest('[data-cue-source]')) return; /* the hero strap is part of the static first paint */
      if (inView(s)) return;                      /* already visible: never hide what has been seen */
      /* Observe the media frame, not the strap: a clip-path on the target skews its intersection ratio. */
      var host = s.parentElement || s;
      host.__strap = s;
      s.classList.add('strap-armed');
      io.observe(host);
    });
  }

  function init() {
    initStraps();
    initHandover();
    var start = function () { window.setTimeout(runCue, 450); };
    if (doc.readyState === 'complete') start();
    else window.addEventListener('load', start, { once: true });
  }

  /* Page scripts that render straps later can call P22Signature.straps(container). */
  window.P22Signature = { straps: initStraps, cue: runCue };

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init);
  else init();
})();
