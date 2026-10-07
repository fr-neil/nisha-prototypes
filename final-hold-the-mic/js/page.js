/* Home page: the Request availability form.
   After the fields are checked, the request is shown back as a summary, then delivered:
   a form service if data-endpoint is set on the form; otherwise email if data-mailto is set;
   otherwise a message to her on Instagram, with a "Copy the details" button.
   Without JS the form is hidden and a line points to @nishashetty22. */
(function () {
  'use strict';
  var doc = document, win = window;
  var form = doc.querySelector('.req-form');
  if (!form) return;
  form.noValidate = true;

  var reduceMQ = win.matchMedia('(prefers-reduced-motion: reduce)');
  var MIN_PHONE_DIGITS = 7;
  var BODY_MAX = 1600;
  var IG_HANDLE = '@nishashetty22';

  var dateRow = form.querySelector('.if-date');
  var date = doc.getElementById('f-date'), noDate = doc.getElementById('f-nodate'), city = doc.getElementById('f-city');

  /* ---------------- validation ---------------- */
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

  /* ---------------- the summary ---------------- */
  function val(name) {
    var el = form.elements[name];
    if (!el) return '';
    if (el.length && !el.tagName) {               /* radio group */
      var c = form.querySelector('input[name="' + name + '"]:checked');
      return c ? c.value : '';
    }
    if (el.type === 'checkbox') return el.checked ? el.value : '';
    if (el.disabled) return '';
    return String(el.value || '').trim();
  }
  function prettyDate(v) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
    if (!m) return v;
    try {
      return new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
    } catch (e) { return v; }
  }
  function rows() {
    var isDate = val('about') !== 'question';
    var out = [['Request', isDate ? 'A date' : 'A general question']];
    if (isDate) {
      if (val('dates_not_fixed')) out.push(['Event date', 'Not fixed yet']);
      else if (val('date')) out.push(['Event date', prettyDate(val('date'))]);
      if (val('city')) out.push(['City', val('city')]);
    }
    out.push(['Name', val('name')]);
    out.push(['Reply to', val('reply_to')]);
    if (val('message')) out.push(['Message', val('message')]);
    return out;
  }

  var panel = doc.getElementById('received');
  var sheet = panel.querySelector('[data-rc-summary]');
  var kicker = panel.querySelector('[data-rc-kicker]');
  var title = panel.querySelector('[data-rc-title]');
  var lede = panel.querySelector('[data-rc-lede]');
  var sendBox = panel.querySelector('[data-rc-send]');
  var go = panel.querySelector('[data-rc-go]');
  var goLabel = panel.querySelector('[data-rc-btn]');
  var alt = panel.querySelector('[data-rc-alt]');
  var copyBtn = panel.querySelector('[data-rc-copy]');
  var copied = panel.querySelector('[data-rc-copied]');
  var newBtn = panel.querySelector('[data-rc-new]');

  var endpoint = (form.getAttribute('data-endpoint') || '').trim();
  var mailto = (form.getAttribute('data-mailto') || '').trim();
  if (mailto) {
    goLabel.textContent = 'Open your email app';
    go.removeAttribute('target'); go.removeAttribute('rel');
    alt.textContent = 'and paste them into an email if no email app opens.';
  }

  function render(list) {
    while (sheet.firstChild) sheet.removeChild(sheet.firstChild);
    list.forEach(function (r) {
      var row = doc.createElement('div');
      var dt = doc.createElement('dt'), dd = doc.createElement('dd');
      dt.textContent = r[0]; dd.textContent = r[1];   /* textContent only: visitor input is never parsed as HTML */
      row.appendChild(dt); row.appendChild(dd); sheet.appendChild(row);
    });
  }
  function asText(list) { return list.map(function (r) { return r[0] + ': ' + r[1]; }).join('\n'); }

  function setResult(state) {
    var sent = state === 'sent', sending = state === 'sending';
    kicker.textContent = sent ? 'Request sent' : sending ? 'Sending' : 'Almost done';
    title.textContent = sent ? 'Thank you. Your request is on its way.'
      : sending ? 'Sending your request.'
      : mailto ? 'Send it from your email app.' : 'Send it to Nisha as a message.';
    lede.textContent = sent ? 'The reply comes to the email or phone you gave.'
      : sending ? 'One moment.'
      : mailto ? 'It opens with everything below filled in. Check it, then press send.'
      : 'Copy the details below, then send them to ' + IG_HANDLE + ' on Instagram.';
    sendBox.hidden = sent || sending;
  }

  function deliver(list) {
    if (mailto) {
      var body = asText(list);
      if (body.length > BODY_MAX) body = body.slice(0, BODY_MAX) + '…';
      var subject = 'Availability request' + (val('city') ? ': ' + val('city') : '');
      go.setAttribute('href', 'mailto:' + mailto + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body));
    }
    if (!endpoint || !win.fetch || !win.FormData) { setResult('send'); return; }
    setResult('sending');
    win.fetch(endpoint, { method: 'POST', body: new FormData(form), headers: { Accept: 'application/json' } })
      .then(function (r) { if (!r.ok) throw new Error('status ' + r.status); setResult('sent'); })
      .catch(function () { setResult('send'); });
  }

  function showPanel() {
    form.hidden = true;
    panel.hidden = false;
    copied.textContent = '';
    panel.scrollIntoView({ behavior: reduceMQ.matches ? 'auto' : 'smooth', block: 'start' });
    title.focus({ preventScroll: true });
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var first = null;
    REQUIRED.forEach(function (f) {
      var input = doc.getElementById(f.id), text = problem(f, input.value.trim());
      show(f, text);
      if (text && !first) first = input;
    });
    if (first) {
      /* bring the whole field (label, box, message) clear of the sticky header, then focus it */
      var box = first.closest('.field') || first;
      box.scrollIntoView({ behavior: reduceMQ.matches ? 'auto' : 'smooth', block: 'center' });
      first.focus({ preventScroll: true });
      return;
    }
    var list = rows();
    render(list);
    deliver(list);
    showPanel();
  });

  copyBtn.addEventListener('click', function () {
    var text = asText(rows());
    var done = function (ok) { copied.textContent = ok ? 'Copied.' : 'Select the details above to copy them.'; };
    if (navigator.clipboard && navigator.clipboard.writeText && win.isSecureContext) {
      navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(false); });
    } else { done(false); }
  });

  newBtn.addEventListener('click', function () {
    form.reset();
    REQUIRED.forEach(function (f) { show(f, ''); });
    syncAbout();
    panel.hidden = true;
    form.hidden = false;
    var first = form.querySelector('input[name="about"]:checked');
    form.scrollIntoView({ behavior: reduceMQ.matches ? 'auto' : 'smooth', block: 'start' });
    if (first) first.focus({ preventScroll: true });
  });
})();
