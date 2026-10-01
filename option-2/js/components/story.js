/* Prototype 24 · component: story (M5 v2 photo stories, P29 §2 M5). CORE-owned. ctx.story on pages that list "story".
 *
 *   var s = ctx.story(root, { readingLine, anchor, onChange }); s.go(frameId); s.destroy();
 *
 * Markup (CORE.md §4.1):
 *   [data-story]                          root (one per section)
 *     [data-story-block="1".."8"]         optional: a family / format block; data-story-key="<frameId>" (its key
 *                                         frame, default = its first step's first frame); data-story-label="Corporate"
 *     [data-story-rows="1".."8"]          the block's rows list (drives the CSS filmstrip marker)
 *     [data-story-step="f1 [f2]"]         a dated row that owns 1–2 frames; [data-story-label] inside = label slot
 *     [data-story-stage]                  a stage: at root level (one shared stage) and/or inside a block (its own
 *                                         stage). The engine uses the first stage that is displayed for the block.
 *       [data-story-static]               the unit's static first photo, shown until the engine is live (no blank)
 *       [data-story-caption]              optional: rolled to the frame's caption (M8 roll)
 *       [data-story-family]               optional: rolled to the block's data-story-label
 *     [data-story-strip="1".."8"]         filmstrip: a[data-story-thumb="<frameId>"] links to the full images
 *     <template data-story-frame="<frameId>" data-caption="…" [data-clip="<clipId>"] [data-group="…"]>
 *        <img src srcset sizes width height alt>
 *     </template>
 * The stage's photo area is .p24-story__area (created), sized by the unit with --story-h on the stage.
 *
 * Behaviour: IntersectionObservers are wake-ups only; the active marker is found by geometry (the last block top
 * or step top at or above the reading line). A change waits 150 ms of dwell, keeps each frame ≥ 0.7 s, and a
 * fast scroll yields one change to the latest row. A 2-frame row plays frame 1, holds 0.9 s, then frame 2, only
 * while it stays active. The window reshapes with a WAAPI clip-path (0.5 s) and the incoming layer fades in
 * (0.32 s) with a 16 px drift from the scroll direction; photos are never scaled. A frame that has not decoded waits (the current photo
 * stays). Tokens drop stale decodes. Blocks within one viewport are prefetched and decoded in turn. Reduced
 * motion: instant swaps. No rAF, no loops: timers are setTimeout; reconcile on scrollend or a 120 ms debounce. */
(function (w, d) {
  'use strict';
  var P24 = w.P24 = w.P24 || {};
  var DWELL_MS = 150;
  var HOLD_MS = 700;
  var PAIR_HOLD_MS = 900;
  var WINDOW_MS = 500;
  var FADE_MS = 320;
  var SETTLE_MS = 120;
  var RESIZE_MS = 150;
  var EASE_WINDOW = 'cubic-bezier(.65,0,.35,1)';

  function qsa(root, sel) { return Array.prototype.slice.call(root.querySelectorAll(sel)); }
  function shown(el) { return !!el && el.getClientRects().length > 0; }
  function frames(step) { return (step.getAttribute('data-story-step') || '').split(/\s+/).filter(Boolean); }
  function insetOf(box, area) {
    return 'inset(' + box.top + 'px ' + Math.max(0, area.w - box.left - box.w) + 'px ' + Math.max(0, area.h - box.top - box.h) + 'px ' + box.left + 'px)';
  }

  function factory(ctx) {
    return function story(root, opts) {
      if (!root) return { go: function () {}, destroy: function () {} };
      opts = opts || {};
      var motion = ctx.motionOK;
      var blocks = qsa(root, '[data-story-block]');
      var steps = qsa(root, '[data-story-step]');
      var templates = {};
      qsa(root, 'template[data-story-frame]').forEach(function (t) { templates[t.getAttribute('data-story-frame')] = t; });
      var stages = [];            /* { el, area, win, layers: {id: layer}, cur: layer|null, anims: [] } */
      var label = d.createElement('span');
      label.className = 'p24-inphoto';
      label.textContent = 'In the photo';
      var state = { marker: null, pending: null, frame: null, stage: null, last: 0, token: 0, pairTimer: 0, dwellTimer: 0, settleTimer: 0, resizeTimer: 0, live: false, forced: null };
      var observers = [];
      var offs = [];
      /* Markers in document order: each block's top (its key frame) and each step's top. */
      var markers = blocks.map(function (b) { return { el: b, block: b, step: null }; })
        .concat(steps.map(function (s) { return { el: s, block: s.closest('[data-story-block]'), step: s }; }))
        .sort(function (a, b) { return a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1; });

      function on(t, type, fn, o) { t.addEventListener(type, fn, o); offs.push(function () { t.removeEventListener(type, fn, o); }); }
      function vh() { return w.innerHeight || d.documentElement.clientHeight; }
      function lineFraction() {
        if (typeof opts.readingLine === 'number') return opts.readingLine;
        return ctx.mobile ? 0.6 : 0.5;
      }
      function blockOf(el) { return el.closest('[data-story-block]'); }
      function keyOf(block) {
        var k = block.getAttribute('data-story-key');
        if (k) return k;
        var s = block.querySelector('[data-story-step]');
        return s ? frames(s)[0] : null;
      }
      function stepFor(frameId) {
        for (var i = 0; i < steps.length; i++) if (frames(steps[i]).indexOf(frameId) > -1) return steps[i];
        return null;
      }

      /* ---------------------------------------------------------------- stages and layers */
      function stageRec(el) {
        for (var i = 0; i < stages.length; i++) if (stages[i].el === el) return stages[i];
        var area = el.querySelector('.p24-story__area');
        if (!area) {
          area = d.createElement('div');
          area.className = 'p24-story__area';
          var win = d.createElement('div');
          win.className = 'p24-story__window';
          area.appendChild(win);
          var stat = el.querySelector('[data-story-static]');
          if (stat && stat.parentNode === el) el.insertBefore(area, stat.nextSibling); else el.insertBefore(area, el.firstChild);
        }
        var rec = { el: el, area: area, win: area.querySelector('.p24-story__window'), layers: {}, cur: null, anims: [] };
        stages.push(rec);
        return rec;
      }
      function stageFor(block) {
        var own = block ? qsa(block, '[data-story-stage]').filter(shown)[0] : null;
        if (own) return stageRec(own);
        var shared = qsa(root, '[data-story-stage]').filter(function (s) { return !blockOf(s) && shown(s); })[0];
        return shared ? stageRec(shared) : null;
      }
      function areaSize(st) { return { w: st.area.clientWidth, h: st.area.clientHeight }; }
      function fit(layer, st) {
        var a = areaSize(st);
        var ar = layer.ar;
        var wd = a.w;
        var ht = a.w / ar;
        if (ht > a.h) { ht = a.h; wd = a.h * ar; }
        wd = Math.round(wd);
        ht = Math.round(ht);
        var anchor = opts.anchor || (ctx.mobile ? 'center' : 'bottom-left');
        var box = { w: wd, h: ht, left: anchor === 'center' ? Math.round((a.w - wd) / 2) : 0, top: anchor === 'center' ? Math.round((a.h - ht) / 2) : a.h - ht };
        layer.box = box;
        var s = layer.el.style;
        s.width = wd + 'px';
        s.height = ht + 'px';
        s.left = box.left + 'px';
        s.top = box.top + 'px';
        return box;
      }
      function layerFor(st, id) {
        if (st.layers[id]) return st.layers[id];
        var t = templates[id];
        if (!t) return null;
        var el = d.createElement('div');
        el.className = 'p24-story__layer';
        el.setAttribute('data-frame', id);
        el.appendChild(t.content.cloneNode(true));
        var img = el.querySelector('img');
        if (!img) return null;
        img.loading = 'eager';
        img.decoding = 'async';
        var clip = t.getAttribute('data-clip');
        if (clip) {
          el.setAttribute('data-flip-id', 'story-' + id);
          var play = d.createElement('a');
          play.className = 'p24-play';
          play.href = t.getAttribute('data-clip-href') || ('media/clips/' + clip + '.mp4');
          play.setAttribute('data-clip', clip);
          play.textContent = 'Play clip';
          play.setAttribute('aria-label', 'Play clip: ' + (t.getAttribute('data-caption') || clip));
          var grp = t.getAttribute('data-group');
          if (grp) el.setAttribute('data-group', grp);
          el.appendChild(play);
        }
        var wAttr = +img.getAttribute('width') || 4;
        var hAttr = +img.getAttribute('height') || 3;
        var layer = { id: id, el: el, img: img, ar: wAttr / hAttr, caption: t.getAttribute('data-caption') || '', ready: null, box: null };
        st.win.appendChild(el);
        fit(layer, st);
        layer.ready = img.decode ? img.decode().then(function () { return true; }, function () { return ctx.whenLoaded(img); }) : ctx.whenLoaded(img);
        st.layers[id] = layer;
        return layer;
      }
      /* Prefetch: build and decode a block's frames in turn (one at a time). */
      function prefetch(block) {
        var st = stageFor(block);
        if (!st) return;
        var ids = [];
        var key = block ? keyOf(block) : null;
        if (key) ids.push(key);
        (block ? qsa(block, '[data-story-step]') : steps).forEach(function (s) { frames(s).forEach(function (f) { if (ids.indexOf(f) < 0) ids.push(f); }); });
        ids.reduce(function (p, id) {
          return p.then(function () { var l = layerFor(st, id); return l ? l.ready : null; });
        }, Promise.resolve());
      }

      /* ---------------------------------------------------------------- showing a frame */
      function finishAnims(st) { st.anims.forEach(function (a) { try { a.finish(); } catch (e) { /* already done */ } }); st.anims = []; }

      function settle(st, layer, prev) {
        st.win.style.clipPath = insetOf(layer.box, areaSize(st));
        layer.el.style.clipPath = '';
        if (prev && prev !== layer) prev.el.classList.remove('is-on');
        layer.el.classList.remove('is-top');
      }

      function reshape(st, layer, dir) {
        var prev = st.cur;
        finishAnims(st);
        st.cur = layer;
        layer.el.classList.add('is-on');
        if (!motion || !prev || prev === layer || !st.win.animate) { settle(st, layer, prev); return; }
        var a = areaSize(st);
        layer.el.classList.add('is-top');
        var opt = { duration: WINDOW_MS, easing: EASE_WINDOW, fill: 'forwards' };
        var aw = st.win.animate([{ clipPath: insetOf(prev.box, a) }, { clipPath: insetOf(layer.box, a) }], opt);
        /* The incoming photo fades in over the outgoing one while it drifts 16 px from the scroll direction (a
         * translate, never a scale). A clip-path wipe spliced two photos (one person's head on another's body). */
        var al = layer.el.animate([{ opacity: 0, transform: 'translateY(' + (dir < 0 ? -16 : 16) + 'px)' }, { opacity: 1, transform: 'none' }], { duration: FADE_MS, easing: 'cubic-bezier(.2,0,0,1)', fill: 'forwards' });
        st.anims = [aw, al];
        aw.finished.then(function () {
          if (st.cur !== layer) return;
          settle(st, layer, prev);
          aw.cancel();
          al.cancel();
          st.anims = [];
        }, function () { /* finished early by an interruption: settle() ran there */ });
      }

      function decorate(layer, block) {
        var st = state.stage;
        var cap = st && st.el.querySelector('[data-story-caption]');
        if (cap) ctx.roll(cap, layer.caption);
        var fam = st && st.el.querySelector('[data-story-family]');
        if (fam && block && block.getAttribute('data-story-label')) ctx.roll(fam, block.getAttribute('data-story-label'));
        var row = stepFor(layer.id);
        if (row) (row.querySelector('[data-story-label]') || row).appendChild(label);
        else if (label.parentNode) label.parentNode.removeChild(label);
        steps.forEach(function (s) { s.classList.toggle('is-pictured', s === row); });
        var key = block ? block.getAttribute('data-story-block') : null;
        qsa(root, '[data-story-strip]').forEach(function (strip) { strip.classList.toggle('is-current', !key || strip.getAttribute('data-story-strip') === key); });
        qsa(root, '[data-story-thumb]').forEach(function (t) {
          var strip = t.closest('[data-story-strip]');
          var on = t.getAttribute('data-story-thumb') === layer.id && (!key || (!!strip && strip.getAttribute('data-story-strip') === key));
          t.classList.toggle('is-active', on);
          if (on) t.setAttribute('aria-current', 'true'); else t.removeAttribute('aria-current');
        });
        blocks.forEach(function (b) { b.classList.toggle('is-active', b === block); });
        if (typeof opts.onChange === 'function') opts.onChange({ frame: layer.id, step: row, block: block });
      }

      /* A stage goes live when it shows its own first frame: only then is its static photo hidden and its area
       * laid out (a stage further down keeps its static until then, so it is never blank). Layers created while
       * the area was not laid out measured 0 x 0, so the incoming and outgoing layers are re-fitted here. */
      function goLive(st, layer) {
        if (!state.live) { state.live = true; root.setAttribute('data-story-live', ''); }
        if (!st.el.hasAttribute('data-story-ready')) {
          st.el.setAttribute('data-story-ready', '');
          qsa(st.el, '[data-story-static]').forEach(function (s) { s.hidden = true; });
        }
        fit(layer, st);
        if (st.cur && st.cur !== layer) fit(st.cur, st);
      }

      function show(frameId, block, dir) {
        var st = stageFor(block);
        if (!st || !frameId) return;
        var layer = layerFor(st, frameId);
        if (!layer) return;
        var token = ++state.token;
        layer.ready.then(function (ok) {
          if (token !== state.token || !ok) return;
          state.stage = st;
          state.frame = frameId;
          state.last = Date.now();
          goLive(st, layer);
          reshape(st, layer, dir || 1);
          decorate(layer, block);
        });
      }

      /* ---------------------------------------------------------------- the active marker (geometry) */
      function candidate() {
        var r = root.getBoundingClientRect();
        if (r.bottom <= 0 || r.top >= vh()) return null;
        var line = vh() * lineFraction();
        var pick = null;
        markers.forEach(function (m) { if (m.el.getBoundingClientRect().top <= line) pick = m; });
        if (!pick) pick = markers[0] || null;
        return pick;
      }
      function sameMarker(a, b) { return !!a && !!b && a.el === b.el; }

      function apply(m, dir) {
        clearTimeout(state.pairTimer);
        state.marker = m;
        if (!m) return;
        var ids = m.step ? frames(m.step) : [keyOf(m.block)];
        show(ids[0], m.block, dir);
        if (ids.length > 1) {
          state.pairTimer = setTimeout(function () {
            if (sameMarker(state.marker, m)) show(ids[1], m.block, 1);
          }, WINDOW_MS + PAIR_HOLD_MS);
        }
      }

      function reconcile() {
        updateStuck();
        if (state.forced) return;
        var m = candidate();
        if (!m || sameMarker(m, state.marker)) { clearTimeout(state.dwellTimer); state.pending = null; return; }
        if (sameMarker(m, state.pending)) return; /* already dwelling on this marker: do not restart the clock */
        clearTimeout(state.dwellTimer);
        state.pending = m;
        state.dwellTimer = setTimeout(function () {
          state.pending = null;
          var now = candidate();
          if (!now || sameMarker(now, state.marker)) return;
          var wait = HOLD_MS - (Date.now() - state.last);
          if (wait > 0) { state.dwellTimer = setTimeout(function () { state.pending = null; reconcile(); }, wait); state.pending = now; return; }
          var dir = state.marker && (now.el.compareDocumentPosition(state.marker.el) & Node.DOCUMENT_POSITION_FOLLOWING) ? -1 : 1;
          apply(now, dir);
        }, DWELL_MS);
      }

      /* Phones: the dock hides while a block's stage is stuck under the header (P29 M5). */
      var stuck = false;
      function updateStuck() {
        var next = false;
        if (ctx.mobile && state.stage && blockOf(state.stage.el)) {
          var s = state.stage.el.getBoundingClientRect();
          var b = blockOf(state.stage.el).getBoundingClientRect();
          var top = parseFloat(w.getComputedStyle(state.stage.el).top) || 0;
          next = s.top <= top + 1 && b.bottom > s.bottom + 8;
        }
        if (next === stuck) return;
        stuck = next;
        d.documentElement.classList.toggle('story-stuck', stuck);
        d.dispatchEvent(new CustomEvent('p24:dock'));
      }

      function onScroll() {
        clearTimeout(state.settleTimer);
        state.forced = null;
        state.settleTimer = setTimeout(reconcile, SETTLE_MS);
      }
      function onResize() {
        clearTimeout(state.resizeTimer);
        state.resizeTimer = setTimeout(function () {
          stages.forEach(function (st) {
            finishAnims(st);
            Object.keys(st.layers).forEach(function (id) { fit(st.layers[id], st); });
            if (st.cur) st.win.style.clipPath = insetOf(st.cur.box, areaSize(st));
          });
          state.marker = null;
          reconcile();
        }, RESIZE_MS);
      }

      /* ---------------------------------------------------------------- filmstrip thumbs */
      function onThumb(e) {
        var t = e.target.closest && e.target.closest('[data-story-thumb]');
        if (!t || !root.contains(t) || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
        var row = stepFor(t.getAttribute('data-story-thumb'));
        if (!row) return;
        e.preventDefault();
        var y = w.scrollY + row.getBoundingClientRect().top - vh() * lineFraction() + 4;
        w.scrollTo({ top: Math.max(0, y), behavior: motion ? 'smooth' : 'auto' });
      }

      /* ---------------------------------------------------------------- wiring */
      if (!('IntersectionObserver' in w)) return { go: function () {}, destroy: function () {} };
      root.classList.add('p24-story');
      var wake = new IntersectionObserver(reconcile, { threshold: [0, 0.25, 0.5, 0.75, 1] });
      wake.observe(root);
      blocks.forEach(function (b) { wake.observe(b); });
      var pct = Math.round(lineFraction() * 100);
      var band = new IntersectionObserver(reconcile, { rootMargin: '-' + Math.max(0, pct - 5) + '% 0px -' + Math.max(0, 95 - pct) + '% 0px' });
      steps.forEach(function (s) { band.observe(s); });
      var pre = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) { if (e.isIntersecting) { pre.unobserve(e.target); prefetch(e.target === root ? null : e.target); } });
      }, { rootMargin: '100% 0px' });
      (blocks.length ? blocks : [root]).forEach(function (b) { pre.observe(b); });
      observers.push(wake, band, pre);
      on(w, 'scroll', onScroll, { passive: true });
      if ('onscrollend' in w) on(w, 'scrollend', reconcile, { passive: true });
      on(w, 'resize', onResize, { passive: true });
      on(root, 'click', onThumb);
      ctx.onFinal(function () { stages.forEach(finishAnims); });

      /* First frame: instant, as soon as its image has decoded (the static photo stays until then). */
      var initial = candidate() || (blocks[0] ? { el: blocks[0], block: blocks[0], step: null } : (steps[0] ? { el: steps[0], block: null, step: steps[0] } : null));
      if (initial) apply(initial, 1);

      return {
        go: function (frameId) {
          var row = stepFor(frameId);
          state.forced = frameId;
          show(frameId, row ? blockOf(row) : (blocks[0] || null), 1);
        },
        destroy: function () {
          observers.forEach(function (o) { o.disconnect(); });
          offs.forEach(function (f) { f(); });
          [state.pairTimer, state.dwellTimer, state.settleTimer, state.resizeTimer].forEach(clearTimeout);
          stages.forEach(function (st) { finishAnims(st); if (st.area.parentNode) st.area.parentNode.removeChild(st.area); st.el.removeAttribute('data-story-ready'); });
          if (label.parentNode) label.parentNode.removeChild(label);
          qsa(root, '[data-story-static]').forEach(function (s) { s.hidden = false; });
          steps.forEach(function (s) { s.classList.remove('is-pictured'); });
          blocks.forEach(function (b) { b.classList.remove('is-active'); });
          root.removeAttribute('data-story-live');
          root.classList.remove('p24-story');
          if (stuck) { d.documentElement.classList.remove('story-stuck'); d.dispatchEvent(new CustomEvent('p24:dock')); }
        }
      };
    };
  }

  if (P24.component) P24.component('story', factory);
})(window, document);
