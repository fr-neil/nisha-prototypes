/* Nisha Shetty · "The loudest round of applause"
   1. The opening: her line is on screen from the first paint, dim; each word lights on
      her voice. The type starts its own clock at once; when the film starts it takes the
      clock over (seeking to where the type has got to), so the rest of the line and the
      room rising stay on her voice. Autoplay refused or Save-Data: the line still lights
      and a play button appears. Reduced motion: the line lit, no autoplay, no curtain.
   2. Header. 3. Reveal on entry. 4. Rooms counter. 5. Reel. 6. Contact and brief.
   7. Where the visit came from rides along in the message. 8. track(): one analytics hook. */
(() => {
  'use strict';

  window.__aReady = true; // tells the head failsafe that the script arrived
  document.documentElement.classList.add('js');

  const CONFIG = window.NISHA_SITE || {};
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const saveData = Boolean(navigator.connection && navigator.connection.saveData);
  const store = {
    get(key) { try { return window.sessionStorage.getItem(key); } catch (_) { return null; } },
    set(key, value) { try { window.sessionStorage.setItem(key, value); } catch (_) { /* private mode: carry on */ } },
  };

  /* ---------------------------------------------------------------- 7 · source of the visit */
  const SOURCE_NAMES = { ig: 'Instagram', instagram: 'Instagram', li: 'LinkedIn', linkedin: 'LinkedIn', wa: 'WhatsApp', whatsapp: 'WhatsApp', fb: 'Facebook', facebook: 'Facebook', email: 'email', google: 'Google', yt: 'YouTube', youtube: 'YouTube' };
  const SOURCE = (() => {
    let raw = '';
    try {
      const query = new URLSearchParams(window.location.search);
      raw = query.get('from') || query.get('utm_source') || '';
    } catch (_) { raw = ''; }
    raw = raw.toLowerCase().replace(/[^a-z0-9 _-]/g, '').trim().slice(0, 32);
    if (raw) store.set('ns.from', raw);
    else raw = store.get('ns.from') || '';
    return raw;
  })();
  const sourceNote = () => (SOURCE ? `(found you via ${SOURCE_NAMES[SOURCE] || SOURCE})` : '');
  const withSource = (text) => (sourceNote() ? `${text}\n\n${sourceNote()}` : text);

  /* ---------------------------------------------------------------- 8 · tracking stub */
  function track(name, props = {}) {
    const detail = Object.assign({ name }, props, SOURCE ? { from: SOURCE } : {});
    // Analytics hook, switched on at launch (see LAUNCH-NOTES.md). Nothing third-party loads before then.
    // if (typeof window.plausible === 'function') window.plausible(name, { props: detail });
    // if (typeof window.gtag === 'function') window.gtag('event', name, detail);
    window.dispatchEvent(new CustomEvent('nisha:track', { detail }));
  }

  /* ---------------------------------------------------------------- 1 · the opening */
  const TIMING = {
    lead: 0.04,     // a word lights a hair before her voice, never after
    rise: 9.86,     // the ballroom is on its feet (the cut is at 9.90)
    settle: 12.0,   // the words come back as the room's applause fades (clip ends 12.5)
    lastWord: 9.14, // "on." (Come on.)
    handoff: 11.2,  // the film can take the clock over until this point
    stall: 2000,    // film frozen this long mid-line: the type carries on alone
    loopFade: 0.45, // the loop crossfades through the poster (the first frame)
  };

  // play() that tells refused (false) from interrupted ('aborted') from playing (true)
  function tryPlay(video) {
    let pending;
    try { pending = video.play(); } catch (_) { return Promise.resolve(false); }
    if (!pending) return Promise.resolve(true);
    return pending.then(() => true, (err) => (err && err.name === 'AbortError' ? 'aborted' : false));
  }

  function setupShow() {
    const show = document.querySelector('[data-show]');
    if (!show) return null;
    const video = show.querySelector('[data-show-video]');
    const screen = show.querySelector('.show__screen');
    const apron = show.querySelector('.show__apron');
    const soundBtn = show.querySelector('[data-sound]');
    const soundLabel = show.querySelector('[data-sound-label]');
    const soundLen = soundBtn.querySelector('.cap-btn__len');
    const pauseBtn = show.querySelector('[data-pause]');
    const blockedBtn = show.querySelector('[data-play-blocked]');
    const wide = window.matchMedia('(min-width: 640px) and (min-aspect-ratio: 1/1)');
    const compact = window.matchMedia('(max-height: 820px)');

    // The loud word swells; a hidden ghost at full weight holds its width so nothing reflows.
    show.querySelectorAll('.w--loud').forEach((el) => {
      const text = el.textContent;
      const ghost = document.createElement('span');
      const ink = document.createElement('span');
      ghost.className = 'ghost';
      ink.className = 'ink';
      ghost.textContent = text;
      ink.textContent = text;
      el.textContent = '';
      el.append(ghost, ink);
      el.classList.add('has-ghost');
    });
    const words = [...show.querySelectorAll('.w[data-t]')].map((el) => ({ el, t: Number(el.dataset.t), phrase: el.closest('.phrase') }));

    // phase: 'show' (the moment is running) or 'ambient' (line lit, film loops muted)
    const state = { phase: 'show', mode: 'virtual', t0: performance.now(), raf: 0, risen: false, settled: false, sound: false, userPaused: false, autoPaused: false, visible: true, handing: false, lastT: -1, lastMove: 0 };

    const clock = () => (state.mode === 'video' ? video.currentTime : (performance.now() - state.t0) / 1000);
    const setCompact = () => show.classList.toggle('is-compact', compact.matches);
    setCompact();
    if (compact.addEventListener) compact.addEventListener('change', setCompact);

    function pickSource() {
      const want = wide.matches ? video.dataset.srcWide : video.dataset.srcTall;
      if (want && video.getAttribute('src') !== want) {
        video.preload = 'auto';
        video.setAttribute('src', want);
      }
    }

    function setBuilding(on) { show.classList.toggle('is-building', on); }
    function setRisen(on) {
      state.risen = on;
      show.classList.toggle('is-risen', on);
      apron.inert = on; // its buttons are off stage while the room has it
      if (on) setBuilding(false); // the whole line is in place when the words come back
      if (!on) { show.scrollTop = 0; show.scrollLeft = 0; }
    }
    function dimAll() {
      words.forEach((w) => w.el.classList.remove('is-said'));
      show.querySelectorAll('.phrase.is-current').forEach((p) => p.classList.remove('is-current'));
      state.settled = false;
      setRisen(false);
    }
    function sayAll() { words.forEach((w) => w.el.classList.add('is-said')); setBuilding(false); }
    function say(w) {
      w.el.classList.add('is-said');
      if (w.phrase && !w.phrase.classList.contains('is-current')) {
        show.querySelectorAll('.phrase.is-current').forEach((p) => p.classList.remove('is-current'));
        w.phrase.classList.add('is-current');
      }
    }

    function frame() {
      const t = clock();
      for (const w of words) {
        if (t + TIMING.lead >= w.t && !w.el.classList.contains('is-said')) say(w);
      }
      if (state.mode === 'video') {
        const now = performance.now();
        if (t !== state.lastT) { state.lastT = t; state.lastMove = now; }
        else if (!video.paused && now - state.lastMove > TIMING.stall && t < TIMING.lastWord) { toVirtual(t); }
        if (!reduceMotion.matches) {
          if (!state.risen && !state.settled && t >= TIMING.rise && t < TIMING.settle) setRisen(true);
          if (state.risen && t >= TIMING.settle) { state.settled = true; setRisen(false); }
        }
      } else if (t >= TIMING.lastWord + 0.6) { finish(); return; }
      state.raf = requestAnimationFrame(frame);
    }

    function run(mode, fromT = 0) {
      cancelAnimationFrame(state.raf);
      state.phase = 'show';
      state.mode = mode;
      state.t0 = performance.now() - fromT * 1000;
      state.lastT = -1;
      state.lastMove = performance.now();
      setBuilding(!reduceMotion.matches);
      show.classList.add('is-running');
      state.raf = requestAnimationFrame(frame);
    }
    function toVirtual(fromT) { state.mode = 'virtual'; state.t0 = performance.now() - fromT * 1000; setRisen(false); }

    function finish() {
      cancelAnimationFrame(state.raf);
      sayAll();
      setRisen(false);
      show.classList.remove('is-running');
      goAmbient();
    }

    function goAmbient() {
      state.phase = 'ambient';
      video.muted = true;
      state.sound = false;
      renderSound();
      video.loop = true;
      if (video.ended) video.currentTime = 0;
      if (!state.userPaused && state.visible && !reduceMotion.matches && !show.classList.contains('is-blocked') && video.getAttribute('src')) tryPlay(video);
    }

    // The film started after the type: hand it the clock, at the point the type has reached.
    function handOff() {
      if (state.phase !== 'show' || state.mode !== 'virtual' || state.handing) return;
      const t = clock();
      if (t > TIMING.handoff) { video.loop = true; return; } // too late for the moment: ambience
      if (t < 0.25) { state.mode = 'video'; return; } // started with the type: nothing to catch up
      state.handing = true;
      const target = Math.min(t + 0.2, video.duration ? video.duration - 0.5 : t + 0.2);
      video.addEventListener('seeked', () => { state.handing = false; if (state.phase === 'show') { state.mode = 'video'; state.lastT = -1; } }, { once: true });
      try { video.currentTime = target; } catch (_) { state.handing = false; }
    }

    function renderSound() {
      soundBtn.classList.toggle('is-on', state.sound);
      soundLabel.textContent = state.sound ? 'Mute' : 'Hear her say it';
      soundLen.hidden = state.sound;
    }
    function renderPause() {
      const paused = video.paused;
      pauseBtn.classList.toggle('is-paused', paused);
      pauseBtn.setAttribute('aria-label', paused ? 'Play video' : 'Pause video');
    }

    // From the top, with or without sound: words go back to dim and relight on her voice.
    function playFromTop(withSound) {
      pickSource();
      show.classList.remove('is-blocked');
      if (reduceMotion.matches) sayAll(); else dimAll();
      video.loop = false;
      video.muted = !withSound;
      state.sound = withSound;
      state.userPaused = false;
      renderSound();
      try { video.currentTime = 0; } catch (_) { /* not seekable yet: it starts from the top anyway */ }
      run('video');
      tryPlay(video).then((ok) => {
        if (ok !== false) return;
        state.sound = false; // refused: the type carries the moment alone
        renderSound();
        show.classList.add('is-blocked');
        run('virtual');
      });
    }

    function start() {
      if (reduceMotion.matches) { sayAll(); state.phase = 'ambient'; renderPause(); return; }
      // Arrived mid-page (deep link, restored scroll): no moment unseen; the line is lit.
      if (show.getBoundingClientRect().bottom <= 0) { sayAll(); state.visible = false; if (!saveData) pickSource(); goAmbient(); return; }
      run('virtual'); // the type starts now, on its own clock; it never waits for fonts or film
      if (saveData) { show.classList.add('is-blocked'); return; } // no film unless asked for
      // The film is asked for after the first frame is painted, so it never delays the first screen.
      requestAnimationFrame(() => setTimeout(() => {
        if (state.mode !== 'virtual' || state.phase !== 'show' || video.getAttribute('src')) return; // "Hear her say it" got there first
        pickSource();
        video.loop = false;
        tryPlay(video).then((ok) => { if (ok === false) show.classList.add('is-blocked'); });
      }, 0));
    }

    // events
    video.addEventListener('playing', () => { show.classList.add('is-playing'); show.classList.remove('is-blocked'); handOff(); });
    video.addEventListener('play', renderPause);
    video.addEventListener('pause', renderPause);
    video.addEventListener('ended', () => { if (state.phase === 'show' && state.mode === 'video') finish(); else goAmbient(); });
    video.addEventListener('error', () => { if (state.phase === 'show' && state.mode === 'video') toVirtual(clock()); });
    video.addEventListener('timeupdate', () => {
      const end = video.duration || 0;
      const near = end && video.currentTime > end - TIMING.loopFade - 0.25;
      show.classList.toggle('is-looping', Boolean(near) && !state.sound);
    });

    soundBtn.addEventListener('click', () => {
      if (state.sound) { video.muted = true; state.sound = false; renderSound(); return; }
      track('sound_on', { where: 'opening' });
      playFromTop(true);
    });
    blockedBtn.addEventListener('click', () => {
      track('sound_on', { where: 'opening', after: saveData ? 'save_data' : 'autoplay_refused' });
      playFromTop(true);
    });

    pauseBtn.addEventListener('click', () => {
      if (video.paused) {
        state.userPaused = false;
        if (state.phase !== 'show') { pickSource(); video.loop = true; }
        show.classList.remove('is-blocked');
        tryPlay(video);
      } else {
        state.userPaused = true;
        video.pause();
      }
    });

    // Pause the film while it is off screen; resume (or start the ambience) when it returns.
    if ('IntersectionObserver' in window) {
      new IntersectionObserver((entries) => {
        const entry = entries[entries.length - 1];
        state.visible = entry.isIntersecting;
        if (!state.visible) {
          if (!video.paused) { state.autoPaused = true; video.pause(); }
          return;
        }
        if (state.userPaused || reduceMotion.matches || !video.paused || show.classList.contains('is-blocked') || !video.getAttribute('src')) return;
        if (state.phase === 'show' && state.autoPaused) { state.autoPaused = false; tryPlay(video); }
        else if (state.phase === 'ambient') { state.autoPaused = false; video.loop = true; tryPlay(video); }
      }, { threshold: 0.12 }).observe(show);
    }

    // Wide screens: the room rises into the centre of the stage (CSS keeps it near native size).
    function measure() {
      show.style.setProperty('--apron-top', `${apron.offsetTop}px`);
      if (!wide.matches) { show.style.removeProperty('--rise-x'); return; }
      const shift = (show.clientWidth - screen.clientWidth) / 2;
      show.style.setProperty('--rise-x', `${(-shift).toFixed(1)}px`);
    }
    measure();
    window.addEventListener('resize', measure, { passive: true });
    if ('ResizeObserver' in window) new ResizeObserver(measure).observe(apron);

    start();

    return {
      show,
      pause() { if (!video.paused) { state.userPaused = true; video.pause(); } },
    };
  }

  /* ---------------------------------------------------------------- 2 · header */
  function setupBar(show) {
    const bar = document.querySelector('[data-bar]');
    if (!bar) return;
    let ticking = false;
    const update = () => {
      ticking = false;
      const edge = show ? show.getBoundingClientRect().bottom : 0;
      const lit = edge <= bar.offsetHeight + 1;
      bar.classList.toggle('is-lit', lit);
      bar.classList.toggle('is-solid', !lit && window.scrollY > 8); // over the opening, never transparent
    };
    update();
    window.addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
    window.addEventListener('resize', update, { passive: true });
  }

  /* ---------------------------------------------------------------- 3 · reveal on entry */
  function revealAll() { document.querySelectorAll('.reveal').forEach((el) => el.classList.add('is-in')); }
  function setupReveal() {
    const items = document.querySelectorAll('.reveal');
    if (!('IntersectionObserver' in window)) { revealAll(); return; }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-in');
        io.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.1 });
    items.forEach((el) => io.observe(el));
  }

  /* ---------------------------------------------------------------- 4 · rooms counter (phone swipe) */
  function setupRow() {
    const row = document.querySelector('[data-row]');
    const out = document.querySelector('[data-count]');
    if (!row || !out) return;
    const cards = [...row.children];
    let ticking = false;
    const update = () => {
      ticking = false;
      const left = row.getBoundingClientRect().left + parseFloat(getComputedStyle(row).scrollPaddingLeft || '0');
      let index = 0;
      let best = Infinity;
      cards.forEach((card, i) => {
        const d = Math.abs(card.getBoundingClientRect().left - left);
        if (d < best) { best = d; index = i; }
      });
      if (row.scrollLeft + row.clientWidth >= row.scrollWidth - 2) index = cards.length - 1;
      out.textContent = String(index + 1);
    };
    row.addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
    update();
  }

  /* ---------------------------------------------------------------- 5 · reel: the first play starts after the opening */
  function setupReel(heroShow) {
    const player = document.querySelector('[data-player]');
    if (!player) return;
    const reel = player.querySelector('[data-reel]');
    const button = player.querySelector('[data-reel-play]');
    const label = player.querySelector('[data-reel-label]');
    const len = player.querySelector('[data-reel-len]');
    const fromStart = document.querySelector('[data-reel-start]');
    const note = document.querySelector('[data-reel-note]');
    const SKIP = 17; // the first 17 s are the opening at the top of the page
    let played = false;
    reel.controls = false; // native controls stay for visitors without JS; ours take over here
    const showCaptions = () => { [...reel.textTracks].forEach((t) => { if (t.kind === 'captions') t.mode = 'showing'; }); };
    const seekTo = (s) => {
      if (reel.readyState >= 1) { reel.currentTime = s; return; }
      reel.addEventListener('loadedmetadata', () => { reel.currentTime = s; }, { once: true });
    };
    const play = (from) => {
      if (heroShow) heroShow.pause();
      player.classList.add('is-on');
      reel.controls = true;
      reel.muted = false;
      showCaptions();
      seekTo(from);
      tryPlay(reel).then((ok) => { if (ok === false) { player.classList.remove('is-on'); reel.controls = false; } });
      track('reel_play', { from });
    };
    button.addEventListener('click', () => { play(played ? 0 : SKIP); played = true; });
    fromStart.addEventListener('click', () => { played = true; play(0); if (note) note.hidden = true; });
    reel.addEventListener('ended', () => {
      player.classList.remove('is-on');
      reel.controls = false;
      label.textContent = 'Play again';
      len.textContent = '1:13';
      if (note) note.hidden = true;
    });
  }

  /* ---------------------------------------------------------------- 6 · contact links and the brief */
  const DEFAULT_MESSAGE = 'Hi Nisha, I found your website and would like to check your availability for an event.';

  function setupContacts() {
    document.querySelectorAll('[data-contact]').forEach((a) => {
      const kind = a.dataset.contact;
      if (kind === 'whatsapp' && CONFIG.whatsapp) a.href = `https://wa.me/${CONFIG.whatsapp}?text=${encodeURIComponent(withSource(DEFAULT_MESSAGE))}`;
      if (kind === 'email' && CONFIG.email) a.href = `mailto:${CONFIG.email}?subject=${encodeURIComponent('Event enquiry')}&body=${encodeURIComponent(withSource(DEFAULT_MESSAGE))}`;
      a.addEventListener('click', () => track('contact_tap', { channel: kind, where: 'contact' }));
    });
  }

  const MONTHS = /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i;
  function dateText(raw) {
    const value = raw.trim();
    if (!value) return '';
    const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value); // from the native date picker
    if (iso) {
      const d = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
      return ` on ${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`;
    }
    if (/(^|\D)\d{1,2}(\D|$)/.test(value) && !/^q\d/i.test(value)) return ` on ${value}`;
    if (MONTHS.test(value)) return ` in ${value}`;
    return ` (${value})`;
  }

  function compose(form) {
    const data = new FormData(form);
    const get = (k) => String(data.get(k) || '').trim();
    let text = `Hi Nisha, I’m planning ${get('type') || 'an event'}`;
    if (get('city')) text += ` in ${get('city')}`;
    text += dateText(get('date'));
    if (data.get('flexible')) text += get('date') ? ' (dates flexible)' : ', dates flexible,';
    text += ' and would like to check your availability.';
    const sign = [get('name'), get('reply')].filter(Boolean).join(' · ');
    if (sign) text += `\n\n${sign}`;
    return withSource(text);
  }

  function subject(form) {
    const data = new FormData(form);
    const chip = form.querySelector('input[name="type"]:checked');
    const parts = [chip ? chip.nextElementSibling.textContent : 'Event', dateText(String(data.get('date') || '')).replace(/^ (on|in) /, '').replace(/^ \(|\)$/g, ''), String(data.get('city') || '').trim()];
    return `Enquiry: ${parts.filter(Boolean).join(', ')}`;
  }

  const looksReachable = (v) => !v || /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(v) || /^\+?[\d\s()-]{8,}$/.test(v);

  function setupBrief() {
    const form = document.querySelector('[data-brief]');
    if (!form) return;
    const msg = form.querySelector('[data-msg]');
    const reply = form.elements.reply;
    const hint = form.querySelector('[data-reply-hint]');
    const date = form.elements.date;
    let lastVia = 'wa'; // for browsers without event.submitter

    try { date.min = new Date().toISOString().slice(0, 10); } catch (_) { /* text fallback */ }

    // Never lose what was typed: the brief survives a reload or a trip to WhatsApp and back.
    const fields = ['type', 'date', 'city', 'name', 'reply'];
    const save = () => {
      const data = new FormData(form);
      const saved = {};
      fields.forEach((k) => { saved[k] = String(data.get(k) || ''); });
      saved.flexible = data.get('flexible') ? '1' : '';
      store.set('ns.brief', JSON.stringify(saved));
    };
    const restore = () => {
      let saved = null;
      try { saved = JSON.parse(store.get('ns.brief') || 'null'); } catch (_) { saved = null; }
      if (!saved || typeof saved !== 'object') return;
      ['date', 'city', 'name', 'reply'].forEach((k) => { if (typeof saved[k] === 'string' && form.elements[k]) form.elements[k].value = saved[k]; });
      if (saved.type) { const chip = [...form.querySelectorAll('input[name="type"]')].find((c) => c.value === saved.type); if (chip) chip.checked = true; }
      form.elements.flexible.checked = Boolean(saved.flexible);
    };

    const checkReply = () => {
      const ok = looksReachable(reply.value.trim());
      hint.textContent = ok ? '' : 'That doesn’t look like a phone number or an email. Send anyway, or check it.';
      reply.setAttribute('aria-invalid', String(!ok));
      return ok;
    };
    const render = () => { msg.textContent = compose(form); };

    form.addEventListener('input', () => { render(); save(); if (hint.textContent) checkReply(); });
    form.addEventListener('change', () => { render(); save(); });
    reply.addEventListener('blur', checkReply);
    form.querySelectorAll('button[type="submit"]').forEach((b) => b.addEventListener('click', () => { lastVia = b.value; }));
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      checkReply(); // gentle: a hint, never a block
      const via = event.submitter ? event.submitter.value : lastVia;
      const text = compose(form);
      const chip = form.querySelector('input[name="type"]:checked');
      track('brief_send', { channel: via === 'mail' ? 'email' : 'whatsapp', type: chip ? chip.value : 'unspecified' });
      if (via === 'mail') {
        window.location.href = `mailto:${CONFIG.email}?subject=${encodeURIComponent(subject(form))}&body=${encodeURIComponent(text)}`;
      } else {
        window.open(`https://wa.me/${CONFIG.whatsapp}?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
      }
    });
    restore();
    render();
  }

  /* ---------------------------------------------------------------- boot: each part fails on its own, to a readable page */
  function safely(fn, fallback) {
    try { return fn(); } catch (err) {
      if (fallback) fallback();
      if (typeof window.reportError === 'function') window.reportError(err);
      return null;
    }
  }
  const sayEverything = () => document.querySelectorAll('[data-said] .w').forEach((w) => w.classList.add('is-said'));
  const hero = safely(setupShow, sayEverything);
  safely(() => setupBar(hero && hero.show));
  safely(setupReveal, revealAll);
  safely(setupRow);
  safely(() => setupReel(hero));
  safely(setupContacts);
  safely(setupBrief);
})();
