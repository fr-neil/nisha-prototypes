/* event-managers.html · page script. The page must work without it.
 * One enhancement: "Copy text" on each bio and "Copy link" on each clip. Without JS the bios are selectable
 * text and every clip is a plain link. On touch devices with a share sheet, the clip buttons read "Share"
 * and open it (WhatsApp, mail); elsewhere they copy the link. Buttons stay hidden when neither is available.
 */
(function () {
  'use strict';

  var canCopy = !!(navigator.clipboard && window.isSecureContext);
  var canShare = typeof navigator.share === 'function' && window.matchMedia('(pointer: coarse)').matches;
  if (!canCopy && !canShare) return;

  var status = document.querySelector('[data-copy-status]');
  var RESET_MS = 2000;

  function announce(msg) {
    if (!status) return;
    status.textContent = '';
    window.setTimeout(function () { status.textContent = msg; }, 30);
  }

  function flash(btn, doneLabel) {
    var label = btn.getAttribute('data-label') || btn.textContent;
    btn.setAttribute('data-label', label);
    btn.textContent = doneLabel;
    btn.setAttribute('data-copied', '');
    window.clearTimeout(btn.__t);
    btn.__t = window.setTimeout(function () {
      btn.textContent = label;
      btn.removeAttribute('data-copied');
    }, RESET_MS);
  }

  function copy(text, btn, doneLabel, message) {
    if (!canCopy) { announce('Copying is blocked in this browser. Select the text instead.'); return; }
    navigator.clipboard.writeText(text).then(function () {
      flash(btn, doneLabel);
      announce(message);
    }, function () {
      announce('Copying is blocked in this browser. Select the text instead.');
    });
  }

  if (canCopy) {
    Array.prototype.forEach.call(document.querySelectorAll('[data-copy]'), function (btn) {
      var source = document.querySelector(btn.getAttribute('data-copy'));
      if (!source) return;
      btn.hidden = false;
      btn.addEventListener('click', function () {
        copy(source.textContent.replace(/\s+/g, ' ').trim(), btn, 'Copied', 'Bio copied.');
      });
    });
  }

  Array.prototype.forEach.call(document.querySelectorAll('[data-copy-link]'), function (btn) {
    btn.hidden = false;
    if (canShare) btn.textContent = 'Share';
    btn.addEventListener('click', function () {
      var url = new URL(btn.getAttribute('data-copy-link'), window.location.href).href;
      if (canShare) {
        navigator.share({ title: document.title, url: url }).catch(function (err) {
          /* A dismissed sheet is not an error; anything else falls back to copying. */
          if (!err || err.name !== 'AbortError') copy(url, btn, 'Link copied', 'Clip link copied.');
        });
        return;
      }
      copy(url, btn, 'Link copied', 'Clip link copied.');
    });
  });
})();
