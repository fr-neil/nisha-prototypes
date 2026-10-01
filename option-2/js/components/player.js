/* Prototype 24 · component: player (M4 v2, P29 §2 M4). CORE-owned. ctx.player on pages that list "player".
 *
 * Triggers: any <a> or <button> with data-clip="<manifest clip id>" (clicks are delegated; call preventDefault
 * first if you handle one yourself). The element that morphs is the nearest [data-flip-id] (the trigger, an
 * ancestor, or a descendant). data-group="<name>" (on the trigger or an ancestor) makes a group: the player then
 * shows "← Previous clip" / "Next clip →" through the group's clips in DOM order (unique clip ids).
 * Without JS the trigger stays what the unit authored (a native <video controls> or a link to the mp4).
 *
 * API: ctx.player.open(trigger, { group, clip, flipFrom, returnFocus }) · close() · isOpen() · manifest()
 *   (clip: open this clip id instead of the trigger's data-clip; flipFrom: the element the player grows out of and
 *   closes back into; returnFocus: where focus goes on close, unless Previous / Next moved to another clip)
 *      ctx.player.rail(videoEl, listEl)           Watch chapter rail (items: [data-in][data-out] seconds)
 *      ctx.player.hoverPreview(root, { selector }) muted 4 s previews on mouse hover only
 * Rules: one video plays at a time site-wide; "Sound on" stays disabled with [AUDIO — AWAITING REVIEW] until the
 * manifest's audioStatus reads "approved …"; ArrowLeft/Right change clip only when focus is not on a video,
 * input, select, textarea or [role=slider]; reduced motion: 150 ms fades, instant Previous/Next, no previews. */
(function (w, d) {
  'use strict';
  var P24 = w.P24 = w.P24 || {};
  var h = d.documentElement;
  var MANIFEST = 'media/manifest.json';
  var AUDIO_CHIP = '[AUDIO — AWAITING REVIEW]';
  var TRANSCRIPT_CHIP = '[TRANSCRIPT — TO BE PREPARED AND APPROVED]';
  var PREVIEW_DELAY_MS = 150;
  var PREVIEW_STOP_S = 4;
  var SLIDE_PX = 40;
  var READY_MS = 400;        /* Previous / Next waits at most this long for the next poster before it slides in */
  var CONTROLS_MS = 1500;    /* native controls come back when playback starts, or after this at the latest */

  var manifestPromise = null;
  var dlg = null;
  var ui = {};
  var current = null;
  var busy = false;
  var previewStops = [];     /* hover previews stop when the player opens */
  var ctlTimer = 0;

  /* ---------------------------------------------------------------- one video at a time */
  d.addEventListener('play', function (e) {
    var v = e.target;
    Array.prototype.forEach.call(d.querySelectorAll('video'), function (o) { if (o !== v && !o.paused) o.pause(); });
  }, true);

  function getManifest() {
    if (!manifestPromise) {
      manifestPromise = fetch(MANIFEST, { credentials: 'same-origin' })
        .then(function (r) { if (!r.ok) throw new Error('manifest ' + r.status); return r.json(); })
        .catch(function (err) { manifestPromise = null; throw err; });
    }
    return manifestPromise;
  }
  function clipList(m) { return Array.isArray(m.clips) ? m.clips : Object.keys(m.clips || {}).map(function (k) { return m.clips[k]; }); }
  function findClip(m, id) {
    var list = clipList(m);
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  function mobile() { return w.matchMedia('(max-width: 760px)').matches; }
  function scrimAlpha() { return mobile() ? 1 : 0.96; }
  function motionOK() { return h.classList.contains('js-motion') && !!w.gsap; }
  function approved(c) { return /^approved\b/i.test(c.audioStatus || '') && !!c.srcAudio; }
  function lite() { var c = w.navigator.connection; return !!(c && (c.saveData || /^(slow-2g|2g|3g)$/.test(c.effectiveType || ''))); }

  function el(tag, cls, text) {
    var n = d.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function btn(cls, text) {
    var b = el('button', 'p24-player__ctl ' + (cls || ''), text);
    b.type = 'button';
    return b;
  }

  /* ---------------------------------------------------------------- groups */
  function groupName(trigger, opts) {
    if (opts && opts.group) return opts.group;
    var g = trigger.closest('[data-group]');
    return g ? g.getAttribute('data-group') : null;
  }
  function groupMembers(name) {
    if (!name) return [];
    var seen = {};
    var out = [];
    Array.prototype.forEach.call(d.querySelectorAll('[data-clip]'), function (t) {
      var gEl = t.closest('[data-group]');
      if (!gEl || gEl.getAttribute('data-group') !== name) return;
      var row = t.closest('li'); /* a clip whose row is not displayed (e.g. filtered out) is left out of Previous / Next */
      if (row && !row.getClientRects().length) return;
      var id = t.getAttribute('data-clip');
      if (seen[id]) return;
      seen[id] = true;
      out.push(t);
    });
    return out;
  }

  /* ---------------------------------------------------------------- build once */
  function build() {
    if (dlg) return;
    dlg = el('dialog', 'p24-player');
    dlg.setAttribute('aria-labelledby', 'p24-player-title');

    var bar = el('div', 'p24-player__bar');
    ui.close = btn('p24-player__ctl--close', 'Close');
    ui.sound = el('span', 'p24-player__sound');
    ui.captions = btn('', 'Captions');
    ui.captions.setAttribute('aria-pressed', 'true');
    bar.appendChild(ui.close);
    bar.appendChild(ui.sound);
    bar.appendChild(ui.captions);

    var body = el('div', 'p24-player__body');
    ui.media = el('div', 'p24-player__media');
    ui.video = el('video');
    ui.video.muted = true;
    ui.video.setAttribute('muted', '');
    ui.video.playsInline = true;
    ui.video.setAttribute('playsinline', '');
    ui.video.controls = true;
    ui.video.preload = 'metadata';
    ui.video.setAttribute('controlslist', 'nodownload noplaybackrate noremoteplayback');
    ui.video.setAttribute('disablepictureinpicture', '');
    ui.track = el('track');
    ui.track.kind = 'captions';
    ui.track.srclang = 'en';
    ui.track.label = 'English';
    ui.video.appendChild(ui.track);
    ui.media.appendChild(ui.video);

    var meta = el('div', 'p24-player__meta');
    ui.title = el('h2', 'p24-player__title');
    ui.title.id = 'p24-player-title';
    ui.facts = el('dl', 'p24-player__facts');
    ui.notes = el('div', 'p24-player__notes');
    var cta = el('a', 'p24-link-arrow', 'Request availability →');
    cta.href = 'enquire.html#availability';
    cta.setAttribute('data-vt', 'cta-panel');
    meta.appendChild(ui.title);
    meta.appendChild(ui.facts);
    meta.appendChild(ui.notes);
    meta.appendChild(cta);

    ui.nav = el('div', 'p24-player__nav');
    ui.prev = btn('p24-player__step', '← Previous clip');
    ui.next = btn('p24-player__step', 'Next clip →');
    ui.nav.appendChild(ui.prev);
    ui.nav.appendChild(ui.next);
    meta.appendChild(ui.nav);

    body.appendChild(ui.media);
    body.appendChild(meta);
    dlg.appendChild(bar);
    dlg.appendChild(body);
    d.body.appendChild(dlg);

    ui.close.addEventListener('click', close);
    ui.prev.addEventListener('click', function () { step(-1); });
    ui.next.addEventListener('click', function () { step(1); });
    dlg.addEventListener('cancel', function (e) { e.preventDefault(); close(); });
    dlg.addEventListener('keydown', onKey);
    ui.captions.addEventListener('click', function () {
      var on = ui.captions.getAttribute('aria-pressed') !== 'true';
      ui.captions.setAttribute('aria-pressed', String(on));
      captionsMode(on);
    });
  }

  function onKey(e) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    var a = d.activeElement;
    if (a && (/^(VIDEO|INPUT|SELECT|TEXTAREA)$/.test(a.tagName) || a.getAttribute('role') === 'slider')) return;
    if (!current || !current.group.length) return;
    e.preventDefault();
    step(e.key === 'ArrowLeft' ? -1 : 1);
  }

  function fact(label, value) {
    var row = el('div');
    row.appendChild(el('dt', null, label));
    row.appendChild(el('dd', null, value));
    return row;
  }

  /* A fresh <track> per clip: re-pointing the old one's src left the previous clip's cues showing ("[No sound]" twice). */
  function resetTrack(c) {
    var old = ui.track;
    if (old && old.track) old.track.mode = 'disabled';
    if (old && old.parentNode) old.parentNode.removeChild(old);
    ui.track = el('track');
    ui.track.kind = 'captions';
    ui.track.srclang = 'en';
    ui.track.label = 'English';
    ui.track.default = true;
    if (c.vtt) ui.track.src = c.vtt;
    ui.video.appendChild(ui.track);
  }
  function captionsMode(on) { if (ui.track && ui.track.track) ui.track.track.mode = on ? 'showing' : 'hidden'; }
  /* Native controls are off while a clip loads (Chrome draws its spinner over her face) and return once it plays. */
  function controlsOff() {
    var v = ui.video;
    clearTimeout(ctlTimer);
    v.controls = false;
    v.addEventListener('playing', controlsOn, { once: true });
    ctlTimer = setTimeout(controlsOn, CONTROLS_MS);
  }
  function controlsOn() { clearTimeout(ctlTimer); if (ui.video) ui.video.controls = true; }
  /* Resolves when the clip's poster has decoded (it is what shows first), or after READY_MS at the latest. */
  function posterReady(c) {
    if (!c.poster || typeof Image === 'undefined') return Promise.resolve();
    var img = new Image();
    img.src = c.poster;
    var dec = img.decode ? img.decode().catch(function () { /* shows when it loads */ }) : Promise.resolve();
    return Promise.race([dec, new Promise(function (r) { setTimeout(r, READY_MS); })]);
  }

  function fill(c, animateTitle) {
    fillMeta(c, animateTitle);
    fillMedia(c);
  }
  function fillMeta(c, animateTitle) {
    var title = c.event || c.title || 'Clip'; /* the same heading as the clip cards */
    if (animateTitle && P24.ctx && P24.ctx.roll) P24.ctx.roll(ui.title, title);
    else ui.title.textContent = title;
    ui.facts.textContent = '';
    ui.facts.appendChild(fact('Client', c.client || 'Client not named'));
    if (c.place) ui.facts.appendChild(fact('Place', c.place));
    if (c.dateLabel || c.date) ui.facts.appendChild(fact('Date', c.dateLabel || c.date));

    ui.notes.textContent = '';
    if (/placeholder/i.test(c.captionsStatus || '') && c.hasAudio) ui.notes.appendChild(el('span', 'p24-ph', TRANSCRIPT_CHIP));

    ui.sound.textContent = '';
    if (approved(c)) {
      var s = btn('', 'Sound on');
      s.setAttribute('aria-pressed', 'false');
      s.addEventListener('click', function () { soundOn(c, s); });
      ui.sound.appendChild(s);
    } else if (c.hasAudio) {
      var dis = btn('', 'Sound on');
      dis.disabled = true;
      ui.sound.appendChild(dis);
      ui.sound.appendChild(d.createTextNode(' '));
      ui.sound.appendChild(el('span', 'p24-ph', AUDIO_CHIP));
    } else {
      ui.sound.appendChild(el('span', 'p24-player__nosound', 'No sound'));
    }

    ui.captions.hidden = !c.vtt;
  }
  function fillMedia(c) {
    var v = ui.video;
    controlsOff();
    v.poster = c.poster || '';
    if (c.w && c.h) { v.width = c.w; v.height = c.h; v.style.setProperty('--clip-w', c.w + 'px'); }
    v.setAttribute('aria-label', c.alt || c.posterAlt || '');
    resetTrack(c);
    v.src = c.src;
    if (c.inPoint) v.addEventListener('loadedmetadata', function () { try { v.currentTime = c.inPoint; } catch (e) { /* not seekable yet */ } }, { once: true });
    /* A placeholder transcript track starts off (QA: it covered the lower third of every demo); the chip in the
     * metadata panel still flags it, and Captions turns it on. Real and "[No sound]" tracks start on. */
    var capsOn = !/placeholder/i.test(c.captionsStatus || '');
    ui.captions.setAttribute('aria-pressed', String(capsOn));
    captionsMode(capsOn);
  }

  function soundOn(c, button) {
    var v = ui.video;
    var on = button.getAttribute('aria-pressed') !== 'true';
    var t = v.currentTime;
    v.src = on ? c.srcAudio : c.src;
    v.addEventListener('loadedmetadata', function () {
      try { v.currentTime = t; } catch (e) { /* not seekable yet */ }
      v.muted = !on;
      var p = v.play();
      if (p && p.catch) p.catch(function () { /* stays paused; the native controls remain */ });
    }, { once: true });
    button.setAttribute('aria-pressed', String(on));
    button.textContent = on ? 'Sound off' : 'Sound on';
  }

  function flipSource(trigger) {
    return trigger.closest('[data-flip-id]') || trigger.querySelector('[data-flip-id]') || trigger;
  }
  function play() {
    var p = ui.video.play();
    if (p && p.catch) p.catch(function () { controlsOn(); /* autoplay refused: the poster and native controls remain */ });
  }

  /* Previous / Next buttons: hidden outside a group; accessible names carry the neighbour's title. */
  function updateNav(m) {
    var grp = current.group;
    var i = current.index;
    var show = grp.length > 1;
    ui.nav.hidden = !show;
    if (!show) return;
    var prevT = grp[(i - 1 + grp.length) % grp.length];
    var nextT = grp[(i + 1) % grp.length];
    var pc = findClip(m, prevT.getAttribute('data-clip'));
    var nc = findClip(m, nextT.getAttribute('data-clip'));
    ui.prev.setAttribute('aria-label', 'Previous clip: ' + (pc ? pc.event || pc.title || pc.id : ''));
    ui.next.setAttribute('aria-label', 'Next clip: ' + (nc ? nc.event || nc.title || nc.id : ''));
  }

  function step(dir) {
    if (!current || busy || current.group.length < 2) return;
    var grp = current.group;
    var i = (current.index + dir + grp.length) % grp.length;
    var trigger = grp[i];
    busy = true;
    getManifest().then(function (m) {
      var c = findClip(m, trigger.getAttribute('data-clip'));
      if (!c) { busy = false; return; }
      var g = w.gsap;
      /* The old clip (frame, title, client) stays up until the next poster has decoded; then the frame and its facts
       * change together, so a title never sits over another clip's frame and the box is never empty for long. */
      var swap = function () {
        ui.video.pause();
        current.clip = c;
        current.trigger = trigger;
        current.returnFocus = null;
        current.source = flipSource(trigger);
        current.index = i;
        fill(c, motionOK());
        updateNav(m);
        play();
      };
      posterReady(c).then(function () {
        if (!current) { busy = false; return; }
        if (!motionOK()) { swap(); busy = false; return; }
        g.timeline({ onComplete: function () { busy = false; } })
          .to(ui.media, { x: -dir * SLIDE_PX, autoAlpha: 0, duration: 0.18, ease: 'power2.in' })
          .call(swap)
          .fromTo(ui.media, { x: dir * SLIDE_PX, autoAlpha: 0 }, { x: 0, autoAlpha: 1, duration: 0.27, ease: P24.ease ? P24.ease.inOut : 'power3.inOut', clearProps: 'transform,opacity,visibility' });
      });
    }, function () { busy = false; });
  }

  /* ---------------------------------------------------------------- open / close */
  function show(c, trigger, m, grpName, opts) {
    build();
    previewStops.forEach(function (f) { f(); });
    var source = (opts && opts.flipFrom) || flipSource(trigger);
    var grp = groupMembers(grpName);
    var idx = -1;
    for (var k = 0; k < grp.length; k++) if (grp[k].getAttribute('data-clip') === c.id) idx = k;
    current = { clip: c, trigger: trigger, source: source, group: idx > -1 ? grp : [], index: Math.max(0, idx), returnFocus: (opts && opts.returnFocus) || null };
    fill(c, false);
    updateNav(m);
    ui.media.setAttribute('data-flip-id', source.getAttribute('data-flip-id') || ('clip-' + c.id));
    var g = w.gsap;

    if (motionOK() && w.Flip) {
      var state = w.Flip.getState(source);
      dlg.setAttribute('data-phase', 'opening');
      dlg.showModal();
      play();
      g.fromTo(dlg, { backgroundColor: 'rgba(252,251,249,0)' }, { backgroundColor: 'rgba(252,251,249,' + scrimAlpha() + ')', duration: 0.3, ease: 'power2.out' });
      w.Flip.from(state, {
        targets: ui.media,
        scale: true,
        duration: 0.6,
        ease: 'power3.inOut',
        onComplete: function () { dlg.setAttribute('data-phase', 'open'); busy = false; }
      });
      return;
    }
    dlg.setAttribute('data-phase', 'open');
    dlg.showModal();
    play();
    if (g) g.fromTo(dlg, { opacity: 0 }, { opacity: 1, duration: 0.15, ease: 'none', clearProps: 'opacity', onComplete: function () { busy = false; } });
    else busy = false;
  }

  function open(trigger, opts) {
    if (!trigger || busy || (dlg && dlg.open)) return Promise.resolve(false);
    var id = (opts && opts.clip) || trigger.getAttribute('data-clip');
    if (!id) return Promise.resolve(false);
    busy = true;
    var needFlip = motionOK() && !w.Flip;
    return Promise.all([getManifest(), needFlip ? P24.loadFlip().catch(function () { return null; }) : null])
      .then(function (res) {
        var c = findClip(res[0], id);
        if (!c) throw new Error('No clip "' + id + '" in ' + MANIFEST);
        show(c, trigger, res[0], groupName(trigger, opts), opts);
        return true;
      })
      .catch(function (err) {
        busy = false;
        if (trigger.href) w.location.href = trigger.href; /* fall back to what the unit authored */
        setTimeout(function () { throw err; }, 0);
        return false;
      });
  }

  function finishClose() {
    var c = current;
    dlg.close();
    dlg.removeAttribute('data-phase');
    if (w.gsap) w.gsap.set([ui.media, dlg], { clearProps: 'all' });
    ui.video.pause();
    ui.video.removeAttribute('src');
    ui.video.load();
    controlsOn();
    current = null;
    busy = false;
    var back = c && (c.returnFocus && c.returnFocus.isConnected ? c.returnFocus : c.trigger);
    if (back && back.isConnected) back.focus({ preventScroll: true });
  }

  function close() {
    if (!dlg || !dlg.open || !current || busy) return;
    busy = true;
    ui.video.pause();
    clearTimeout(ctlTimer);
    ui.video.controls = false;
    ui.video.removeAttribute('src'); /* back to the poster, so the photo (not an empty frame) flies into the card */
    ui.video.load();
    var g = w.gsap;
    var src = current.source;
    var r = src && src.isConnected ? src.getBoundingClientRect() : null;
    var onScreen = r && r.width > 0 && r.bottom > 0 && r.top < w.innerHeight;
    if (motionOK() && w.Flip && onScreen) {
      dlg.setAttribute('data-phase', 'opening');
      g.to(dlg, { backgroundColor: 'rgba(252,251,249,0)', duration: 0.45, ease: 'power2.out' });
      w.Flip.fit(ui.media, src, { scale: true, duration: 0.45, ease: 'power3.inOut', onComplete: finishClose });
      return;
    }
    if (g) g.to(dlg, { opacity: 0, duration: 0.15, ease: 'none', onComplete: finishClose });
    else finishClose();
  }

  /* ---------------------------------------------------------------- Watch chapter rail */
  function rail(video, list) {
    if (!video || !list) return function () {};
    var items = Array.prototype.slice.call(list.querySelectorAll('[data-in]'));
    var active = null;
    var label = el('span', 'p24-rail__now', 'Now showing');
    items.forEach(function (it) {
      if (!it.querySelector('.p24-rail__bar')) {
        var b = el('span', 'p24-rail__bar');
        b.setAttribute('aria-hidden', 'true');
        it.appendChild(b);
      }
    });
    function range(it) { return [parseFloat(it.getAttribute('data-in')) || 0, parseFloat(it.getAttribute('data-out')) || 0]; }
    function barOf(it) { return it.querySelector('.p24-rail__bar'); }
    function jump(it, p) {
      var b = barOf(it);
      b.style.transition = 'none';
      b.style.transform = 'scaleX(' + p + ')';
      void b.offsetWidth; /* commit, so the bar never sweeps backwards */
      b.style.transition = '';
    }
    function setActive(it) {
      if (active === it) return;
      if (active) { active.removeAttribute('aria-current'); jump(active, 0); }
      active = it;
      if (!it) { if (label.parentNode) label.remove(); return; }
      it.setAttribute('aria-current', 'true');
      (it.querySelector('[data-rail-label]') || it).appendChild(label);
      var r = range(it);
      jump(it, Math.max(0, Math.min(1, (video.currentTime - r[0]) / Math.max(0.1, r[1] - r[0]))));
    }
    function onTime() {
      var t = video.currentTime;
      var hit = null;
      items.forEach(function (it) { var r = range(it); if (t >= r[0] && t < r[1]) hit = it; });
      setActive(hit);
      if (!hit) return;
      var r = range(hit);
      barOf(hit).style.transform = 'scaleX(' + Math.max(0, Math.min(1, (t - r[0]) / Math.max(0.1, r[1] - r[0]))) + ')';
    }
    function onSeek() { if (active) { var r = range(active); jump(active, Math.max(0, Math.min(1, (video.currentTime - r[0]) / Math.max(0.1, r[1] - r[0])))); } onTime(); }
    function onClick(e) {
      var it = e.target.closest('[data-in]');
      if (!it || !list.contains(it) || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
      e.preventDefault();
      var r = range(it);
      try { video.currentTime = r[0] + 0.01; } catch (err) { /* not seekable yet */ }
      setActive(it);
      var p = video.play();
      if (p && p.catch) p.catch(function () { /* stays paused */ });
    }
    video.addEventListener('timeupdate', onTime);
    video.addEventListener('seeking', onSeek);
    list.addEventListener('click', onClick);
    return function () {
      video.removeEventListener('timeupdate', onTime);
      video.removeEventListener('seeking', onSeek);
      list.removeEventListener('click', onClick);
      setActive(null);
    };
  }

  /* ---------------------------------------------------------------- hover previews (mouse only) */
  function hoverPreview(root, opts) {
    var sel = (opts && opts.selector) || '[data-clip]';
    if (!root || !motionOK() || lite() || !w.matchMedia('(hover: hover) and (pointer: fine)').matches) return function () {};
    var timer = 0;
    var token = 0;
    var pending = null;
    var live = null;
    function stop() {
      clearTimeout(timer);
      pending = null;
      token++;
      if (!live) return;
      var v = live.video;
      live = null;
      if (!v) return;
      v.pause();
      v.removeAttribute('src');
      v.load();
      v.remove();
    }
    function start(card) {
      stop();
      var mine = token;
      var frame = card.querySelector('[data-flip-id]') || card.closest('[data-flip-id]') || card;
      var src = card.getAttribute('data-preview-src') || (/\.mp4(#.*)?$/.test(card.getAttribute('href') || '') ? card.getAttribute('href') : null);
      /* After its 4 s the preview is removed, so the card shows its poster again (not someone else's last frame);
       * the card stays marked so the same hover does not start it again. */
      var ended = function (v) {
        if (!live || live.video !== v) return;
        stop();
        live = { card: card, video: null };
      };
      var go = function (url, from) {
        if (!url) return;
        var v = el('video', 'p24-preview');
        v.muted = true;
        v.playsInline = true;
        v.setAttribute('muted', '');
        v.setAttribute('playsinline', '');
        v.setAttribute('aria-hidden', 'true');
        v.preload = 'auto';
        v.addEventListener('loadedmetadata', function () {
          if (from > 0) { try { v.currentTime = from; } catch (e) { /* not seekable: plays from 0 */ } }
        }, { once: true });
        v.addEventListener('canplay', function () {
          if (!live || live.video !== v) return;
          v.classList.add('is-on');
          var p = v.play();
          if (p && p.catch) p.catch(function () { /* stays on the poster */ });
        }, { once: true });
        v.addEventListener('timeupdate', function () { if (v.currentTime >= (from || 0) + PREVIEW_STOP_S) ended(v); });
        v.addEventListener('ended', function () { ended(v); });
        v.src = url.split('#')[0];
        frame.appendChild(v);
        live = { card: card, video: v };
      };
      var attrIn = parseFloat(card.getAttribute('data-preview-in'));
      if (src && !isNaN(attrIn)) { go(src, attrIn); return; }
      getManifest().then(function (m) {
        var c = findClip(m, card.getAttribute('data-clip'));
        if (mine !== token) return;
        var from = !isNaN(attrIn) ? attrIn : (c && (c.previewIn || c.inPoint)) || 0;
        go(src || (c && c.src), from);
      }, function () { if (src && mine === token) go(src, 0); });
    }
    function onEnter(e) {
      var card = e.target.closest && e.target.closest(sel);
      if (!card || !root.contains(card) || e.pointerType !== 'mouse') return;
      if ((live && live.card === card) || pending === card) return;
      clearTimeout(timer);
      pending = card;
      timer = setTimeout(function () { pending = null; start(card); }, PREVIEW_DELAY_MS);
    }
    function onLeave(e) {
      var card = e.target.closest && e.target.closest(sel);
      if (!card) return;
      if (e.relatedTarget && card.contains(e.relatedTarget)) return;
      stop();
    }
    root.addEventListener('pointerover', onEnter);
    root.addEventListener('pointerout', onLeave);
    previewStops.push(stop);
    return function () {
      previewStops = previewStops.filter(function (f) { return f !== stop; });
      root.removeEventListener('pointerover', onEnter);
      root.removeEventListener('pointerout', onLeave);
      stop();
    };
  }

  /* ---------------------------------------------------------------- delegation and warm-up */
  d.addEventListener('click', function (e) {
    var t = e.target.closest && e.target.closest('a[data-clip], button[data-clip]');
    if (!t || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    open(t);
  });
  var warmed = false;
  function warm(e) {
    if (warmed || !e.target.closest || !e.target.closest('[data-clip]')) return;
    warmed = true;
    getManifest().catch(function () { /* retried on open */ });
    if (motionOK()) P24.loadFlip().catch(function () { /* open() falls back to a fade */ });
  }
  d.addEventListener('pointerover', warm, { passive: true });
  d.addEventListener('focusin', warm);
  d.addEventListener('touchstart', warm, { passive: true });

  var api = {
    open: open,
    close: close,
    isOpen: function () { return !!(dlg && dlg.open); },
    manifest: getManifest,
    rail: rail,
    hoverPreview: hoverPreview
  };
  P24.player = api;
  if (P24.component) P24.component('player', function () { return api; });
})(window, document);
