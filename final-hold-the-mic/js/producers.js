/* For producers: Copy buttons for the bios and the announcer's intro, and "Print / save as PDF".
   The held clips run on mic.js; the menu, bar, chip index and bio switch on site.js. */
(function () {
  'use strict';
  var doc = document;
  var DONE_MS = 2000;
  var ANNOUNCE_MS = 60;

  /* the text a producer pastes: blanks for the announcer come out as [event name] */
  function textOf(el) {
    var clone = el.cloneNode(true);
    Array.prototype.forEach.call(clone.querySelectorAll('.fill'), function (f) { f.textContent = '[' + f.textContent + ']'; });
    var parts = clone.querySelectorAll('p');
    var text = parts.length ? Array.prototype.map.call(parts, function (p) { return p.textContent; }).join('\n\n') : clone.textContent;
    return text.replace(/[ \t]+/g, ' ').replace(/‑/g, '-').trim();
  }

  /* clipboard API where allowed; a hidden textarea and execCommand otherwise */
  function fallbackCopy(text) {
    var ta = doc.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', '');
    ta.style.position = 'fixed'; ta.style.top = '-1000px'; ta.style.opacity = '0';
    doc.body.appendChild(ta); ta.select();
    var ok = false;
    try { ok = doc.execCommand('copy'); } catch (e) { ok = false; }
    doc.body.removeChild(ta);
    return ok;
  }
  function copy(text) {
    if (navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext) {
      return navigator.clipboard.writeText(text).then(function () { return true; }, function () { return fallbackCopy(text); });
    }
    return Promise.resolve(fallbackCopy(text));
  }

  var live = doc.createElement('p');
  live.className = 'sr'; live.setAttribute('aria-live', 'polite');
  doc.body.appendChild(live);

  Array.prototype.forEach.call(doc.querySelectorAll('.copy-btn'), function (btn) {
    var label = btn.textContent, timer = 0;
    if (!btn.closest('.bio-switch')) btn.hidden = false;
    btn.addEventListener('click', function () {
      var target = doc.getElementById(btn.getAttribute('data-copy'));   /* read on click: the bio switch retargets it */
      if (!target) return;
      copy(textOf(target)).then(function (ok) {
        clearTimeout(timer);
        btn.textContent = ok ? 'Copied' : 'Select and copy';
        btn.classList.toggle('done', ok);
        /* clear first, so a second copy in a row is announced again */
        var msg = ok ? 'Copied to the clipboard.' : 'Copy is blocked here. Select the text to copy it.';
        live.textContent = '';
        setTimeout(function () { live.textContent = msg; }, ANNOUNCE_MS);
        timer = setTimeout(function () { btn.textContent = label; btn.classList.remove('done'); }, DONE_MS);
      });
    });
  });

  /* print: the browser's own dialog ("Save as PDF" lives there) */
  Array.prototype.forEach.call(doc.querySelectorAll('.print-btn'), function (btn) {
    if (typeof window.print !== 'function') return;
    btn.hidden = false;
    btn.addEventListener('click', function () { window.print(); });
  });

  /* the printed sheet names where the clips can be heard */
  var here = doc.querySelector('.here-url');
  if (here) here.textContent = location.href.replace(/[#?].*$/, '').replace(/producers\.html$/, '');
})();
