/* Experience pages: click-to-play clips ([data-xclip]). One clip plays at a time; silent clips stay muted;
   sound clips play with sound on click and show HTML captions from their <track> (verified cues only).
   Without JS the native controls stay on each <video>. */
(function () {
  'use strict'
  var clips = Array.prototype.slice.call(document.querySelectorAll('[data-xclip]'))
  if (!clips.length) return
  var videos = []

  function setup (frame) {
    var video = frame.querySelector('video')
    var btn = frame.querySelector('[data-xclip-btn]')
    var label = frame.querySelector('[data-xclip-label]')
    var ccOut = frame.querySelector('[data-xclip-cc]')
    if (!video || !btn) return
    var hasSound = frame.hasAttribute('data-sound')
    var idle = hasSound ? 'Play with sound' : 'Play'
    video.removeAttribute('controls')
    if (!hasSound) video.muted = true
    btn.hidden = false
    videos.push(video)

    var track = video.textTracks && video.textTracks[0]
    if (track && ccOut) {
      track.mode = 'hidden'
      track.addEventListener('cuechange', function () {
        var cues = track.activeCues; var text = []
        for (var i = 0; cues && i < cues.length; i++) text.push(cues[i].text)
        ccOut.textContent = text.join(' ')
        ccOut.hidden = !text.length
      })
    }
    var render = function () {
      var playing = !video.paused && !video.ended
      frame.classList.toggle('is-playing', playing)
      label.textContent = playing ? 'Pause' : (video.ended ? 'Play again' : idle)
      if (!playing && ccOut) ccOut.hidden = true
    }
    var toggle = function () {
      if (video.paused || video.ended) {
        videos.forEach(function (v) { if (v !== video && !v.paused) v.pause() })
        var p = video.play(); if (p && p.catch) p.catch(function () {})
      } else video.pause()
    }
    btn.addEventListener('click', toggle)
    video.addEventListener('click', toggle)
    ;['play', 'pause', 'ended'].forEach(function (ev) { video.addEventListener(ev, render) })
    render()
  }
  clips.forEach(setup)

  // Pause a playing clip once it scrolls out of view.
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (!en.isIntersecting && !en.target.paused) en.target.pause() })
    }, { threshold: 0 })
    videos.forEach(function (v) { io.observe(v) })
  }
})()
