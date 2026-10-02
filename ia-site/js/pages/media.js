/* js/pages/media.js: media page clips (builder-owned).
   Each [data-clip] figure ships with native controls (no-JS works). With JS: one "Play" button on the frame;
   the clip plays (with its sound, at the viewer's request) and native controls appear. Only one video plays at a time
   (clips and the showreel); silent [data-loop] videos are left to js/core.js. */
(function () {
  'use strict'
  var doc = document
  var clips = Array.prototype.slice.call(doc.querySelectorAll('[data-clip]'))

  clips.forEach(function (fig) {
    var video = fig.querySelector('video')
    var btn = fig.querySelector('[data-clip-play]')
    if (!video || !btn) return
    video.removeAttribute('controls')
    btn.hidden = false
    btn.addEventListener('click', function () {
      video.controls = true
      btn.hidden = true
      var p = video.play()
      if (p && p.catch) p.catch(function () { btn.hidden = false })
      video.focus()
    })
    video.addEventListener('play', function () { btn.hidden = true; video.controls = true })
  })

  // One at a time: when any non-loop video starts, pause the other non-loop videos. Play events do not bubble: capture.
  doc.addEventListener('play', function (e) {
    var started = e.target
    if (!started || started.tagName !== 'VIDEO' || started.hasAttribute('data-loop')) return
    Array.prototype.forEach.call(doc.querySelectorAll('video:not([data-loop])'), function (v) {
      if (v !== started && !v.paused) v.pause()
    })
  }, true)
})()
