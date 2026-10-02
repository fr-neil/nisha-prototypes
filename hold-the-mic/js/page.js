/* Prototype 5: the request form (prototype only — nothing is sent).
   GET to #received works without JS (:target shows the panel); with JS we validate and show the
   same panel without putting personal data in the URL. Production must POST (out of scope). */
(function () {
  'use strict';
  var doc = document;
  var form = doc.querySelector('.req-form');
  if (!form) return;
  form.noValidate = true;                 /* without JS the browser's own `required` check runs; with JS ours does */

  var dateRow = form.querySelector('.if-date');
  var date = doc.getElementById('f-date'), noDate = doc.getElementById('f-nodate'), city = doc.getElementById('f-city');
  var MIN_PHONE_DIGITS = 7;
  function looksReachable(v) { return /@.+\./.test(v) || v.replace(/\D/g, '').length >= MIN_PHONE_DIGITS; }
  var REQUIRED = [
    { id: 'f-name', err: 'e-name', msg: 'Please add your name.' },
    { id: 'f-reply', err: 'e-reply', msg: 'Please add an email or phone number for the reply.',
      check: looksReachable, bad: 'Please add an email address or a phone number.' }
  ];
  function problem(f, value) {
    if (!value) return f.msg;
    if (f.check && !f.check(value)) return f.bad;
    return '';
  }
  function show(f, text) {
    doc.getElementById(f.id).setAttribute('aria-invalid', text ? 'true' : 'false');
    doc.getElementById(f.err).textContent = text;
  }
  /* an error clears as soon as the field is filled again */
  REQUIRED.forEach(function (f) {
    doc.getElementById(f.id).addEventListener('input', function (e) {
      if (doc.getElementById(f.err).textContent && e.target.value.trim()) show(f, '');
    });
  });

  function syncAbout() {
    var about = form.querySelector('input[name="about"]:checked');
    var isDate = !about || about.value === 'date';
    dateRow.hidden = !isDate;
    city.disabled = !isDate;
    date.disabled = !isDate || noDate.checked;
    noDate.disabled = !isDate;
  }
  Array.prototype.forEach.call(form.querySelectorAll('input[name="about"]'), function (r) { r.addEventListener('change', syncAbout); });
  noDate.addEventListener('change', function () { date.disabled = noDate.checked; if (noDate.checked) date.value = ''; });
  syncAbout();

  function focusReceived() {
    var h = doc.querySelector('#received .rc-h');
    if (h) h.focus({ preventScroll: false });
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var first = null;
    REQUIRED.forEach(function (f) {
      var input = doc.getElementById(f.id), text = problem(f, input.value.trim());
      show(f, text);
      if (text && !first) first = input;
    });
    if (first) { first.focus(); return; }
    if (location.hash !== '#received') location.hash = 'received';
    focusReceived();
  });

  /* leaving #received ("Send another request") brings back an empty form */
  function resetForm() {
    form.reset();
    REQUIRED.forEach(function (f) { show(f, ''); });
    syncAbout();
  }
  if (location.hash === '#received') setTimeout(focusReceived, 0);
  window.addEventListener('hashchange', function (e) {
    if (location.hash === '#received') focusReceived();
    else if (/#received$/.test(e.oldURL || '')) resetForm();
  });
})();

/* the one non-device motion on the page: a 240 ms opacity fade as each photograph decodes */
(function () {
  'use strict';
  Array.prototype.forEach.call(document.querySelectorAll('.off-photo img, .again-photo img, .plate img, .with-photo img'), function (img) {
    if (img.complete && img.naturalWidth) return;
    img.classList.add('decoding');
    function done() { img.classList.remove('decoding'); }
    img.addEventListener('load', done); img.addEventListener('error', done);
  });
})();
