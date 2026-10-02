/* Work index + event stories (builder B2). Runs after js/core.js.
   [data-filters] filter bar (work/index.html): All · Corporate · … · TV; #awards and ?f=awards deep links.
   [data-hero-clip] story hero clip: autoplays muted on tablet/desktop while visible; tap to play on phones.
   [data-hover-clip] index clips: play muted on hover or focus; a Play control for touch.
   Without JS: no filter bar, every entry shown, clips keep native controls. */
(function () {
  'use strict'
  var doc = document
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
  var phoneMq = window.matchMedia('(max-width: 767px)')
  var hasIO = 'IntersectionObserver' in window
  var $ = function (sel, ctx) { return (ctx || doc).querySelector(sel) }
  var $$ = function (sel, ctx) { return Array.prototype.slice.call((ctx || doc).querySelectorAll(sel)) }
  var play = function (v) { var p = v.play(); if (p && p.catch) p.catch(function () { /* autoplay refused: poster stays */ }) }

  /* ---------- filter bar ---------- */
  function initFilters () {
    var bar = $('[data-filters]')
    if (!bar) return
    var buttons = $$('[data-filter]', bar)
    var keys = buttons.map(function (b) { return b.getAttribute('data-filter') })
    var labels = {}
    buttons.forEach(function (b) { labels[b.getAttribute('data-filter')] = b.querySelector('.filter__label').textContent })
    var sections = $$('[data-filter-section]')
    var empties = $$('[data-empty]')
    var status = $('[data-filter-status]', bar)
    // Long lists show their first N matches, then "Show all" ([data-limit]; [data-limit-wide] = tablet/desktop only,
    // because on phones that list is a sideways snap row).
    var lists = $$('[data-limit]').map(function (el) {
      var sec = el.closest('[data-filter-section]') || el.parentNode
      return { el: el, n: Number(el.getAttribute('data-limit')) || 24, wide: el.hasAttribute('data-limit-wide'), more: $('[data-more]', sec), open: false }
    })
    var current = 'all'

    var matches = function (el, f) { return f === 'all' || (' ' + el.getAttribute('data-f') + ' ').indexOf(' ' + f + ' ') !== -1 }

    function applyLimits () {
      lists.forEach(function (l) {
        var shown = Array.prototype.slice.call(l.el.children).filter(function (r) { return !r.hidden })
        var cap = l.open || (l.wide && phoneMq.matches) ? Infinity : l.n
        shown.forEach(function (r, i) { r.classList.toggle('is-over', i >= cap) })
        if (!l.more) return
        l.more.hidden = shown.length <= cap
        var entries = shown.reduce(function (a, r) { return a + (Number(r.getAttribute('data-n')) || 1) }, 0)
        l.more.textContent = 'Show all ' + entries + (l.el.classList.contains('record') ? ' entries' : '')
      })
    }
    lists.forEach(function (l) {
      if (!l.more) return
      l.more.addEventListener('click', function () {
        var next = l.el.querySelector('.is-over') // first entry that was cut off: focus moves there
        l.open = true
        applyLimits()
        if (next) { next.setAttribute('tabindex', '-1'); next.focus({ preventScroll: true }) }
      })
    })
    phoneMq.addEventListener('change', applyLimits)

    function apply (f, opts) {
      current = f
      var total = 0
      sections.forEach(function (sec) {
        var items = $$('[data-f]', sec)
        var n = 0
        items.forEach(function (el) { var on = matches(el, f); el.hidden = !on; if (on) n += Number(el.getAttribute('data-n')) || 1 }) // grouped rows count their entries
        var count = $('[data-count]', sec)
        if (count) count.textContent = n
        sec.hidden = n === 0
        if (sec.hasAttribute('id') && sec.id === 'record') total = n
        // keep the two-column stagger on the cards that are still visible
        var grid = $('[data-stagger]', sec)
        if (grid) $$('.story-card', grid).filter(function (c) { return !c.hidden }).forEach(function (c, i) { c.classList.toggle('is-offset', i % 2 === 1) })
      })
      empties.forEach(function (e) { e.hidden = e.getAttribute('data-empty') !== f })
      buttons.forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-filter') === f ? 'true' : 'false') })
      lists.forEach(function (l) { l.open = false })
      applyLimits()
      if (status) status.textContent = f === 'all' ? 'Showing all ' + total + ' entries' : 'Showing ' + total + ' entries for ' + labels[f]
      // phones: the filter row scrolls sideways; bring the active filter into view (tap or deep link)
      var on = $('[aria-pressed="true"]', bar); var list = $('.filters__list', bar)
      if (on && list && list.scrollWidth > list.clientWidth) list.scrollTo({ left: on.offsetLeft - (list.clientWidth - on.offsetWidth) / 2, behavior: 'auto' })
      if (opts && opts.push) {
        try { window.history.replaceState(null, '', f === 'all' ? window.location.pathname : '?f=' + f) } catch (e) { /* file:// or sandbox: URL stays */ }
      }
    }

    buttons.forEach(function (b) {
      b.addEventListener('click', function () {
        apply(b.getAttribute('data-filter'), { push: true })
        var first = $('[data-filter-section]:not([hidden]), [data-empty]:not([hidden])')
        var top = bar.getBoundingClientRect().bottom
        if (first && first.getBoundingClientRect().top < top) bar.scrollIntoView({ block: 'start', behavior: reduceMotion.matches ? 'auto' : 'smooth' })
      })
    })

    var fromQuery = (/[?&]f=([a-z]+)/.exec(window.location.search) || [])[1]
    var fromHash = window.location.hash.replace('#', '')
    var start = keys.indexOf(fromQuery) !== -1 ? fromQuery : (keys.indexOf(fromHash) !== -1 ? fromHash : 'all')
    apply(start)
    window.addEventListener('hashchange', function () { var h = window.location.hash.replace('#', ''); if (keys.indexOf(h) !== -1 && h !== current) apply(h) })
  }

  /* ---------- story hero clip ---------- */
  function initHeroClips () {
    $$('video[data-hero-clip]').forEach(function (v) {
      var btn = v.parentNode.querySelector('[data-hero-toggle]')
      var userPaused = reduceMotion.matches || phoneMq.matches
      var inView = !hasIO
      v.muted = true
      var label = function () {
        if (!btn) return
        var playing = !v.paused
        btn.textContent = playing ? 'Pause' : 'Play'
        btn.setAttribute('aria-label', (playing ? 'Pause' : 'Play') + ' the clip') // action label only, no aria-pressed
      }
      var sync = function () { if (!userPaused && inView) play(v); else v.pause() }
      if (btn) btn.addEventListener('click', function () { userPaused = !v.paused; if (!userPaused) inView = true; sync() })
      v.addEventListener('play', label); v.addEventListener('pause', label)
      if (hasIO) new IntersectionObserver(function (en) { inView = en[0].isIntersecting; sync() }, { threshold: 0.2 }).observe(v)
      reduceMotion.addEventListener('change', function (e) { if (e.matches) { userPaused = true; sync() } })
      label(); sync()
    })
  }

  /* ---------- hover / focus clips on the index ---------- */
  function initHoverClips () {
    $$('video[data-hover-clip]').forEach(function (v) {
      v.removeAttribute('controls')
      v.muted = true
      var item = v.closest('figure') || v.parentNode
      var btn = doc.createElement('button')
      btn.type = 'button'
      btn.className = 'media-ctl'
      btn.textContent = 'Play'
      btn.setAttribute('aria-label', 'Play the clip: ' + (v.getAttribute('aria-label') || ''))
      v.parentNode.appendChild(btn)
      var pinned = false
      var label = function () { btn.textContent = v.paused ? 'Play' : 'Pause' }
      var preview = function () { if (!reduceMotion.matches) play(v) }
      var stop = function () { if (!pinned) v.pause() }
      item.addEventListener('mouseenter', preview)
      item.addEventListener('mouseleave', stop)
      btn.addEventListener('focus', preview)
      btn.addEventListener('blur', stop)
      btn.addEventListener('click', function () { if (v.paused) { pinned = true; play(v) } else { pinned = false; v.pause() } })
      v.addEventListener('play', label); v.addEventListener('pause', label)
      if (hasIO) new IntersectionObserver(function (en) { if (!en[0].isIntersecting) { pinned = false; v.pause() } }).observe(v)
      var hi = v.getAttribute('data-poster-hi')
      if (hi && hasIO) {
        var near = new IntersectionObserver(function (en) { if (en[0].isIntersecting) { v.poster = hi; near.disconnect() } }, { rootMargin: '300px' })
        near.observe(v)
      } else if (hi) v.poster = hi
    })
  }

  /* ---------- story CTA keeps the visitor's event type (?type= from an experience page) ---------- */
  function initTypeCarry () {
    var TYPES = ['corporate', 'conference', 'awards', 'launch', 'wedding', 'entertainment', 'sports', 'private']
    var t = (/[?&]type=([a-z]+)/.exec(window.location.search) || [])[1]
    if (!t || TYPES.indexOf(t) === -1) return
    $$('[data-cta-band] a[href*="request.html"]').forEach(function (a) {
      a.setAttribute('href', a.getAttribute('href').replace(/request\.html(\?type=[a-z]*)?/, 'request.html?type=' + t))
    })
  }

  function init () { initFilters(); initHeroClips(); initHoverClips(); initTypeCarry() }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init); else init()
})()
