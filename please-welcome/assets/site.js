
(function () {
  'use strict';
  window.__pwStarted = true;

  var root = document.documentElement;
  var SITE = window.SITE || {};
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var NAME_AT = 2650;      // ms after first paint: the swash starts under her name (drawn by ~3.2 s)
  var END_AT = 3550;       // ms after first paint: the marks are done, the cue bar leaves

  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }
  function session(key, value) {
    try { if (value === undefined) return sessionStorage.getItem(key); sessionStorage.setItem(key, value); }
    catch (e) {  }
    return null;
  }

  
  var SOURCE_NAMES = { ig: 'Instagram', instagram: 'Instagram', insta: 'Instagram', li: 'LinkedIn', linkedin: 'LinkedIn',
    wa: 'WhatsApp', whatsapp: 'WhatsApp', fb: 'Facebook', facebook: 'Facebook', yt: 'YouTube', youtube: 'YouTube',
    google: 'Google', email: 'Email', card: 'Card' };
  var source = (function () {
    try {
      var q = new URLSearchParams(window.location.search);
      var raw = (q.get('from') || q.get('utm_source') || '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 30);
      if (raw) session('pw-from', raw);
    } catch (e) {  }
    return session('pw-from') || '';
  })();
  function sourceNote() {
    if (!source) return '';
    var name = SOURCE_NAMES[source] || source.replace(/[-_]/g, ' ');
    return 'Ref: ' + name.charAt(0).toUpperCase() + name.slice(1);
  }
  function withSource(text) { var n = sourceNote(); return n ? text + '\n' + n : text; }

  
  function track(name, props) {
    var p = props || {};
    if (source) p.from = source;
    try {
      if (typeof window.plausible === 'function') window.plausible(name, { props: p });
      else if (typeof window.gtag === 'function') window.gtag('event', name, p);
    } catch (e) {  }
  }

  
  var intro = (function () {
    var lines = $$('.script .ln');
    var pw = $('.name__pw');
    var name = $('.name');
    var cue = $('.cue');
    var timers = [];
    var running = false;

    function later(fn, ms) { timers.push(setTimeout(fn, Math.max(0, ms))); }
    function clearTimers() { timers.forEach(clearTimeout); timers = []; }
    function moveCue(el) {
      if (!cue || !el) return;
      cue.style.transform = 'translateY(' + el.offsetTop + 'px)';
      cue.style.height = el.offsetHeight + 'px';
    }
    function reset() {
      lines.forEach(function (l) { l.classList.remove('is-ticked'); });
      $$('.script .st').forEach(function (s) { s.classList.remove('is-marked'); });
      name.classList.remove('is-landed');
    }
    function remember() { try { localStorage.setItem('pw-heard', String(Date.now())); } catch (e) {  } }
    function finish() {
      if (!running && !root.classList.contains('intro')) return;
      running = false;
      clearTimers();
      root.classList.remove('intro');
      remember();
      detach();
    }
    function onInterrupt(e) {
      if (e.type === 'keydown' && ['Tab', 'Shift', 'Alt', 'Control', 'Meta'].indexOf(e.key) > -1) return;
      if (e.type === 'scroll' && window.scrollY < 24) return;
      finish();
    }
    function attach() {
      ['scroll', 'wheel', 'touchmove'].forEach(function (t) { window.addEventListener(t, onInterrupt, { passive: true }); });
      window.addEventListener('keydown', onInterrupt);
    }
    function detach() {
      ['scroll', 'wheel', 'touchmove'].forEach(function (t) { window.removeEventListener(t, onInterrupt); });
      window.removeEventListener('keydown', onInterrupt);
    }
    function sincePaint() {
      try {
        var p = performance.getEntriesByType('paint').filter(function (e) { return e.name === 'first-contentful-paint'; })[0];
        return p ? performance.now() - p.startTime : 0;
      } catch (e) { return 0; }
    }
    function play(fromStart) {
      reset();
      running = true;
      root.classList.add('intro');
      attach();
      var late = fromStart ? 0 : Math.min(sincePaint(), 2000);
      var target = late > 300 ? 2100 : NAME_AT;
      var room = Math.max(700, target - late);
      var k = room / NAME_AT;
      var at = function (ms) { return ms * k; };
      moveCue(lines[0]);
      lines.forEach(function (line) {
        later(function () { moveCue(line); }, at(Number(line.getAttribute('data-at') || 0)));
        var stress = line.getAttribute('data-stress');
        if (stress) {
          $$('.st', line).forEach(function (s, i) { later(function () { s.classList.add('is-marked'); }, at(Number(stress) + i * 180)); });
        }
        var tick = line.getAttribute('data-tick');
        if (tick) later(function () { line.classList.add('is-ticked'); }, at(Number(tick)));
      });
      if (pw) later(function () { moveCue(pw); }, at(Number(pw.getAttribute('data-at') || NAME_AT - 80)));
      later(function () { name.classList.add('is-landed'); if (cue) cue.style.height = '0px'; }, at(NAME_AT));
      later(finish, at(NAME_AT) + (END_AT - NAME_AT));
    }
    return { play: play, finish: finish };
  })();

  if (root.classList.contains('intro')) intro.play(false);

  var skip = $('.top__skip');
  if (skip) {
    skip.addEventListener('click', function () {
      intro.finish();
      var h1 = $('.name'); if (h1) h1.focus({ preventScroll: true });
    });
  }
  $$('a[href^="#"]').forEach(function (a) {
    a.addEventListener('click', function () { if (!a.hasAttribute('data-replay')) intro.finish(); });
  });
  var replay = $('[data-replay]');
  if (replay) {
    replay.addEventListener('click', function (e) {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: reduceMotion.matches ? 'auto' : 'smooth' });
      if (reduceMotion.matches) return;
      var tries = 0;
      (function check() { if (window.scrollY < 4 || tries++ > 60) intro.play(true); else requestAnimationFrame(check); })();
    });
  }

  
  var top = $('.top');
  var ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () { top.classList.toggle('is-scrolled', window.scrollY > 8); ticking = false; });
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
  var bigName = $('.name');
  if (bigName && 'IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      top.classList.toggle('has-name', !entries[0].isIntersecting && entries[0].boundingClientRect.top < 0);
    }, { rootMargin: '-' + top.offsetHeight + 'px 0px 0px 0px' }).observe(bigName);
  } else { top.classList.add('has-name'); }

  
  var player = $('.player');
  if (player) {
    var video = $('.player__v', player);
    var button = $('.player__play', player);
    var label = $('.player__label', player);
    var loopSrc = player.getAttribute('data-loop');
    var reelSrc = player.getAttribute('data-reel');
    var saveData = navigator.connection && navigator.connection.saveData;
    var soundOn = false;
    var soundTracked = false;
    var captions = video.textTracks && video.textTracks[0];
    if (captions) captions.mode = 'disabled';

    video.addEventListener('playing', function () { player.classList.add('is-playing'); });
    var previewAllowed = function () { return !reduceMotion.matches && !saveData && !soundOn; };
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (soundOn) { if (!entry.isIntersecting && !video.paused) video.pause(); return; }
          if (entry.isIntersecting && previewAllowed()) {
            if (!video.getAttribute('src')) video.setAttribute('src', loopSrc);
            var p = video.play();
            if (p && p.catch) p.catch(function () {  });
          } else if (!entry.isIntersecting && !video.paused) {
            video.pause();
          }
        });
      }, { threshold: 0.35 }).observe(player);
    }
    var playWithSound = function (e) {
      if (e) e.preventDefault();
      intro.finish();
      soundOn = true;
      player.classList.add('is-sound');
      video.loop = false;
      video.muted = false;
      video.controls = true;
      video.setAttribute('aria-label', 'Showreel, 1 minute 13 seconds, with sound and captions');
      if (video.getAttribute('src') !== reelSrc) video.setAttribute('src', reelSrc);
      if (captions) captions.mode = 'showing';
      try { video.currentTime = 0; } catch (err) {  }
      var p = video.play();
      if (p && p.catch) p.catch(function () { video.controls = true; });
      video.focus({ preventScroll: true });
      track('reel_play');
      track('reel_sound_on'); soundTracked = true;
    };
    button.addEventListener('click', playWithSound);
    video.addEventListener('click', function (e) { if (!soundOn) playWithSound(e); });
    video.addEventListener('volumechange', function () {
      if (soundOn && !video.muted && !soundTracked) { track('reel_sound_on'); soundTracked = true; }
      if (video.muted) soundTracked = false;
    });
    video.addEventListener('ended', function () {
      if (!soundOn) return;
      soundOn = false;
      video.controls = false;
      player.classList.remove('is-sound');
      label.textContent = 'Watch again';
    });
  }

  
  var rows = $$('.fmt');
  var stage = $$('.stage__p');
  if (rows.length && stage.length) {
    var setOn = function (i) {
      rows.forEach(function (r, k) { r.classList.toggle('is-on', k === i); });
      stage.forEach(function (p, k) { p.classList.toggle('is-on', k === i); });
    };
    setOn(0);
    var wide = window.matchMedia('(min-width: 1100px) and (min-height: 501px)');
    if ('IntersectionObserver' in window) {
      var rowIo = new IntersectionObserver(function (entries) {
        if (!wide.matches) return;
        entries.forEach(function (en) { if (en.isIntersecting) setOn(Number(en.target.getAttribute('data-i'))); });
      }, { rootMargin: '-45% 0px -45% 0px' });
      rows.forEach(function (r) { rowIo.observe(r); });
    }
    rows.forEach(function (r) { r.addEventListener('mouseenter', function () { if (wide.matches) setOn(Number(r.getAttribute('data-i'))); }); });
  }

  
  $$('[data-channel]').forEach(function (a) {
    var channel = a.getAttribute('data-channel');
    if (source && channel === 'whatsapp' && SITE.whatsapp) {
      a.href = 'https://wa.me/' + SITE.whatsapp + '?text=' + encodeURIComponent(withSource('Hi Nisha, I’d like to check your availability for an event.'));
    }
    if (source && channel === 'email' && SITE.email) {
      a.href = 'mailto:' + SITE.email + '?subject=' + encodeURIComponent('Event enquiry') + '&body=' + encodeURIComponent(withSource('Hi Nisha,') + '\n\n');
    }
    a.addEventListener('click', function () { track('contact', { channel: channel }); });
  });

  
  var form = $('#brief');
  if (form) {
    var hint = $('#brief-hint');
    var preview = $('.brief__preview', form);
    var previewText = $('#brief-msg');
    var FIELDS = ['event', 'date', 'city', 'name', 'reach'];
    var val = function (n) {
      var el = form.elements[n];
      return el && el.value ? String(el.value).replace(/\s+/g, ' ').trim().slice(0, 80) : '';
    };
    var compose = function () {
      var date = val('date'), city = val('city'), who = val('name'), reach = val('reach');
      var line = 'Hi Nisha, I’m planning ' + (val('event') || 'an event');
      if (date) line += ' for ' + date;
      if (city) line += ' in ' + city;
      line += ', and would like to check your availability.';
      var sign = [who, reach].filter(Boolean).join(', ');
      return withSource(sign ? line + '\n— ' + sign : line);
    };
    var subject = function () {
      var sel = form.elements.event;
      var kind = sel && sel.value !== 'an event' ? sel.options[sel.selectedIndex].text.replace(/^(an?|the) /, '') : 'event';
      kind = kind.charAt(0).toUpperCase() + kind.slice(1);
      return ['Enquiry: ' + kind, val('date'), val('city')].filter(Boolean).join(' · ');
    };
    var refresh = function () {
      var touched = ['date', 'city', 'name', 'reach'].some(function (n) { return val(n); }) || val('event') !== 'an event';
      preview.hidden = !touched;
      previewText.textContent = compose();
    };
    try {
      var saved = JSON.parse(session('pw-brief') || '{}');
      FIELDS.forEach(function (n) { if (saved[n] && form.elements[n]) form.elements[n].value = saved[n]; });
    } catch (e) {  }
    var save = function () {
      var data = {};
      FIELDS.forEach(function (n) { data[n] = form.elements[n] ? form.elements[n].value : ''; });
      session('pw-brief', JSON.stringify(data));
      refresh();
    };
    form.addEventListener('input', save);
    form.addEventListener('change', save);
    refresh();

    var reachEl = form.elements.reach;
    var looksReachable = function (v) {
      return !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) || (v.replace(/[^\d]/g, '').length >= 8 && /^[+\d\s()-]+$/.test(v));
    };
    var checkReach = function () {
      var ok = looksReachable(val('reach'));
      hint.hidden = ok;
      hint.textContent = ok ? '' : 'That doesn’t look like a phone number or an email. You can still send it as it is.';
    };
    reachEl.addEventListener('blur', checkReach);
    reachEl.addEventListener('input', function () { if (!hint.hidden) checkReach(); });

    var dateEl = form.elements.date;
    var native = $('.blank__native', form);
    var pick = $('.blank__pick', form);
    if (native && pick && typeof native.showPicker === 'function') {
      pick.hidden = false;
      pick.addEventListener('click', function () { try { native.showPicker(); } catch (e) { dateEl.focus(); } });
      native.addEventListener('change', function () {
        if (!native.value) return;
        var d = new Date(native.value + 'T12:00:00');
        dateEl.value = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
        dateEl.dispatchEvent(new Event('input', { bubbles: true }));
        dateEl.focus();
      });
    }

    if (!(window.CSS && CSS.supports && CSS.supports('field-sizing', 'content'))) {
      var ruler = document.createElement('span');
      ruler.setAttribute('aria-hidden', 'true');
      ruler.style.cssText = 'position:absolute;visibility:hidden;white-space:pre;left:-9999px;top:0';
      document.body.appendChild(ruler);
      var textWidth = function (text, el, italic) {
        var cs = getComputedStyle(el);
        ruler.style.fontFamily = cs.fontFamily; ruler.style.fontSize = cs.fontSize;
        ruler.style.fontWeight = cs.fontWeight; ruler.style.letterSpacing = cs.letterSpacing;
        ruler.style.fontStyle = italic ? 'italic' : 'normal';
        ruler.textContent = text;
        return ruler.getBoundingClientRect().width;
      };
      var fitAll = function () {
        $$('.blank input:not(.blank__native)', form).forEach(function (input) {
          var w = input.value ? textWidth(input.value, input, false) : textWidth(input.placeholder, input, true);
          input.style.width = Math.ceil(w + 8) + 'px';
        });
        $$('.blank select', form).forEach(function (select) {
          var padR = parseFloat(getComputedStyle(select).paddingRight) || 16;
          select.style.width = Math.ceil(textWidth(select.options[select.selectedIndex].text, select, false) + padR + 8) + 'px';
        });
      };
      form.addEventListener('input', fitAll);
      form.addEventListener('change', fitAll);
      fitAll();
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitAll);
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var via = e.submitter && e.submitter.value === 'email' ? 'email' : 'whatsapp';
      var text = compose();
      track('brief_send', { via: via, event: val('event') || 'an event' });
      if (via === 'whatsapp') {
        window.open('https://wa.me/' + SITE.whatsapp + '?text=' + encodeURIComponent(text), '_blank', 'noopener');
      } else {
        window.location.href = 'mailto:' + SITE.email + '?subject=' + encodeURIComponent(subject()) + '&body=' + encodeURIComponent(text);
      }
    });
  }

  
  var arrivals = $$('.reel > .segue, .reel__text, .label, .spoken, .facts, .fmt, .band__photo, .q, .qa, .floor .segue, .floor__direct, .reach, .brief');
  arrivals.forEach(function (el) { el.classList.add('rv'); });
  $$('.fmt, .q, .qa').forEach(function (el) { el.style.setProperty('--i', String(Array.prototype.indexOf.call(el.parentNode.children, el) % 3)); });
  $$('.proof .st').forEach(function (el, i) { el.style.setProperty('--i', String(i)); });
  var proof = $('.proof');
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) { entry.target.classList.add('in'); io.unobserve(entry.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
    arrivals.forEach(function (el) { io.observe(el); });
    if (proof) io.observe(proof);
  } else {
    arrivals.forEach(function (el) { el.classList.add('in'); });
    if (proof) proof.classList.add('in');
  }
})();
