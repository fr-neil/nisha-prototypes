/* Prototype 24 · component: slot (M3 v2 preview slot, P29 §2 M3). CORE-owned. ctx.slot on pages that list "slot".
 * Extracted from the checkpoint's u3.js, with the checkpoint fix: no grey plate or outlined thumbnail at rest.
 *
 *   var s = ctx.slot(listRoot, { slotEl, rows: '[data-slot-row]', media: '[data-slot-media]' }); s.destroy();
 *
 * Each row holds one media element (default [data-slot-media]):
 *   <a data-slot-media data-kind="still|clip|none" href="<full jpg or mp4>" [data-clip="<id>"]
 *      data-cap="what · client · place · date" [data-title] [data-full-avif] [data-w] [data-h]><picture>…</picture></a>
 * The slot is a fixed box (slotEl) that never follows the pointer: it glides to the hovered or focused row
 * (0.45 s) and cross-fades (0.25 s) to that row's media. At rest it shows the top row's media and no row is marked.
 * Clips preview muted after 150 ms of mouse hover, stop at 4 s on their frame and unload on leave (never on focus,
 * never under reduced motion or saveData / slow connections). A photo in the slot opens ctx.viewer when present.
 * Does nothing when slotEl is not displayed (phones use the rows' own labelled thumbnails). */
(function (w, d) {
  'use strict';
  var P24 = w.P24 = w.P24 || {};
  var INTENT_MS = 150;
  var PREVIEW_STOP_S = 4;

  function factory(ctx) {
    return function slot(listRoot, opts) {
      opts = opts || {};
      var box = opts.slotEl;
      var noop = { destroy: function () {} };
      if (!listRoot || !box || !box.getClientRects().length) return noop;
      var rows = Array.prototype.slice.call(listRoot.querySelectorAll(opts.rows || '[data-slot-row]'));
      if (!rows.length) return noop;
      var mediaSel = opts.media || '[data-slot-media]';
      var g = ctx.gsap;
      var anim = ctx.motionOK && !!g;
      var previews = anim && !ctx.lite && w.matchMedia('(hover: hover) and (pointer: fine)').matches;
      var inner = box.querySelector('.p24-slot__inner');
      if (!inner) { inner = d.createElement('div'); inner.className = 'p24-slot__inner'; box.appendChild(inner); }
      var shownRow = null;
      var marked = null;
      var timer = 0;
      var video = null;
      var offs = [];
      function on(t, type, fn, o) { t.addEventListener(type, fn, o); offs.push(function () { t.removeEventListener(type, fn, o); }); }

      function pane(row) {
        var t = row.querySelector(mediaSel);
        var kind = t ? t.getAttribute('data-kind') : 'none';
        var fig = d.createElement('figure');
        fig.className = 'p24-slot__pane';
        fig.setAttribute('data-kind', kind);
        if (!t || kind === 'none') {
          var s = d.createElement('strong');
          s.textContent = t ? (t.getAttribute('data-title') || '') : '';
          fig.appendChild(s);
          fig.appendChild(d.createTextNode('Text only. No photograph or clip from these events is shown here.'));
          return fig;
        }
        var f = d.createElement(kind === 'clip' ? 'button' : 'a');
        f.className = 'p24-slot__frame';
        f.tabIndex = -1;
        if (kind === 'clip') {
          f.type = 'button';
          f.setAttribute('data-clip', t.getAttribute('data-clip'));
          f.setAttribute('data-flip-id', 'p24-slot');
          f.setAttribute('aria-label', 'Play clip');
        } else {
          f.href = t.getAttribute('href');
          f.setAttribute('data-slot-open', '');
        }
        var pic = t.querySelector('picture, img');
        if (pic) {
          pic = pic.cloneNode(true);
          var img = pic.tagName === 'IMG' ? pic : pic.querySelector('img');
          img.alt = '';
          img.loading = 'eager';
          /* The row's sizes describe its small thumbnail; in the slot the picture fills the panel, so pick from
           * the same srcset at the panel's width (sharp on 2x screens). */
          var sz = Math.round(box.clientWidth || 0);
          if (sz > 0) {
            img.sizes = sz + 'px';
            Array.prototype.forEach.call(pic.querySelectorAll ? pic.querySelectorAll('source') : [], function (so) { so.sizes = sz + 'px'; });
          }
          f.appendChild(pic);
        }
        if (kind === 'clip') {
          var p = d.createElement('span');
          p.className = 'p24-play';
          p.textContent = 'Play clip';
          f.appendChild(p);
        }
        var cap = d.createElement('figcaption');
        cap.className = 'p24-cap p24-cap--wrap';
        cap.textContent = t.getAttribute('data-cap') || '';
        fig.appendChild(f);
        fig.appendChild(cap);
        return fig;
      }

      function stopVideo() {
        clearTimeout(timer);
        if (!video) return;
        video.pause();
        video.removeAttribute('src');
        video.load();
        video.remove();
        video = null;
      }
      function startVideo(row) {
        var t = row.querySelector(mediaSel);
        var f = inner.querySelector('.p24-slot__pane:not([data-leaving]) .p24-slot__frame');
        if (!f || !t || t.getAttribute('data-kind') !== 'clip') return;
        var v = video = d.createElement('video');
        v.className = 'p24-preview';
        v.muted = true;
        v.playsInline = true;
        v.setAttribute('muted', '');
        v.setAttribute('playsinline', '');
        v.setAttribute('aria-hidden', 'true');
        v.preload = 'auto';
        v.addEventListener('canplay', function () {
          if (video !== v) return;
          v.classList.add('is-on');
          var pr = v.play();
          if (pr && pr.catch) pr.catch(function () { /* stays on the poster */ });
        }, { once: true });
        v.addEventListener('timeupdate', function () { if (v.currentTime >= PREVIEW_STOP_S) v.pause(); });
        v.src = (t.getAttribute('href') || '').split('#')[0];
        f.insertBefore(v, f.querySelector('.p24-play'));
      }

      function place(row, instant) {
        var max = Math.max(0, box.offsetHeight - inner.offsetHeight);
        var y = row === rows[0] ? 0 : Math.max(0, Math.min(row.offsetTop - rows[0].offsetTop, max));
        if (anim && !instant) g.to(inner, { y: y, duration: 0.45, ease: ctx.ease.inOut, overwrite: 'auto' });
        else if (g) g.set(inner, { y: y });
        else inner.style.transform = 'translateY(' + y + 'px)';
      }

      function showRow(row, instant) {
        if (row === shownRow) return;
        stopVideo();
        shownRow = row;
        Array.prototype.forEach.call(inner.querySelectorAll('.p24-slot__pane[data-leaving]'), function (n) { n.remove(); });
        var old = inner.querySelector('.p24-slot__pane');
        var next = pane(row);
        if (old) { old.setAttribute('data-leaving', ''); inner.insertBefore(next, old); } else inner.appendChild(next);
        if (anim && !instant && old) {
          g.fromTo(next, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.25, ease: ctx.ease.ui, clearProps: 'opacity,visibility' });
          g.to(old, { autoAlpha: 0, duration: 0.25, ease: ctx.ease.ui, onComplete: function () { old.remove(); } });
        } else if (old) old.remove();
        place(row, instant);
      }
      function mark(row) {
        if (marked === row) return;
        if (marked) marked.classList.remove('is-active');
        marked = row;
        if (row) row.classList.add('is-active');
      }
      function rest() { mark(null); showRow(rows[0]); }

      showRow(rows[0], true);
      rows.forEach(function (row) {
        on(row, 'pointerenter', function (e) {
          if (e.pointerType === 'touch') return;
          mark(row);
          showRow(row);
          if (!previews || video) return;
          clearTimeout(timer);
          timer = setTimeout(function () { if (shownRow === row && marked === row) startVideo(row); }, INTENT_MS);
        });
        on(row, 'focusin', function () { mark(row); showRow(row); });
        on(row, 'focusout', function (e) { if (!e.relatedTarget || !row.contains(e.relatedTarget)) mark(null); });
      });
      on(listRoot, 'pointerleave', function (e) { if (e.pointerType !== 'touch') { stopVideo(); rest(); } });
      on(inner, 'click', function (e) {
        var a = e.target.closest('[data-slot-open]');
        if (!a || !ctx.viewer || e.button !== 0 || e.metaKey || e.ctrlKey) return;
        var t = shownRow && shownRow.querySelector(mediaSel + '[data-kind="still"]');
        if (!t) return;
        e.preventDefault();
        ctx.viewer.open(t, { from: a });
      });
      on(w, 'resize', function () { if (shownRow) place(shownRow, true); }, { passive: true });

      return {
        destroy: function () {
          stopVideo();
          offs.forEach(function (f) { f(); });
          mark(null);
          inner.textContent = '';
          if (g) g.set(inner, { clearProps: 'transform' });
        }
      };
    };
  }

  if (P24.component) P24.component('slot', factory);
})(window, document);
