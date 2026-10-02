/* Prototype 6 core behaviour, shared by every page (READ-ONLY for page builders).
   header compaction · phone menu (focus trap, Esc) · phone request bar · [data-loop] videos ·
   [data-player] showreel · [data-snap] carousels · .reveal · review-marks toggle.
   Every feature degrades to readable static HTML without JS. */
(function () {
  'use strict'
  var doc = document
  var root = doc.documentElement
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
  var phoneMq = window.matchMedia('(max-width: 767px)')
  var hasIO = 'IntersectionObserver' in window
  var $ = function (sel, ctx) { return (ctx || doc).querySelector(sel) }
  var $$ = function (sel, ctx) { return Array.prototype.slice.call((ctx || doc).querySelectorAll(sel)) }

  /* ---------- header: 88 → 64 px after 80 px of scroll ---------- */
  function initHeader () {
    var header = $('[data-header]')
    if (!header) return
    var ticking = false
    var update = function () { header.classList.toggle('is-compact', window.scrollY > 80); ticking = false }
    window.addEventListener('scroll', function () { if (!ticking) { ticking = true; window.requestAnimationFrame(update) } }, { passive: true })
    update()
  }

  /* ---------- phone menu sheet ---------- */
  function initMenu () {
    var openLink = $('[data-menu-open]')
    var sheet = $('#menu-sheet')
    if (!openLink || !sheet) return
    var closeBtn = $('[data-menu-close]', sheet)
    openLink.setAttribute('role', 'button')
    openLink.setAttribute('aria-expanded', 'false')
    var focusables = function () { return $$('a[href], button:not([disabled])', sheet).filter(function (el) { return el.offsetParent !== null }) }
    var open = function () {
      sheet.hidden = false
      root.classList.add('menu-open')
      openLink.setAttribute('aria-expanded', 'true')
      closeBtn.focus()
    }
    var close = function () {
      sheet.hidden = true
      root.classList.remove('menu-open')
      openLink.setAttribute('aria-expanded', 'false')
      openLink.focus()
    }
    openLink.addEventListener('click', function (e) { e.preventDefault(); open() })
    openLink.addEventListener('keydown', function (e) { if (e.key === ' ') { e.preventDefault(); open() } })
    closeBtn.addEventListener('click', close)
    sheet.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.preventDefault(); close(); return }
      if (e.key !== 'Tab') return
      var items = focusables()
      if (!items.length) return
      var first = items[0]; var last = items[items.length - 1]
      if (e.shiftKey && doc.activeElement === first) { e.preventDefault(); last.focus() } else if (!e.shiftKey && doc.activeElement === last) { e.preventDefault(); first.focus() }
    })
    phoneMq.addEventListener('change', function (e) { if (!e.matches && !sheet.hidden) close() })
  }

  /* ---------- phone request bar: shown from the first screen (review fix 3 Oct, owner to confirm: the IA asks for a
     persistent request CTA); hidden only while the hero buttons, a CTA band or the footer are on screen ---------- */
  function initPhoneBar () {
    var bar = $('[data-phone-bar]')
    if (!bar || !hasIO) return
    var blockers = $$('[data-hide-bar], [data-cta-band], .site-footer')
    var visible = new Set()
    var update = function () {
      var show = visible.size === 0
      bar.classList.toggle('is-shown', show)
      bar.setAttribute('aria-hidden', show ? 'false' : 'true')
      $$('a', bar).forEach(function (a) { a.tabIndex = show ? 0 : -1 })
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) visible.add(en.target); else visible.delete(en.target) })
      update()
    })
    blockers.forEach(function (el) { io.observe(el) })
    window.addEventListener('scroll', update, { passive: true })
    update()
  }

  /* ---------- [data-loop] videos: muted loops that play only while visible; [data-loops] group + pause control ---------- */
  function initLoops () {
    var groups = $$('[data-loops]')
    $$('video[data-loop]').forEach(function (v) { if (!v.closest('[data-loops]')) { v.parentNode.setAttribute('data-loops', ''); groups.push(v.parentNode) } })
    groups.forEach(function (group) {
      var videos = $$('video[data-loop]', group)
      var toggle = $('[data-loop-toggle]', group)
      var userPaused = reduceMotion.matches
      var inView = false
      videos.forEach(function (v) { v.muted = true; v.setAttribute('muted', ''); v.playsInline = true })
      var visibleVideos = function () { return videos.filter(function (v) { return v.offsetParent !== null }) }
      var label = function () {
        if (!toggle) return
        toggle.setAttribute('aria-pressed', userPaused ? 'true' : 'false')
        var t = $('[data-loop-label]', toggle) || toggle
        t.textContent = userPaused ? 'Play' : 'Pause'
      }
      var sync = function () {
        visibleVideos().forEach(function (v) {
          if (!userPaused && inView) { var p = v.play(); if (p && p.catch) p.catch(function () {}) } else v.pause()
        })
        label()
      }
      if (toggle) toggle.addEventListener('click', function () { userPaused = !userPaused; sync() })
      if (hasIO) {
        new IntersectionObserver(function (entries) { inView = entries[0].isIntersecting; sync() }, { threshold: 0.15 }).observe(group)
      } else { inView = true; sync() }
      reduceMotion.addEventListener('change', function (e) { if (e.matches) { userPaused = true; sync() } })
      phoneMq.addEventListener('change', sync)
      label()
    })
  }

  /* ---------- [data-player] showreel: native video + custom controls, HTML captions, chapters ---------- */
  var fmt = function (s) { s = Math.max(0, Math.floor(s || 0)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0') }
  function initPlayer (el) {
    var video = $('video', el)
    if (!video) return
    var bar = $('[data-player-bar]', el)
    var big = $('[data-player-play]', el)
    var toggle = $('[data-player-toggle]', el)
    var mute = $('[data-player-mute]', el)
    var ccBtn = $('[data-player-cc]', el)
    var ccOut = $('[data-player-captions]', el)
    var time = $('[data-player-time]', el)
    var chapters = $$('[data-t]', el)
    var ccOn = true
    video.removeAttribute('controls')
    el.classList.add('is-enhanced')
    var tallSrc = video.getAttribute('data-src-tall')
    if (tallSrc && phoneMq.matches) {
      var source = $('source', video)
      if (source) source.src = tallSrc; else video.src = tallSrc
      var tallPoster = video.getAttribute('data-poster-tall')
      if (tallPoster) video.poster = tallPoster
      var tw = video.getAttribute('data-tall-w'); var th = video.getAttribute('data-tall-h')
      if (tw && th) { video.width = Number(tw); video.height = Number(th) }
      el.classList.add('is-tall')
      video.load()
    }
    var track = video.textTracks && video.textTracks[0]
    if (track) {
      track.mode = 'hidden'
      track.addEventListener('cuechange', function () {
        var cues = track.activeCues; var text = []
        for (var i = 0; cues && i < cues.length; i++) text.push(cues[i].text)
        ccOut.textContent = text.join(' ')
        ccOut.hidden = !ccOn || !text.length
      })
    }
    var render = function () {
      var playing = !video.paused && !video.ended
      el.classList.toggle('is-playing', playing)
      if (toggle) { toggle.textContent = playing ? 'Pause' : 'Play'; toggle.setAttribute('aria-label', playing ? 'Pause showreel' : 'Play showreel') }
      if (mute) mute.textContent = video.muted ? 'Unmute' : 'Mute' // action label, no aria-pressed (one pattern)
      if (ccBtn) ccBtn.setAttribute('aria-pressed', ccOn ? 'true' : 'false')
      if (time) time.textContent = fmt(video.currentTime) + (isFinite(video.duration) ? ' / ' + fmt(video.duration) : '')
      var active = null
      chapters.forEach(function (c) { if (video.currentTime + 0.05 >= Number(c.getAttribute('data-t'))) active = c })
      chapters.forEach(function (c) { var on = c === active && (playing || video.currentTime > 0); c.classList.toggle('is-active', on); if (on) c.setAttribute('aria-current', 'true'); else c.removeAttribute('aria-current') })
    }
    var play = function () { var p = video.play(); if (p && p.catch) p.catch(function () {}) }
    // Before the first play only the big button shows; the control bar appears once playback starts.
    var reveal = function () { if (bar && bar.hidden) bar.hidden = false }
    video.addEventListener('play', reveal)
    if (big) big.addEventListener('click', function () { reveal(); play(); if (toggle) toggle.focus() })
    if (toggle) toggle.addEventListener('click', function () { if (video.paused || video.ended) play(); else video.pause() })
    video.addEventListener('click', function () { if (video.paused) play(); else video.pause() })
    if (mute) mute.addEventListener('click', function () { video.muted = !video.muted; render() })
    if (ccBtn) ccBtn.addEventListener('click', function () { ccOn = !ccOn; if (!ccOn) ccOut.hidden = true; render() })
    chapters.forEach(function (c) { c.addEventListener('click', function () { reveal(); video.currentTime = Number(c.getAttribute('data-t')); play() }) })
    ;['play', 'pause', 'ended', 'timeupdate', 'loadedmetadata', 'volumechange'].forEach(function (ev) { video.addEventListener(ev, render) })
    render()
  }

  /* ---------- [data-snap] carousels: "1 / 8" counter ---------- */
  function initSnap () {
    $$('[data-snap]').forEach(function (track) {
      var counter = track.parentNode.querySelector('[data-snap-count]')
      var items = Array.prototype.slice.call(track.children)
      if (!counter || !items.length) return
      var update = function () {
        var left = track.scrollLeft; var best = 0; var bestD = Infinity
        items.forEach(function (it, i) { var d = Math.abs(it.offsetLeft - track.offsetLeft - left - parseFloat(getComputedStyle(track).paddingLeft || 0)); if (d < bestD) { bestD = d; best = i } })
        counter.textContent = (best + 1) + ' / ' + items.length
      }
      track.addEventListener('scroll', function () { window.requestAnimationFrame(update) }, { passive: true })
      update()
    })
  }

  /* ---------- .reveal: fade-up 12 px / 480 ms once ---------- */
  function initReveal () {
    var els = $$('.reveal')
    if (!els.length) return
    if (!hasIO || reduceMotion.matches) { els.forEach(function (el) { el.classList.add('is-in') }); return }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target) } })
    }, { rootMargin: '0px 0px -8% 0px' })
    els.forEach(function (el) { io.observe(el) })
  }

  /* ---------- [data-collapse] secondary lists: on phones the first three rows, then "Show all N" (no-JS: all rows) ---------- */
  function initCollapse () {
    $$('[data-collapse]').forEach(function (list) {
      var items = $$(':scope > li', list)
      if (items.length <= 3) return
      var btn = doc.createElement('button')
      btn.type = 'button'
      btn.className = 'tlink collapse-more'
      btn.textContent = 'Show all ' + items.length
      list.parentNode.insertBefore(btn, list.nextSibling)
      list.classList.add('is-collapsed')
      btn.addEventListener('click', function () {
        list.classList.remove('is-collapsed')
        btn.parentNode.removeChild(btn)
        items[3].setAttribute('tabindex', '-1')
        items[3].focus({ preventScroll: true })
      })
    })
  }

  /* ---------- review marks toggle (footer) ---------- */
  function initMarks () {
    var btn = $('[data-marks-toggle]')
    if (!btn) return
    var state = $('[data-marks-state]', btn)
    var render = function () { var on = root.classList.contains('marks-on'); btn.setAttribute('aria-pressed', on ? 'true' : 'false'); if (state) state.textContent = on ? 'on' : 'off' }
    btn.addEventListener('click', function () {
      root.classList.toggle('marks-on')
      try { localStorage.setItem('p6-marks', root.classList.contains('marks-on') ? 'on' : 'off') } catch (e) { /* storage unavailable: session-only toggle */ }
      render()
    })
    render()
  }

  function init () {
    initHeader(); initMenu(); initPhoneBar(); initLoops()
    $$('[data-player]').forEach(initPlayer)
    initSnap(); initReveal(); initCollapse(); initMarks()
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init); else init()
})()
