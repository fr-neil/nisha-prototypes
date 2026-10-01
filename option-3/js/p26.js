/* Prototype 26 · full build. Motion M1-M9 (M7 is CSS), clip player, loops, request form.
   The no-JS page is complete; everything here is an enhancement. */
(function () {
  'use strict';

  var d = document;
  var html = d.documentElement;
  var page = d.body.getAttribute('data-page');
  var RM = window.matchMedia('(prefers-reduced-motion: reduce)');
  var PHONE = window.matchMedia('(max-width: 760px)');
  var conn = navigator.connection || {};
  var SAVE_DATA = !!conn.saveData;
  var CELLULAR = conn.type === 'cellular';
  var G = window.gsap;
  var $ = function (s, r) { return (r || d).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || d).querySelectorAll(s)); };
  var reduced = function () { return RM.matches; };

  function markReady() { window.P26_READY = true; }

  if (page === 'request') { initRequest(); markReady(); return; }

  if (reduced()) html.classList.add('rm');
  RM.addEventListener('change', function () { html.classList.toggle('rm', reduced()); });

  /* ------------------------------------------------------------ Sound: one source on the page */
  var loops = [];
  var Sound = {
    owner: null,
    take: function (video) {
      if (this.owner && this.owner !== video) this.owner.dispatchEvent(new CustomEvent('p26:release'));
      this.owner = video;
      loops.forEach(function (l) { l.hold(); });
    },
    release: function (video) {
      if (this.owner !== video) return;
      this.owner = null;
      loops.forEach(function (l) { l.resume(); });
    }
  };

  /* M5 voice meter: WebAudio analyser on the clip that has sound (same origin) */
  var audio = { ctx: null, nodes: new WeakMap(), raf: 0 };
  function analyserFor(video) {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try {
      if (!audio.ctx) audio.ctx = new AC();
      if (audio.ctx.state === 'suspended') audio.ctx.resume();
      var n = audio.nodes.get(video);
      if (!n) {
        var src = audio.ctx.createMediaElementSource(video);
        var an = audio.ctx.createAnalyser();
        an.fftSize = 64;
        src.connect(an);
        an.connect(audio.ctx.destination);
        n = { an: an, buf: new Uint8Array(an.frequencyBinCount) };
        audio.nodes.set(video, n);
      }
      return n;
    } catch (e) {
      return null;
    }
  }
  function runMeter(video, meters) {
    cancelAnimationFrame(audio.raf);
    var n = reduced() ? null : analyserFor(video);
    var bars = [];
    meters.forEach(function (m) { bars = bars.concat($$('i', m)); });
    function frame() {
      if (video.paused || video.muted) { bars.forEach(function (b) { b.style.transform = 'scaleY(.2)'; }); return; }
      if (n) {
        n.an.getByteFrequencyData(n.buf);
        for (var i = 0; i < bars.length; i++) {
          var k = i % 5;
          var v = n.buf[1 + k * 3] / 255;
          bars[i].style.transform = 'scaleY(' + Math.max(0.15, Math.min(1, v * 1.25)).toFixed(2) + ')';
        }
      }
      audio.raf = requestAnimationFrame(frame);
    }
    frame();
  }

  /* ------------------------------------------------------------ Captions (parsed from the .vtt tracks) */
  var vttCache = {};
  function toSec(t) {
    var p = t.trim().split(':');
    var s = 0;
    for (var i = 0; i < p.length; i++) s = s * 60 + parseFloat(p[i]);
    return s;
  }
  function loadVtt(url) {
    if (!vttCache[url]) {
      vttCache[url] = fetch(url).then(function (r) { return r.ok ? r.text() : ''; }).then(function (txt) {
        var cues = [];
        txt.replace(/\r/g, '').split(/\n\n+/).forEach(function (block) {
          var lines = block.split('\n');
          var at = -1;
          for (var i = 0; i < lines.length; i++) if (lines[i].indexOf('-->') > -1) { at = i; break; }
          if (at < 0) return;
          var tt = lines[at].split('-->');
          cues.push({ n: cues.length + 1, start: toSec(tt[0]), end: toSec(tt[1].trim().split(' ')[0]), text: lines.slice(at + 1).join(' ').trim() });
        });
        return cues;
      }).catch(function () { return []; });
    }
    return vttCache[url];
  }
  function cueAt(cues, t) {
    for (var i = 0; i < cues.length; i++) if (t >= cues[i].start && t < cues[i].end) return cues[i];
    return null;
  }
  var isUnresolved = function (text) { return /\[[^\]]*\]/.test(text); };

  /* M4 live captions: the new cue rises 14px and fades in; the previous drops to the small line */
  function riseIn(el) {
    if (!G || reduced()) return;
    G.fromTo(el, { y: 14, opacity: 0 }, { y: 0, opacity: 1, duration: 0.2, ease: 'power2.out', overwrite: true });
  }

  /* ------------------------------------------------------------ M9 in-view loops */
  function Loop(video) {
    var self = this;
    var box = video.parentNode;
    var btn = $('[data-loop-btn]', box) || $('[data-loop-btn]', box.parentNode);
    var start = parseFloat(video.getAttribute('data-start') || '0');
    var end = parseFloat(video.getAttribute('data-end') || '0');
    var afterLoad = video.hasAttribute('data-after-load');
    var inView = false;
    var userPaused = false;
    var userPlayed = false;
    var held = false;
    var armed = !afterLoad || d.readyState === 'complete';
    self.video = video;
    self.soundMode = false;
    var autoAllowed = function () { return !reduced() && !SAVE_DATA && !(PHONE.matches && CELLULAR); };

    video.removeAttribute('controls');
    video.muted = true;
    $$('track', video).forEach(function (t) { t.removeAttribute('default'); if (t.track) t.track.mode = 'hidden'; });
    if (btn) btn.hidden = false;

    function setBtn() {
      if (!btn) return;
      var playing = !video.paused && !self.soundMode;
      btn.classList.toggle('is-paused', !playing);
      btn.setAttribute('aria-label', (playing ? 'Pause ' : 'Play ') + (btn.getAttribute('aria-label') || '').replace(/^(Pause|Play) /, ''));
    }
    function wantPlay() {
      if (self.soundMode || held || !inView || !armed || userPaused) return false;
      return autoAllowed() || userPlayed;
    }
    self.sync = function () {
      if (self.soundMode) return;
      if (wantPlay()) {
        if (video.preload !== 'auto') video.preload = 'auto';
        if (start && video.currentTime < start - 0.05) {
          try { video.currentTime = start; } catch (e) { /* metadata not ready */ }
        }
        var p = video.play();
        if (p && p.catch) p.catch(function () { setBtn(); });
      } else if (!video.paused) {
        video.pause();
      }
      setBtn();
    };
    self.hold = function () { held = true; if (!self.soundMode) self.sync(); };
    self.resume = function () { held = false; self.sync(); };
    self.loopMode = function () {
      self.soundMode = false;
      video.muted = true;
      video.loop = true;
      try { video.currentTime = start; } catch (e) { /* ignore */ }
      self.sync();
    };

    video.addEventListener('loadedmetadata', function () {
      if (start && !self.soundMode && video.currentTime < start) video.currentTime = start;
    });
    video.addEventListener('timeupdate', function () {
      if (!self.soundMode && end && video.currentTime >= end) video.currentTime = start;
    });
    video.addEventListener('play', setBtn);
    video.addEventListener('pause', setBtn);
    if (btn) {
      btn.addEventListener('click', function () {
        if (self.soundMode) { userPaused = true; video.pause(); return; }
        if (video.paused) { userPaused = false; userPlayed = true; held = false; } else { userPaused = true; }
        self.sync();
      });
    }
    if (afterLoad && !armed) {
      window.addEventListener('load', function () { armed = true; self.sync(); });
    }
    new IntersectionObserver(function (es) {
      es.forEach(function (e) { inView = e.isIntersecting && e.intersectionRatio >= 0.5; });
      self.sync();
    }, { threshold: [0, 0.5, 1] }).observe(box);
    setBtn();
  }
  $$('video[data-loop]').forEach(function (v) { loops.push(new Loop(v)); });
  RM.addEventListener('change', function () { loops.forEach(function (l) { l.sync(); }); });

  /* ------------------------------------------------------------ S1 tile: "Hear her" plays in place, with sound */
  var tile = $('[data-tile]');
  if (tile) initTile(tile);
  function initTile(t) {
    var video = $('video', t);
    var loop = loops.filter(function (l) { return l.video === video; })[0];
    var btn = $('[data-hear-here]', t);
    var capEl = $('.tile-cap', t);
    var meter = $('.meter', btn);
    var cues = [];
    var last = null;
    var verified = [1, 2, 3, 4];
    var soundSrc = video.getAttribute('data-sound-src');
    var loopSrc = null;
    var swapping = false; /* ignore the pause that a source swap can cause until the sound clip plays */
    btn.hidden = false;
    loadVtt('media/clips/voice-datamatics.en.vtt').then(function (c) { cues = c; });

    function stop() {
      t.classList.remove('is-live');
      btn.classList.remove('is-sound');
      btn.setAttribute('aria-pressed', 'false');
      last = null;
      capEl.textContent = '';
      Sound.release(video);
      if (soundSrc && loopSrc) video.src = loopSrc;
      if (loop) loop.loopMode();
    }
    btn.addEventListener('click', function () {
      if (loop && loop.soundMode) { video.pause(); return; }
      if (loop) loop.soundMode = true;
      Sound.take(video);
      video.loop = false;
      if (soundSrc) {
        loopSrc = loopSrc || video.currentSrc || ($('source', video) || {}).src;
        swapping = true;
        video.src = soundSrc;
      }
      video.muted = false;
      video.volume = 0.8;
      video.preload = 'auto';
      try { video.currentTime = 0; } catch (e) { /* ignore */ }
      var p = video.play();
      if (p && p.catch) p.catch(function () { swapping = false; stop(); });
      t.classList.add('is-live');
      btn.classList.add('is-sound');
      btn.setAttribute('aria-pressed', 'true');
      runMeter(video, [meter]);
    });
    video.addEventListener('timeupdate', function () {
      if (!loop || !loop.soundMode) return;
      var c = cueAt(cues, video.currentTime);
      if (c && c !== last) {
        last = c;
        capEl.textContent = c.text;
        if (verified.indexOf(c.n) < 0) {
          var s = d.createElement('small');
          s.textContent = 'Draft transcript: needs Nisha’s review';
          capEl.appendChild(s);
        }
        riseIn(capEl);
      }
    });
    video.addEventListener('playing', function () { swapping = false; });
    video.addEventListener('pause', function () { if (!swapping && loop && loop.soundMode) stop(); });
    video.addEventListener('ended', function () { if (loop && loop.soundMode) stop(); });
    video.addEventListener('p26:release', function () { if (loop && loop.soundMode) video.pause(); });
  }

  /* ------------------------------------------------------------ S2 player */
  var player = $('[data-player]');
  var playerApi = player ? initPlayer(player) : null;
  function initPlayer(p) {
    var video = $('video', p);
    var ctrl = $('[data-player-ctrl]', p);
    var playBtn = $('[data-play]', p);
    var jumpBtn = $('[data-jump]', p);
    var ccBtn = $('[data-cc]', p);
    var bar = $('[data-progress]', p);
    var stage = $('[data-stage]');
    var nowEl = $('[data-stage-now]');
    var prevEl = $('[data-stage-prev]');
    var noteEl = $('[data-stage-note]');
    var draftEl = $('[data-stage-draft]');
    var eventEl = $('[data-stage-event]');
    var cards = $$('[data-clip]');
    var current = null;
    var cues = [];
    var last = null;
    var ccOn = true;
    var raf = 0;
    var section = p.closest('.hear');

    video.removeAttribute('controls');

    /* Phone: while a clip plays, the player steps back (CSS) and sits under the header so the
       live caption is on screen with it, above the sticky bar */
    function playMode(on) {
      if (!section) return;
      section.classList.toggle('is-playing', on);
      if (!on || !PHONE.matches) return;
      requestAnimationFrame(function () {
        var want = parseFloat(getComputedStyle(p).scrollMarginTop) || 64;
        if (Math.abs(p.getBoundingClientRect().top - want) > 4) {
          p.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' });
        }
      });
    }
    ctrl.hidden = false;

    function verifiedOf(card) {
      return (card.getAttribute('data-verified') || '').split(',').filter(Boolean).map(Number);
    }
    function trackFile(card) {
      var tr = JSON.parse(card.getAttribute('data-tracks'));
      return tr[0];
    }
    function setTracks(card) {
      $$('track', video).forEach(function (t) { t.remove(); });
      JSON.parse(card.getAttribute('data-tracks')).forEach(function (t, i) {
        var el = d.createElement('track');
        el.kind = t.k; el.srclang = t.l; el.label = t.n; el.src = t.s;
        if (i === 0) el.default = true;
        video.appendChild(el);
      });
    }
    function showCue(c, idle) {
      var card = current;
      var ver = verifiedOf(card);
      if (!c) { return; }
      if (last && !idle && !isUnresolved(last.text)) prevEl.textContent = last.text;
      if (idle) prevEl.textContent = '';
      last = c;
      if (isUnresolved(c.text)) {
        noteEl.hidden = false;
        nowEl.textContent = '';
      } else {
        noteEl.hidden = true;
        nowEl.textContent = c.text;
        if (!idle) riseIn(nowEl);
      }
      draftEl.hidden = ver.indexOf(c.n) > -1;
    }
    function select(card, opts) {
      opts = opts || {};
      if (current === card && !opts.force) return Promise.resolve();
      if (!video.paused) video.pause();
      current = card;
      cards.forEach(function (c) { c.classList.toggle('is-on', c === card); });
      var wide = card.hasAttribute('data-wide');
      p.classList.toggle('is-wide', wide);
      video.poster = card.getAttribute('data-poster');
      video.src = card.getAttribute('data-src');
      setTracks(card);
      var lang = card.getAttribute('data-lang') || 'en';
      stage.setAttribute('lang', lang);
      eventEl.textContent = card.getAttribute('data-event');
      jumpBtn.hidden = !card.hasAttribute('data-jump');
      last = null;
      prevEl.textContent = '';
      bar.style.transform = 'scaleX(0)';
      return loadVtt(trackFile(card).s).then(function (c) {
        if (current !== card) return;
        cues = c;
        var idle = parseInt(card.getAttribute('data-idle') || '1', 10);
        showCue(cues[idle - 1] || cues[0], true);
      });
    }
    function tick() {
      var c = cueAt(cues, video.currentTime);
      if (c && c !== last) showCue(c, false);
      if (video.duration) bar.style.transform = 'scaleX(' + (video.currentTime / video.duration).toFixed(4) + ')';
      if (!video.paused) raf = requestAnimationFrame(tick);
    }
    function playWithSound(at) {
      Sound.take(video);
      playMode(true);
      video.muted = false;
      video.volume = 0.8;
      if (typeof at === 'number') {
        try { video.currentTime = at; } catch (e) { /* ignore */ }
      } else if (video.ended) {
        video.currentTime = 0;
      }
      var pr = video.play();
      if (pr && pr.catch) pr.catch(function () { setPlaying(false); });
      runMeter(video, [$('.meter', playBtn)]);
    }
    function setPlaying(on) {
      playBtn.classList.toggle('is-sound', on);
      playBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
      $('.play-txt', playBtn).textContent = on ? 'Pause' : 'Play with sound';
    }
    video.addEventListener('play', function () { setPlaying(true); cancelAnimationFrame(raf); raf = requestAnimationFrame(tick); });
    video.addEventListener('pause', function () { setPlaying(false); Sound.release(video); });
    video.addEventListener('ended', function () { setPlaying(false); Sound.release(video); playMode(false); });
    video.addEventListener('seeked', function () { if (video.paused) tick(); });
    video.addEventListener('p26:release', function () { video.pause(); });

    playBtn.addEventListener('click', function () {
      if (!video.paused) { video.pause(); return; }
      playWithSound();
    });
    jumpBtn.addEventListener('click', function () {
      playWithSound(parseFloat(current.getAttribute('data-jump')));
    });
    ccBtn.addEventListener('click', function () {
      ccOn = !ccOn;
      ccBtn.setAttribute('aria-pressed', ccOn ? 'true' : 'false');
      stage.classList.toggle('is-off', !ccOn);
    });
    d.addEventListener('fullscreenchange', function () {
      var tt = video.textTracks[0];
      if (tt) tt.mode = d.fullscreenElement === video && ccOn ? 'showing' : 'hidden';
    });
    video.textTracks.addEventListener && video.textTracks.addEventListener('addtrack', function (e) { e.track.mode = 'hidden'; });
    if (video.textTracks[0]) video.textTracks[0].mode = 'hidden';

    cards.forEach(function (card) {
      card.addEventListener('click', function (e) {
        e.preventDefault();
        var same = current === card;
        select(card);
        if (same && !video.paused) { video.pause(); return; }
        playWithSound(same ? undefined : 0);
        if (history.replaceState) history.replaceState(null, '', '#' + card.id);
      });
    });

    var fromHash = location.hash && $(location.hash + '[data-clip]');
    select(fromHash || cards[0], { force: true });

    return {
      hear: function (id) {
        var card = cards.filter(function (c) { return c.getAttribute('data-clip') === id; })[0] || cards[0];
        select(card);
        playWithSound(0);
      }
    };
  }

  /* Hear chips (phone hero: Datamatics; S6: Dorby in Hindi): start that clip with sound in S2 in the same gesture, then scroll there */
  $$('[data-hear-jump]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      if (!playerApi) return;
      e.preventDefault();
      playerApi.hear(a.getAttribute('data-hear-jump'));
      if (!PHONE.matches) $('#hear').scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' });
    });
  });

  /* ------------------------------------------------------------ Header: small wordmark + CTA (M8) */
  var heroWm = $('.hero-wm');
  var heroCta = $('.hero-cta');
  if (heroWm) {
    new IntersectionObserver(function (es) {
      html.classList.toggle('hdr-wm-on', !es[0].isIntersecting && es[0].boundingClientRect.top < 0);
    }).observe(heroWm);
  }
  /* M8: the header CTA shows only while no in-page CTA is on screen and the hero CTA has scrolled away */
  if (heroCta) {
    var ctaState = new Map();
    var pageCtas = [heroCta].concat($$('.ask-row .ns-cta, .final-cta'));
    var cio = new IntersectionObserver(function (es) {
      es.forEach(function (e) { ctaState.set(e.target, { vis: e.isIntersecting, top: e.boundingClientRect.top }); });
      var hero = ctaState.get(heroCta) || { vis: true, top: 0 };
      var anyVis = pageCtas.some(function (c) { var st = ctaState.get(c); return st && st.vis; });
      html.classList.toggle('hdr-cta-on', !anyVis && !hero.vis && hero.top < 80);
    }, { rootMargin: '-56px 0px 0px 0px' });
    pageCtas.forEach(function (c) { cio.observe(c); });
  }

  /* Phone S8: the band shows its own card CTA, so the sticky bar steps away while that CTA is on
     screen (one red button per screen). The margin keeps the bar away until the CTA is clear of it. */
  var finalCta = $('.final-cta');
  if (finalCta) {
    new IntersectionObserver(function (es) {
      html.classList.toggle('final-cta-on', es[0].isIntersecting);
    }, { rootMargin: '0px 0px 120px 0px' }).observe(finalCta);
  }

  /* ------------------------------------------------------------ M2 the flick (dateline cards) */
  function flick(card) {
    card.classList.add('is-in');
  }
  var s3Cards = $$('.dl[data-flick]');
  if (!reduced()) {
    s3Cards.forEach(function (c) { c.classList.add('is-armed'); });
    var fo = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return;
        fo.unobserve(e.target);
        requestAnimationFrame(function () { flick(e.target); });
      });
    }, { threshold: 0.6 });
    s3Cards.forEach(function (c) { fo.observe(c); });
  }

  /* ------------------------------------------------------------ M3 photo cuts (S3 groups) */
  var groups = $$('[data-cut-group]');
  if (G && !reduced()) {
    groups.forEach(function (g) { g.classList.add('cut-wait'); });
    var go = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return;
        go.unobserve(e.target);
        cutIn(e.target);
      });
    }, { threshold: 0.15 });
    groups.forEach(function (g) { go.observe(g); });
  }
  function decoded(tileEl) {
    var img = $('img', tileEl);
    var wait = img && img.decode ? img.decode().catch(function () {}) : Promise.resolve();
    return Promise.race([wait, new Promise(function (r) { setTimeout(r, 1200); })]);
  }
  function cutIn(group) {
    var tiles = $$('.tile', group);
    Promise.all(tiles.map(decoded)).then(function () {
      var media = tiles.map(function (t) { return $('.tile-media', t); });
      var caps = tiles.map(function (t) { return $('.cap', t); }).filter(Boolean);
      G.set(media, { clipPath: 'inset(100% 0% 0% 0%)' });
      G.set(caps, { opacity: 0 });
      group.classList.remove('cut-wait');
      G.to(media, { clipPath: 'inset(0% 0% 0% 0%)', duration: 0.45, ease: 'power3.out', stagger: 0.06, clearProps: 'clipPath' });
      G.to(caps, { opacity: 1, duration: 0.3, delay: 0.2, stagger: 0.06 });
    });
  }

  /* ------------------------------------------------------------ M6 headline rise */
  function initRise() {
    if (!G || !window.SplitText || reduced()) return;
    var heads = $$('[data-rise]');
    heads.forEach(function (h) {
      var split = window.SplitText.create(h, { type: 'lines', mask: 'lines', linesClass: 'rl' });
      G.set(split.lines, { yPercent: 105 });
      var io = new IntersectionObserver(function (es) {
        if (!es[0].isIntersecting) return;
        io.disconnect();
        G.to(split.lines, { yPercent: 0, duration: 0.5, ease: 'power3.out', stagger: 0.06 });
      }, { threshold: 0.4 });
      io.observe(h);
    });
  }

  /* M6 for S5: each place rises with its month as one line, like the hero nouns (masked by each li) */
  function initPlaces() {
    var box = $('.places');
    if (!box || !G || reduced()) return;
    var bits = $$('.pl-in', box);
    G.set(bits, { yPercent: 120 });
    var io = new IntersectionObserver(function (es) {
      if (!es[0].isIntersecting) return;
      io.disconnect();
      G.to(bits, { yPercent: 0, duration: 0.45, ease: 'power3.out', stagger: 0.035, clearProps: 'transform' });
    }, { threshold: 0.25 });
    io.observe(box);
  }

  /* ------------------------------------------------------------ M1 the opening */
  function opening() {
    if (!G || !html.classList.contains('p26-enter')) { html.classList.remove('p26-enter'); return; }
    var phone = PHONE.matches;
    var wm = $('.hero-wm');
    var words = $$('.nw > span');
    var enter = $$('.hero [data-enter]');
    var card = $('.dl-hero');
    var still = $$('.hero-pic, .hero-panel .tile-media');
    G.set(wm, { clipPath: 'inset(100% 0% 0% 0%)', y: 24 });
    G.set(words, { y: 0, yPercent: 105 });
    G.set(enter, { opacity: 0 });
    G.set(card, { opacity: 0 });
    if (phone) G.set(still, { clipPath: 'inset(100% 0% 0% 0%)' });
    html.classList.remove('p26-enter');
    var tl = G.timeline({ defaults: { ease: 'power3.out' } });
    tl.to(wm, { clipPath: 'inset(0% 0% 0% 0%)', y: 0, duration: 0.45, clearProps: 'clipPath,transform' }, 0.15)
      .to('.hero .kicker', { opacity: 1, duration: 0.3 }, 0.2)
      .to(words, { yPercent: 0, duration: 0.45, stagger: 0.07 }, phone ? 0.4 : 0.45);
    if (phone) {
      tl.to(still, { clipPath: 'inset(0% 0% 0% 0%)', duration: 0.45, clearProps: 'clipPath' }, 0.6)
        .to('.hear-chip', { opacity: 1, duration: 0.25 }, 0.95)
        .to('.fact', { opacity: 1, duration: 0.3 }, 0.95);
    } else {
      tl.to(['.fact', '.hero-social', '.hero-deva'], { opacity: 1, y: 0, duration: 0.3, stagger: 0.05 }, 0.75)
        .fromTo('.hero-cta', { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.3, clearProps: 'transform' }, 0.8);
    }
    tl.call(function () {
      card.classList.add('is-armed');
      G.set(card, { clearProps: 'opacity' });
      requestAnimationFrame(function () { requestAnimationFrame(function () { flick(card); }); });
    }, null, 0.85);
    tl.call(function () { G.set(enter, { clearProps: 'opacity,transform' }); }, null, 1.3);
  }

  var fontsReady = d.fonts && d.fonts.ready ? d.fonts.ready : Promise.resolve();
  opening();
  fontsReady.then(initRise);
  initPlaces();
  markReady();

  /* ------------------------------------------------------------ request.html */
  function initRequest() {
    var form = $('#req-form');
    if (!form) return;
    var params = new URLSearchParams(location.search);
    var q = $('#about-question');
    var dt = $('#about-date');
    if (params.get('about') === 'question' && q) q.checked = true;
    var date = $('#f-date');
    var notFixed = $('#f-notfixed');
    var city = $('#f-city');
    var dateOnly = $$('[data-for-date]', form);
    function sync() {
      var isDate = dt.checked;
      dateOnly.forEach(function (el) { el.classList.toggle('is-optional', !isDate); });
      date.disabled = notFixed.checked;
    }
    function err(field, msg) {
      var id = field.id + '-err';
      var e = d.getElementById(id);
      if (!e) return;
      e.textContent = msg || '';
      e.hidden = !msg;
      if (msg) field.setAttribute('aria-invalid', 'true'); else field.removeAttribute('aria-invalid');
    }
    $$('input[name="about"]', form).forEach(function (r) { r.addEventListener('change', sync); });
    notFixed.addEventListener('change', sync);
    form.addEventListener('submit', function (e) {
      var bad = [];
      var isDate = dt.checked;
      err(date); err(city); err($('#f-name')); err($('#f-reply'));
      if (isDate && !date.value && !notFixed.checked) { err(date, 'Add the event date, or tick “Dates not fixed yet”.'); bad.push(date); }
      if (isDate && !city.value.trim()) { err(city, 'Add the city.'); bad.push(city); }
      if (!$('#f-name').value.trim()) { err($('#f-name'), 'Add your name.'); bad.push($('#f-name')); }
      if (!$('#f-reply').value.trim()) { err($('#f-reply'), 'Add an email or phone number for the reply.'); bad.push($('#f-reply')); }
      if (bad.length) { e.preventDefault(); bad[0].focus(); }
    });
    form.noValidate = true;
    sync();
  }
})();
