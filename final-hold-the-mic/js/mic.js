

(function boot(fn) { if (window.requestAnimationFrame) requestAnimationFrame(function () { setTimeout(fn, 0); }); else fn(); })(function () {
  'use strict';
  var doc = document, root = doc.documentElement;
  root.classList.remove('no-js'); root.classList.add('js');

  var reduceMQ = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  var INK = '#1B1815', RED = '#C8102E';
  var BRACKETED = /\[[^\]]*\]/;          
  var SHORT_TAP_MS = 380;
  var TOUCH_HOLD_DELAY_MS = 120;         
  var TOUCH_SLOP_PX = 10;                
  var FIRST_HINT_DELAY_MS = 1400, UNLOCK_HINT_MS = 3600, KEEP_HINT_MS = 2600, PULSE_MS = 1000;
  var ENV_PER_SEC = 120;
  var JUMP_S = 2;                        
  var MIN_VISIBLE = 0.2;                
  var KEY_HELD = 'ns-held', KEY_CC = 'ns-cc';
  var SWIPE_MIN_VISIBLE = 0.5;          
  var SETTLE_MS = 800;
  var CC_TAIL_S = 0.5;                   
  var noop = function () {};

  function fmt(t) { t = Math.max(0, Math.floor(t + 0.001)); return Math.floor(t / 60) + ':' + ('0' + (t % 60)).slice(-2); }
  function store(k, v) {
    try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; }
    return null;
  }
  function seek(v, t) { try { v.currentTime = t; } catch (e) {  } }
  function quiet(p) { if (p && p.catch) p.catch(noop); return p; }

  var isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (navigator.audioSession) { try { navigator.audioSession.type = 'playback'; } catch (e) {  } }
  var AC = window.AudioContext || window.webkitAudioContext;

  var canGraph = !!AC && /^https?:$/.test(location.protocol) && !(isIOS && !navigator.audioSession);
  var actx = null, analyser = null, tbuf = null;
  var moments = [], active = null, rafId = 0;

  function route(m) {
    if (!actx || m.src) return;
    try {
      m.src = actx.createMediaElementSource(m.video);
      m.gain = actx.createGain();
      m.src.connect(m.gain); m.gain.connect(analyser);
    } catch (e) { m.src = null; m.gain = null; }
  }
  function ensureGraph() {
    if (!canGraph) return;
    if (!actx) {
      try {
        actx = new AC();
        analyser = actx.createAnalyser(); analyser.fftSize = 1024;
        analyser.connect(actx.destination);
        tbuf = new Float32Array(analyser.fftSize);
      } catch (e) { canGraph = false; actx = null; return; }
    }
    moments.forEach(route);
  }
  function resumeAudio() { if (actx && actx.state === 'suspended') quiet(actx.resume()); }

  function Wave(canvas, originFn) {
    this.c = canvas; this.ctx = canvas.getContext('2d'); this.origin = originFn;
    this.N = 900; this.h = new Float32Array(this.N); this.head = 0; this.count = 0;
    this.agc = 0.08; this.color = INK; this.alpha = 1; this.full = null; this.progress = 0; this.level = 0;
    this.resize();
  }
  Wave.prototype.resize = function () {
    var dpr = Math.min(window.devicePixelRatio || 1, 2), r = this.c.getBoundingClientRect();
    this.w = r.width; this.hh = r.height; this.dpr = dpr;
    this.c.width = Math.max(1, Math.round(r.width * dpr)); this.c.height = Math.max(1, Math.round(r.height * dpr));
    this.draw();
  };
  Wave.prototype.push = function (v) { this.h[this.head] = v; this.head = (this.head + 1) % this.N; if (this.count < this.N) this.count++; };
  Wave.prototype.sample = function (k) { return this.h[(this.head - 1 - k + this.N * 2) % this.N]; };
  Wave.prototype.reset = function () { this.count = 0; this.head = 0; this.h.fill(0); this.draw(); };
  Wave.prototype.draw = function () {
    var ctx = this.ctx, w = this.w, h = this.hh, mid = h / 2, ox = this.origin(), step = w < 600 ? 2.6 : 3.2;
    var amp = Math.min(h * 0.32, w < 600 ? 20 : 40), k, x, y, a;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.globalAlpha = this.alpha;
    if (this.full) { this.drawPrint(ctx, w, mid, amp, ox, step); ctx.globalAlpha = 1; return; }
    ctx.strokeStyle = this.color; ctx.lineWidth = this.color === RED ? 1.6 : 1;
    ctx.beginPath();
    ctx.moveTo(ox, mid);                                   
    for (k = 0, x = ox; x <= w + step; k++, x += step) {
      a = k < this.count ? this.sample(k) : 0;
      y = mid + a * amp * (0.3 + 0.7 * Math.exp(-(x - ox) / 640));
      ctx.lineTo(x, y);
    }
    ctx.moveTo(ox, mid);                                   
    for (k = 0, x = ox; x >= -step; k++, x -= step) {
      a = k < this.count ? this.sample(k) : 0;
      y = mid - a * amp * 0.7 * Math.exp(-(ox - x) / 260);
      ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  };

  Wave.prototype.drawPrint = function (ctx, w, mid, amp, ox, step) {
    var env = this.full, n = env.length, span = Math.max(1, w - ox - 8), cut = ox + span * this.progress;
    function path(x0, x1) {
      var x, i;
      ctx.beginPath(); ctx.moveTo(x0, mid);
      for (x = x0; x <= x1; x += step) {
        i = Math.max(0, Math.min(n - 1, Math.floor((x - ox) / span * (n - 1))));
        ctx.lineTo(x, x < ox ? mid : mid + Math.tanh(env[i] / 99 * 1.1) * amp * (i % 2 ? -0.7 : 0.7));
      }
      ctx.stroke();
    }
    ctx.lineWidth = 1; ctx.strokeStyle = INK; ctx.globalAlpha = 0.3 * this.alpha; path(0, w);
    ctx.globalAlpha = this.alpha; ctx.lineWidth = 1.5; ctx.strokeStyle = this.progress > 0 ? RED : INK; path(0, Math.max(ox, cut));
  };

  var hintOwner = null, hintTimer = 0;
  function hint(m, kind, ms) {
    clearTimeout(hintTimer);
    if (hintOwner && (hintOwner !== m || !kind)) { hintOwner.hintEl.classList.remove('show'); hintOwner = null; }
    if (!kind || !m || !m.hintEl) return;
    m.hintEl.setAttribute('data-say', kind); m.hintEl.classList.add('show'); hintOwner = m;
    if (ms) hintTimer = setTimeout(function () { hint(null); }, ms);
  }

  function prime(m) {
    if (m.state !== 'still' && m.state !== 'frozen') return null;
    var v = m.video, at = v.currentTime;
    if (!m.gain && isIOS) return primeInline(m);         
    if (m.gain) m.gain.gain.value = 0; else { try { v.volume = 0; } catch (e) {  } }
    v.muted = false;
    var restore = function (ok) {
      if (m.state !== 'live') { v.pause(); seek(v, at); }
      if (m.gain) m.gain.gain.value = 1; else { try { v.volume = 1; } catch (e) {  } }
      m.primed = ok; if (ok) m.soundOk = true;
      return ok;
    };
    var p;
    try { p = v.play(); } catch (e) { p = null; }
    if (p && p.then) return p.then(function () { return restore(true); }, function () { return restore(false); });
    return Promise.resolve(restore(false));
  }

  function primeInline(m) {
    var v = m.video, p;
    v.muted = false;
    try { p = v.play(); } catch (e) { p = null; }
    v.pause();
    var done = function (ok) { m.primed = ok; if (ok) m.soundOk = true; return ok; };
    if (p && p.then) return p.then(function () { return done(true); }, function (err) { return done(!!err && err.name === 'AbortError'); });
    return Promise.resolve(done(false));
  }

  var conn = navigator.connection || {};
  var leanData = !!conn.saveData || /(^|-)2g$|^3g$/.test(conn.effectiveType || '');
  var gestureSeen = false;
  function primeOnGesture(e) {
    gestureSeen = true;
    if (e.target && e.target.closest && e.target.closest('.mic-btn')) return;   
    ensureGraph(); resumeAudio();
    var hero = moments.filter(function (m) { return m.isHero; })[0];
    var p = isIOS && !leanData && hero && !hero.primed && !hero.soundOk ? prime(hero) : null;
    if (p && p.then) p.then(syncTapState, syncTapState);
    syncTapState();
  }

  var coarse = window.matchMedia ? matchMedia('(hover: none) and (pointer: coarse)') : { matches: false };
  function needsTap(m) {
    if (m.soundOk) return false;
    if (isIOS) return !m.primed;
    var ua = navigator.userActivation;
    return ua ? !ua.hasBeenActive : !gestureSeen;
  }
  function syncTapState() {
    moments.forEach(function (m) { m.el.classList.toggle('hold-ok', !needsTap(m)); });
  }
  doc.addEventListener('touchend', primeOnGesture, true);
  doc.addEventListener('click', primeOnGesture, true);
  ['touchend', 'click', 'keydown'].forEach(function (type) { doc.addEventListener(type, resumeAudio, true); });

  function Moment(el) {
    var self = this;
    this.el = el; this.id = el.getAttribute('data-clip'); this.isHero = el.classList.contains('hero');
    this.start = parseFloat(el.getAttribute('data-start')) || 0;
    this.len = parseFloat(el.getAttribute('data-len')) || 0;
    this.cleanFrom = parseFloat(el.getAttribute('data-clean-from')) || 0;   
    this.verified = el.getAttribute('data-verified') === 'true';

    this.verifiedUntil = parseFloat(el.getAttribute('data-verified-until')) || Infinity;
    this.plain = el.getAttribute('data-captions') === 'plain';
    this.row = el.parentElement && el.parentElement.classList.contains('swipe') ? el.parentElement : null;
    this.endTag = el.getAttribute('data-end-tag') || 'Finished';
    this.video = el.querySelector('.vid'); this.btn = el.querySelector('.mic-btn');
    this.toggleBtn = el.querySelector('.toggle'); this.timeEl = el.querySelector('.time');
    this.lenLabel = this.timeEl ? this.timeEl.textContent.trim() : '';
    this.tagEl = el.querySelector('.tc-t'); this.prog = el.querySelector('.prog circle');
    this.status = el.querySelector('.status'); this.hintEl = el.querySelector('.hint');
    this.endLink = el.querySelector('.end-link');
    this.said = el.querySelector('.said');
    this.sBefore = this.said ? this.said.querySelector('.before') : null;
    this.sNow = this.said ? this.said.querySelector('.now') : null;
    this.sGloss = this.said ? this.said.querySelector('.gloss') : null;
    this.ccLine = el.querySelector('.cc-line');
    this.ccMain = this.ccLine ? this.ccLine.querySelector('.cc-main') : null;
    this.ccGloss = this.ccLine ? this.ccLine.querySelector('.cc-gloss') : null;
    this.eqBars = el.querySelectorAll('.eq i');
    this.cues = []; this.cueIdx = -2; this.words = [];
    var envAll = (window.MIC_ENV || {})[this.id] || null;
    this.env = envAll && this.len ? envAll.slice(0, Math.ceil(this.len * ENV_PER_SEC)) : envAll;
    this.state = 'still'; this.by = null; this.src = null; this.gain = null; this.downAt = 0;
    this.video.removeAttribute('controls');
    this.video.setAttribute('tabindex', '-1'); this.video.setAttribute('aria-hidden', 'true');
    this.video.disablePictureInPicture = true;
    this.loadCues();
    var lineEl = el.querySelector('.line');
    this.wave = new Wave(lineEl, function () {
      var b = self.btn.getBoundingClientRect(), c = lineEl.getBoundingClientRect();
      return b.left - c.left + b.width / 2;
    });
    if (reduceMQ.matches && this.env) this.wave.full = this.env;
    this.wave.draw();
    this.video.addEventListener('loadedmetadata', function () { if (self.state === 'still' && self.start) seek(self.video, self.start); });
    this.video.addEventListener('waiting', function () { self.waiting = true; self.renderTime(); });
    this.video.addEventListener('playing', function () { self.waiting = false; self.renderTime(); });
    this.video.addEventListener('canplay', function () { self.waiting = false; });
    if (this.video.readyState >= 1 && this.start) seek(this.video, this.start);

    this.video.addEventListener('ended', function () {
      if (self.state === 'live' && !(self.lastFrameT !== undefined && self.len - self.lastFrameT > JUMP_S)) self.end();
    });
    this.bind();
    this.setState('still');
  }

  Moment.prototype.loadCues = function () {
    var self = this, trs = this.video.querySelectorAll('track'), main = null, gloss = null, i;
    for (i = 0; i < trs.length; i++) {
      if (trs[i].track) trs[i].track.mode = 'hidden';
      if (trs[i].getAttribute('data-role') === 'gloss') gloss = trs[i]; else if (!main) main = trs[i];
    }
    if (!main || !main.track) return;
    function glossFor(c) {
      var g = gloss && gloss.track && gloss.track.cues, k;
      if (!g) return '';
      for (k = 0; k < g.length; k++) { if (Math.abs(g[k].startTime - c.startTime) < 0.3) return g[k].text.replace(/\s+/g, ' ').trim(); }
      return '';
    }
    function build() {
      var list = main.track.cues, out = [], k, c, t, g;
      if (!list || !list.length) return;
      for (k = 0; k < list.length; k++) {
        c = list[k]; t = c.text.replace(/\s+/g, ' ').trim(); g = glossFor(c);
        out.push({ s: c.startTime, e: c.endTime, t: t, g: g, skip: BRACKETED.test(t) || BRACKETED.test(g) });
      }
      self.cues = out; self.cueIdx = -2;
      if (self.state !== 'still') self.tick('cue');
    }
    main.addEventListener('load', build);
    if (gloss) gloss.addEventListener('load', build);
    build();
  };
  Moment.prototype.firstWordAt = function () {
    for (var i = 0; i < this.cues.length; i++) { if (!this.cues[i].skip) return this.cues[i].s; }
    return this.start;
  };

  Moment.prototype.warm = function () {
    var v = this.video;
    if (v.preload === 'auto' || !v.paused) return;
    v.preload = 'auto';
    if (v.readyState === 0) { try { v.load(); } catch (e) {  } }
  };
  Moment.prototype.bind = function () {
    var self = this, btn = this.btn;

    function hover(e) { if (e.pointerType === 'mouse' || e.pointerType === 'pen') self.warm(); }
    btn.addEventListener('pointerenter', hover, { passive: true });
    btn.addEventListener('focus', function () { self.warm(); }, { passive: true });
    if (this.toggleBtn) this.toggleBtn.addEventListener('pointerenter', hover, { passive: true });

    var touchStart = null, touchTimer = 0;
    function cancelPending() { clearTimeout(touchTimer); touchTimer = 0; touchStart = null; }
    btn.addEventListener('pointerdown', function (e) {
      if (e.button !== undefined && e.button > 0) return;
      self.downAt = performance.now(); self.pointerType = e.pointerType;
      if (e.pointerType === 'mouse') {
        self.warm();
        e.preventDefault();
        try { btn.setPointerCapture(e.pointerId); } catch (err) {  }
        self.hold('pointer');
        return;
      }
      cancelPending();
      touchStart = { x: e.clientX, y: e.clientY, id: e.pointerId, tapOnly: needsTap(self) };
      if (touchStart.tapOnly) return;                 
      touchTimer = setTimeout(function () {
        touchTimer = 0;
        if (!touchStart) return;
        try { btn.setPointerCapture(touchStart.id); } catch (err) {  }
        self.hold('pointer');
      }, TOUCH_HOLD_DELAY_MS);
    });
    btn.addEventListener('pointermove', function (e) {
      if (!touchStart || e.pointerType === 'mouse') return;
      if (Math.abs(e.clientX - touchStart.x) > TOUCH_SLOP_PX || Math.abs(e.clientY - touchStart.y) > TOUCH_SLOP_PX) {
        if (self.by !== 'pointer') cancelPending();    
      }
    });
    function up(e) {
      var pending = touchStart;
      var moved = pending && e && e.clientX !== undefined && (Math.abs(e.clientX - pending.x) > TOUCH_SLOP_PX || Math.abs(e.clientY - pending.y) > TOUCH_SLOP_PX);
      if (pending && self.by !== 'pointer') {
        cancelPending();

        if (e && e.type === 'pointerup' && !moved) { ensureGraph(); resumeAudio(); self.toggle('toggle'); }
        return;
      }
      cancelPending();
      if (self.by !== 'pointer') return;
      var short = performance.now() - self.downAt < SHORT_TAP_MS, wasSilent = self.mutedRun;
      var touch = self.pointerType && self.pointerType !== 'mouse';
      self.release('pointer', false, short);
      var unlock = null;

      if (touch && e && e.type === 'pointerup') { ensureGraph(); resumeAudio(); unlock = prime(self); }
      var fromStill = self.heldFrom === 'still';
      function say(ok) {
        if (active && active.state === 'live') return;      
        syncTapState();
        if (wasSilent) { self.pulse(); hint(self, ok === true ? (short ? 'tap' : 'unlock') : 'retry', UNLOCK_HINT_MS); }
        else if (short && fromStill && !touch) hint(self, 'keep', KEEP_HINT_MS);
      }
      if (unlock && unlock.then) unlock.then(say, function () { say(false); }); else say(null);
    }
    btn.addEventListener('pointerup', up);
    btn.addEventListener('pointercancel', up);
    btn.addEventListener('lostpointercapture', function (e) { if (self.by === 'pointer') up(e); });
    btn.addEventListener('contextmenu', function (e) { e.preventDefault(); });

    function flag() { self.keyHandled = true; setTimeout(function () { self.keyHandled = false; }, 0); }
    btn.addEventListener('keydown', function (e) {
      if (e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault(); e.stopPropagation(); flag();
        if (!e.repeat) { self.spaceDown = true; self.keyAt = performance.now(); self.hold('key'); }
      } else if (e.key === 'Enter') {
        e.preventDefault(); e.stopPropagation(); flag();
        if (!e.repeat) self.toggle('key');
      }
    });
    btn.addEventListener('keyup', function (e) {
      if (e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault(); e.stopPropagation(); flag();
        self.spaceDown = false; self.release('key', false, performance.now() - self.keyAt < SHORT_TAP_MS);
      } else if (e.key === 'Enter') { e.preventDefault(); flag(); }
    });

    btn.addEventListener('blur', function () {
      if (self.by === 'key') { self.spaceDown = false; self.release('key', false, false); }
    });
    btn.addEventListener('click', function (e) {
      if (e.detail !== 0) return;                    
      if (self.keyHandled) { self.keyHandled = false; return; }
      self.toggle('toggle');
    });
    if (this.toggleBtn) this.toggleBtn.addEventListener('click', function () { self.toggle('toggle'); });
  };

  Moment.prototype.toggle = function (by) {
    if (this.state === 'live') this.release(this.by, true); else this.hold(by === 'key' ? 'toggle' : by);
  };

  Moment.prototype.hold = function (by) {
    var self = this, v = this.video;
    this.heldFrom = this.state;                       
    if (this.state === 'live') { this.by = by; this.syncToggle(); return; }
    if (active && active !== this) active.release(active.by, true);
    active = this;
    if (this.row) this.bringIntoRow();
    hint(null);
    store(KEY_HELD, '1');
    ensureGraph(); resumeAudio();
    if (this.gain) this.gain.gain.value = 1;
    if (this.state === 'ended' || v.ended || v.currentTime >= this.len - 0.05) { seek(v, this.start); this.restart(); }
    else if (v.currentTime < this.start) seek(v, this.start);
    this.by = by;
    this.setState('live');
    if (!this.tracked) { this.tracked = true; track('mic_hold', { clip: this.id, by: by }); }
    try { doc.dispatchEvent(new CustomEvent('mic:live', { detail: { clip: this.id } })); } catch (e) {  }
    if (navigator.vibrate && by === 'pointer') { try { navigator.vibrate(8); } catch (e) {  } }
    v.muted = false;
    var p;
    try { p = v.play(); } catch (e) { p = null; }
    if (p && p.then) {
      p.then(function () { if (!v.muted) { self.soundOk = true; syncTapState(); } }, function (err) {
        if (self.state !== 'live') return;
        if (err && err.name === 'NotAllowedError') { self.runSilent(); return; }
        self.by = null; self.setState(v.currentTime > self.start + 0.05 ? 'frozen' : 'still'); self.syncToggle();
      });
    }
    this.syncToggle();
    loop();
  };

  Moment.prototype.runSilent = function () {
    var self = this, v = this.video;
    this.mutedRun = true; v.muted = true;
    this.el.classList.add('is-silent');
    hint(this, 'muted');
    var p;
    try { p = v.play(); } catch (e) { p = null; }
    if (p && p.catch) p.catch(function () {
      if (self.state === 'live') { self.mutedRun = false; self.el.classList.remove('is-silent'); self.by = null; self.setState('still'); self.syncToggle(); }
    });
  };

  Moment.prototype.bringIntoRow = function () {
    var row = this.row;
    if (row.scrollWidth <= row.clientWidth + 1) return;      
    var r = this.el.getBoundingClientRect(), rr = row.getBoundingClientRect();
    var pad = parseFloat(getComputedStyle(row).paddingLeft) || 0;
    if (r.left >= rr.left && r.right <= rr.right) return;
    this.settleUntil = performance.now() + SETTLE_MS;       
    var left = row.scrollLeft + (r.left - rr.left) - pad;
    try { row.scrollTo({ left: left, behavior: reduceMQ.matches ? 'auto' : 'smooth' }); } catch (e) { row.scrollLeft = left; }
  };

  Moment.prototype.restart = function () {
    this.wave.reset(); this.cueIdx = -2; this.el.classList.remove('played');
  };

  Moment.prototype.release = function (by, force, tap) {
    if (this.state !== 'live') return;
    if (!force && by !== this.by) return;
    var v = this.video;
    v.pause();
    this.by = null;
    if (this.mutedRun) {                             
      this.mutedRun = false; v.muted = false; this.el.classList.remove('is-silent');
      seek(v, this.start); this.restart(); this.setState('still');
    } else if ((tap && this.heldFrom === 'still') || v.currentTime < this.firstWordAt()) { 
      seek(v, this.start); this.restart(); this.setState('still');
    } else {
      this.setState('frozen');
    }
    if (hintOwner === this && this.hintEl.getAttribute('data-say') === 'muted') hint(null);
    this.syncToggle();
    this.tick(true);
  };

  Moment.prototype.end = function () {

    if (this.mutedRun && this.by === 'pointer') { this.video.pause(); seek(this.video, this.start); return; }
    this.video.pause(); this.by = null; this.mutedRun = false; this.video.muted = false;
    this.el.classList.remove('is-silent');
    this.setState('ended'); this.syncToggle(); this.tick(true);
    if (hintOwner === this) hint(null);
    track('mic_finish', { clip: this.id });
  };

  Moment.prototype.pulse = function () {
    var cl = this.el.classList;
    cl.remove('pulse'); void this.el.offsetWidth; cl.add('pulse');
    setTimeout(function () { cl.remove('pulse'); }, PULSE_MS);
  };

  Moment.prototype.setState = function (s) {
    var cl = this.el.classList;
    this.state = s;
    cl.toggle('is-live', s === 'live'); cl.toggle('is-frozen', s === 'frozen');
    cl.toggle('is-ended', s === 'ended'); cl.toggle('is-still', s === 'still');
    if (s === 'still') cl.remove('played');
    if (s === 'live') root.classList.add('mic-live');
    else if (active === this || !active) root.classList.remove('mic-live');
    this.wave.color = s === 'live' ? RED : INK;
    this.wave.alpha = s === 'ended' ? 0.6 : 1;
    if (this.endLink) this.endLink.setAttribute('tabindex', s === 'ended' ? '0' : '-1');
    if (this.status) {
      this.status.textContent = s === 'live' ? 'Playing' : s === 'frozen' ? 'Paused at ' + fmt(this.video.currentTime) : s === 'ended' ? 'Finished' : '';
    }
    this.renderTime();
  };

  Moment.prototype.syncToggle = function () {
    this.el.classList.toggle('by-toggle', this.state === 'live' && this.by === 'toggle');
    if (!this.toggleBtn) return;
    var on = this.state === 'live';
    this.toggleBtn.textContent = on ? 'pause' : (this.state === 'frozen' ? 'or play on' : 'or play');
  };

  Moment.prototype.renderTime = function () {
    var t = this.video.currentTime || 0, s = this.state, txt, tag;
    var heard = Math.max(0, t - this.start), total = Math.max(0.01, this.len - this.start);
    txt = s === 'still' || s === 'ended' ? this.lenLabel : fmt(t) + ' / ' + this.lenLabel;
    if (this.timeEl && txt !== this.lastTime) { this.timeEl.textContent = txt; this.lastTime = txt; }
    tag = s === 'live' ? (this.waiting ? 'Loading' : 'Live · ' + fmt(t)) : s === 'frozen' ? 'Frozen · ' + fmt(t) : s === 'ended' ? this.endTag : 'Still';
    if (tag !== this.lastTag) { this.tagEl.textContent = tag; this.lastTag = tag; }
    var pct = s === 'ended' || s === 'still' ? 0 : Math.min(100, heard / total * 100);
    this.prog.style.strokeDasharray = pct.toFixed(2) + ' 100';
    this.wave.progress = s === 'ended' ? 1 : s === 'still' ? 0 : Math.min(1, heard / total);
  };

  Moment.prototype.findCue = function (t) {
    var c = this.cues, idx = -1, i;
    for (i = 0; i < c.length; i++) { if (t >= c[i].s - 0.05) idx = i; }
    if (this.state === 'ended') { while (idx >= 0 && c[idx].skip) idx--; }   
    return idx;
  };
  Moment.prototype.showCue = function (i) {
    var c = this.cues[i], self = this, prev = null, k;
    if (this.plain || !this.said) { this.showPlain(c); return; }
    this.sNow.textContent = ''; this.sBefore.textContent = ''; this.words = [];
    if (this.sGloss) this.sGloss.textContent = '';
    if (i < 0 || !c || c.skip) return;                
    for (k = i - 1; k >= 0; k--) { if (!this.cues[k].skip) { prev = this.cues[k]; break; } }

    if (prev && !prev.g) this.sBefore.textContent = this.verified && prev.s < this.verifiedUntil ? '“' + prev.t + '”' : prev.t;
    var parts = c.t.split(' '), total = 0, acc = 0;
    parts.forEach(function (p) { total += p.length + 1; });
    this.words = parts.map(function (p, n) {
      var sp = doc.createElement('span');
      sp.textContent = p + (n < parts.length - 1 ? ' ' : '');
      self.sNow.appendChild(sp);
      var w = { el: sp, at: c.s + (c.e - c.s) * (acc / total) };
      acc += p.length + 1; return w;
    });
    var len = c.t.length;
    this.sNow.className = 'now ' + (len > 48 ? 'sz-s' : len > 30 ? 'sz-m' : 'sz-l');
    if (this.sGloss) this.sGloss.textContent = c.g || '';
  };

  Moment.prototype.showPlain = function (c) {
    this.words = [];
    if (!this.ccMain) return;
    var ok = c && !c.skip;
    this.ccMain.textContent = ok ? c.t : '';
    if (this.ccGloss) this.ccGloss.textContent = ok ? (c.g || '') : '';
  };

  Moment.prototype.tick = function (force) {
    var t = this.video.currentTime || 0, i = this.findCue(t), k, w, hotK = -1, cls;
    if (i !== this.cueIdx || force === 'cue') { this.cueIdx = i; this.showCue(i); }
    var c = this.cues[i], shown = c && !c.skip;
    if (shown && this.state !== 'still') this.el.classList.add('played');
    if (this.state !== 'still') { for (k = 0; k < this.words.length; k++) { if (t >= this.words[k].at) hotK = k; } }
    var done = this.state === 'ended' || (c && t > c.e && this.state !== 'still');
    for (k = 0; k < this.words.length; k++) {
      w = this.words[k];
      cls = done || k < hotK ? 'said-w' : k === hotK ? 'hot' : 'ahead';
      if (w.cls !== cls) { w.el.className = cls; w.cls = cls; }
    }
    if (this.ccLine) this.ccLine.classList.toggle('on', !!shown && this.state === 'live' && t <= c.e + CC_TAIL_S);
    this.el.classList.toggle('pre-clean', this.state !== 'still' && t < this.cleanFrom);
    this.renderTime();
    if (force) this.wave.draw();
  };

  Moment.prototype.feed = function () {
    var wv = this.wave, j;
    if (wv.full) { wv.draw(); return; }
    if (analyser && this.src && !this.video.muted && actx.state === 'running') {
      analyser.getFloatTimeDomainData(tbuf);
      var n = tbuf.length, i, sum = 0;
      for (i = 0; i < n; i++) sum += tbuf[i] * tbuf[i];
      var rms = Math.sqrt(sum / n);
      wv.agc = Math.max(wv.agc * 0.997, rms, 0.02);
      wv.level = rms / wv.agc;
      for (j = 0; j < 3; j++) wv.push(Math.tanh(tbuf[Math.floor((j + 0.5) * n / 3)] / (wv.agc * 1.6)) * 0.92);
    } else if (this.env) {
      var idx = Math.floor((this.video.currentTime || 0) * ENV_PER_SEC), e = this.env;
      for (j = 0; j < 3; j++) {
        var ev = (e[idx + j] || 0) / 99;
        wv.level = Math.abs(ev);
        wv.push(Math.tanh(ev * 1.6) * 0.92 * (j % 2 ? -1 : 1) * (0.55 + 0.45 * Math.abs(Math.sin(idx * 1.7 + j))));
      }
    }
    wv.draw();
    var lvl = wv.level || 0;
    for (var b = 0; b < this.eqBars.length; b++) {
      this.eqBars[b].style.transform = 'scaleY(' + (0.35 + Math.min(1.6, lvl * (0.8 + ((b * 7) % 5) * 0.18))).toFixed(2) + ')';
    }
  };

  function loop() {
    if (rafId) return;
    var f = function () {
      rafId = 0;
      if (!active || active.state !== 'live') return;
      var v = active.video, t = v.currentTime;
      var jumped = active.lastFrameT !== undefined && t - active.lastFrameT > JUMP_S;
      if (active.len && t >= active.len - 0.02 && !v.seeking && !jumped) { active.end(); return; }
      active.lastFrameT = t;
      active.tick(false); active.feed();
      rafId = requestAnimationFrame(f);
    };
    rafId = requestAnimationFrame(f);
  }

  function track(name, props) { if (typeof window.track === 'function') { try { window.track(name, props); } catch (e) {  } } }

  Array.prototype.forEach.call(doc.querySelectorAll('.moment'), function (el) { moments.push(new Moment(el)); });
  var hero = moments.filter(function (m) { return m.isHero; })[0];

  syncTapState();
  if (coarse.addEventListener) coarse.addEventListener('change', syncTapState);

  if (hero && !store(KEY_HELD)) setTimeout(function () { if (!active && hero.state === 'still') { syncTapState(); hint(hero, coarse.matches && needsTap(hero) ? 'first-tap' : 'first'); } }, FIRST_HINT_DELAY_MS);

  var ccs = doc.querySelectorAll('.cc');
  function applyCC(off) {
    root.classList.toggle('cc-off', off);
    Array.prototype.forEach.call(ccs, function (b) { b.setAttribute('aria-pressed', off ? 'false' : 'true'); });
  }
  applyCC(store(KEY_CC) === 'off');
  Array.prototype.forEach.call(ccs, function (b) {
    b.addEventListener('click', function () {
      var off = !root.classList.contains('cc-off'); applyCC(off); store(KEY_CC, off ? 'off' : 'on');
    });
  });

  function releaseAll() { if (active) active.release(active.by, true); }
  doc.addEventListener('reel:play', releaseAll);
  doc.addEventListener('keydown', function (e) { if (e.key === 'Escape' || e.key === 'Esc') releaseAll(); });
  window.addEventListener('blur', function () { if (active && active.by !== 'toggle') releaseAll(); });
  doc.addEventListener('visibilitychange', function () { if (doc.hidden) releaseAll(); });

  if ('IntersectionObserver' in window) {

    var vis = new IntersectionObserver(function (ents) {
      ents.forEach(function (en) {
        if (!active || active.el !== en.target) return;
        if (active.row && en.intersectionRatio < SWIPE_MIN_VISIBLE && performance.now() > (active.settleUntil || 0)) releaseAll();
        else if (active.by === 'toggle' && en.intersectionRatio < MIN_VISIBLE) releaseAll();
      });
    }, { threshold: [0, MIN_VISIBLE, SWIPE_MIN_VISIBLE, 0.75] });
    moments.forEach(function (m) { vis.observe(m.el); });
  }

  var rT = 0;
  window.addEventListener('resize', function () { clearTimeout(rT); rT = setTimeout(function () { moments.forEach(function (m) { m.wave.resize(); }); }, 120); });
  function applyReduced() { moments.forEach(function (m) { m.wave.full = reduceMQ.matches ? m.env : null; m.wave.draw(); }); }
  if (reduceMQ.addEventListener) reduceMQ.addEventListener('change', applyReduced);

});
