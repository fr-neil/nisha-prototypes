/* event-managers.html · page script. Owned by the For event managers builder (SPEC.md §7). The page must work without it.
 * One enhancement: "Copy text" on each bio and "Copy link" on each clip. Without JS the bios are selectable
 * text and every clip is a plain link. Buttons stay hidden where the Clipboard API is unavailable.
 */
(function () {
  'use strict';

  if (!navigator.clipboard || !window.isSecureContext) return;

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
    navigator.clipboard.writeText(text).then(function () {
      flash(btn, doneLabel);
      announce(message);
    }, function () {
      announce('Copying is blocked in this browser. Select the text instead.');
    });
  }

  Array.prototype.forEach.call(document.querySelectorAll('[data-copy]'), function (btn) {
    var source = document.querySelector(btn.getAttribute('data-copy'));
    if (!source) return;
    btn.hidden = false;
    btn.addEventListener('click', function () {
      copy(source.textContent.replace(/\s+/g, ' ').trim(), btn, 'Copied', 'Bio copied.');
    });
  });

  Array.prototype.forEach.call(document.querySelectorAll('[data-copy-link]'), function (btn) {
    btn.hidden = false;
    btn.addEventListener('click', function () {
      var url = new URL(btn.getAttribute('data-copy-link'), window.location.href).href;
      copy(url, btn, 'Link copied', 'Clip link copied.');
    });
  });
})();
