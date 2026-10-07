/* watch.html · page script. The page is complete without it:
 * the sequence plays with native controls and a captions track, and each running-order row links to its full clip.
 * With JS: the reel's lower third re-cuts on every beat (the S2 caption grammar), the running order lights the
 * current beat, and each row becomes a button that plays the sequence from that beat.
 */
(function () {
  'use strict';

  var reel = document.querySelector('[data-reel]');
  var list = document.querySelector('[data-reel-list]');
  if (!reel || !list) return;

  var video = reel.querySelector('video');
  var strap = reel.querySelector('[data-reel-strap]');
  var now = reel.querySelector('[data-reel-now]');
  var full = reel.querySelector('[data-reel-full]');
  if (!video || !strap) return;

  var DOT = '·';
  var NBSP = ' ';
  var l1 = strap.querySelector('.strap__l1');
  var l2 = strap.querySelector('.strap__l2');
  var beats = Array.prototype.slice.call(list.querySelectorAll('.w-run__item')).map(function (li) {
    return {
      li: li,
      tIn: parseFloat(li.getAttribute('data-in')) || 0,
      l1: li.getAttribute('data-l1') || '',
      l2: li.getAttribute('data-l2') || '',
      full: li.getAttribute('data-full')
    };
  });
  var current = -1;
  var raf = 0;

  /* Our strap is the caption; hide the native rendering of the same track (it stays for no-JS). */
  function hideNativeCaptions() {
    for (var i = 0; i < video.textTracks.length; i++) video.textTracks[i].mode = 'hidden';
  }
  hideNativeCaptions();
  if (video.textTracks.addEventListener) video.textTracks.addEventListener('addtrack', hideNativeCaptions);

  function beatAt(t) {
    for (var i = beats.length - 1; i >= 0; i--) { if (t >= beats[i].tIn - 0.02) return i; }
    return 0;
  }

  /* Keep each separator with the word before it (and a year with its client) so narrow straps wrap cleanly. */
  function glue(text, isLine2) {
    var parts = text.split(' ' + DOT + ' ');
    if (parts.length < 2) return text;
    var last = parts.pop();
    var head = parts.join(NBSP + DOT + ' ');
    return head + NBSP + DOT + (isLine2 ? NBSP : ' ') + last;
  }

  function fmt(t) {
    var s = Math.floor(t);
    return Math.floor(s / 60) + ':' + (s % 60 < 10 ? '0' : '') + (s % 60);
  }

  /* Phones: the running order is a swipe strip; keep the current beat in view without moving the page. */
  function follow(li) {
    if (list.scrollWidth <= list.clientWidth + 1) return;
    var pad = parseFloat(window.getComputedStyle(list).paddingLeft) || 0;
    var reduce = window.NS ? window.NS.reducedMotion() : true;
    list.scrollTo({ left: Math.max(0, li.offsetLeft - pad), behavior: reduce ? 'auto' : 'smooth' });
  }

  function light(i) {
    beats.forEach(function (x, k) {
      var on = k === i;
      var row = x.li.querySelector('.w-run__row');
      x.li.classList.toggle('is-now', on);
      if (on) follow(x.li);
      if (!row) return;
      if (on) row.setAttribute('aria-current', 'step');
      else row.removeAttribute('aria-current');
    });
  }

  function setBeat(i, animate) {
    if (i === current) return;
    current = i;
    var b = beats[i];
    light(i);
    l1.textContent = glue(b.l1, false);
    l2.textContent = glue(b.l2, true);
    var reduce = window.NS ? window.NS.reducedMotion() : true;
    if (animate && !reduce) {
      strap.classList.remove('is-cut');
      void strap.offsetWidth; /* restart the wipe */
      strap.classList.add('is-cut');
    }
    if (now && full) {
      now.hidden = !b.full;
      if (b.full) {
        full.href = '#clip-' + b.full;
        full.textContent = 'Full clip: ' + b.l1;
      }
    }
  }

  function tick() {
    raf = 0;
    setBeat(beatAt(video.currentTime), true);
    if (!video.paused && !video.ended) raf = window.requestAnimationFrame(tick);
  }

  video.addEventListener('play', function () { if (!raf) raf = window.requestAnimationFrame(tick); });
  video.addEventListener('seeked', function () {
    setBeat(beatAt(video.currentTime), true);
    if (reel.getAttribute('data-state') === 'ended') light(-1);
  });
  video.addEventListener('ended', function () { light(-1); current = -1; });

  function playFrom(t) {
    if (window.NS && window.NS.pauseClips) window.NS.pauseClips(video);
    var seek = function () {
      try { video.currentTime = t + 0.01; } catch (e) { /* not seekable yet: plays from the start */ }
    };
    if (video.readyState >= 1) seek();
    else video.addEventListener('loadedmetadata', seek, { once: true });
    var p = video.play();
    if (p && p.catch) p.catch(function () { video.setAttribute('controls', ''); });
  }

  /* Rows become buttons: play the sequence from that beat. The full clip is one link away under the player. */
  beats.forEach(function (b) {
    var old = b.li.querySelector('.w-run__row');
    if (!old) return;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'w-run__row';
    btn.innerHTML = old.innerHTML;
    btn.setAttribute('aria-label', 'Play the sequence from ' + fmt(b.tIn) + ': ' + b.l1 + ', ' + b.l2);
    btn.addEventListener('click', function () { playFrom(b.tIn); });
    old.parentNode.replaceChild(btn, old);
  });
})();
