/* Request availability · page script. The page works without it (both forms then open an email
 * addressed to the booking inbox).
 * Enhancements:
 *  - two steps (the form carries data-step), a short fade between them
 *  - ?as=agency presets "I'm enquiring as"; step 2 labels adapt for agencies
 *  - validation: an error summary with links plus a message under each field
 *  - on submit: a readable summary of the request, then delivery. If the form carries a data-endpoint,
 *    the request is POSTed there; otherwise (or if that fails) a prefilled email is offered.
 *  - #enquiry ("Make an enquiry") is its own short form: question, name and reply-to are required.
 */
(function () {
  'use strict';

  var form = document.querySelector('[data-enq-form]');
  if (!form) return;

  var main = form.parentElement;
  var received = document.querySelector('[data-enq-received]');
  var summary = document.querySelector('[data-enq-summary]');
  var errorsBox = form.querySelector('[data-enq-errors]');
  var errorsTitle = form.querySelector('[data-enq-errors-title]');
  var errorsList = form.querySelector('[data-enq-errors-list]');
  var progress = form.querySelector('[data-enq-progress]');
  var step1Actions = form.querySelector('[data-enq-step1-actions]');
  var backBtn = form.querySelector('[data-enq-back]');
  var editBtn = document.querySelector('[data-enq-edit]');
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)');

  var LABELS = {
    as: 'Enquiring as', format: 'Format', date: 'Date or month', flexible: 'Dates flexible', city: 'City and country',
    name: 'Name', contact: 'Reply to', setting: 'In person or virtual', language: 'Hosting language',
    audience: 'Audience size', room: 'Who is in the room', org: 'Organisation', agency: 'Agency', notes: 'Anything else',
    kind: 'Request', message: 'Question'
  };
  var AS_TEXT = { agency: 'An event agency', host: 'The company hosting the event', other: 'Other' };
  var ORDER = ['as', 'format', 'date', 'flexible', 'city', 'name', 'contact', 'setting', 'language', 'audience', 'room', 'org', 'agency', 'notes'];
  var ORDER_ASK = ['kind', 'as', 'message', 'name', 'contact', 'date', 'city'];
  var KIND_TEXT = { enquiry: 'An enquiry (no date yet)' };
  var ask = document.querySelector('[data-enq-ask]');
  var lastSource = 'availability';

  var RULES = [
    { name: 'as', target: 'f-as', check: function (v) { return v ? '' : 'Choose who is enquiring.'; } },
    { name: 'format', target: 'f-format', check: function (v) { return v ? '' : 'Choose a format, or Other.'; } },
    { name: 'date', target: 'f-date', check: function (v) { return v ? '' : 'Add a date or a month. If it can move, tick Dates are flexible.'; } },
    { name: 'city', target: 'f-city', check: function (v) { return v ? '' : 'Add the city, and the country if it is outside India.'; } },
    { name: 'name', target: 'f-name', check: function (v) { return v ? '' : 'Add your name.'; } },
    { name: 'contact', target: 'f-contact', check: checkContact }
  ];

  function checkContact(v) {
    if (!v) return 'Add a phone or WhatsApp number, or an email address, for the reply.';
    var isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
    var digits = v.replace(/[^\d]/g, '');
    var isPhone = /^[+\d\s().-]+$/.test(v) && digits.length >= 8 && digits.length <= 15;
    return isEmail || isPhone ? '' : 'This does not look like a phone number or an email address.';
  }

  function value(name) {
    var el = form.elements[name];
    if (!el) return '';
    if (el.type === 'checkbox') return el.checked ? el.value : '';
    return String(el.value || '').trim();
  }

  function each(list, fn) { Array.prototype.forEach.call(list, fn); }

  function fade(el) {
    if (reduce.matches) return;
    el.classList.remove('is-entering');
    void el.offsetWidth; /* restart the animation */
    el.classList.add('is-entering');
  }

  /* ------------------------------------------------------------ steps */
  function setStep(n, focusHeading) {
    form.setAttribute('data-step', String(n));
    if (step1Actions) step1Actions.hidden = n !== 1;
    if (backBtn) backBtn.hidden = n !== 2;
    if (progress) {
      var segs = progress.querySelectorAll('.enq-progress__seg');
      if (segs[1]) segs[1].classList.toggle('is-on', n === 2);
    }
    var step = form.querySelector('[data-enq-step="' + n + '"]');
    if (step) {
      fade(step);
      if (focusHeading) {
        var h = step.querySelector('.enq-step__title');
        if (h) h.focus({ preventScroll: true });
        scrollToForm();
      }
    }
  }

  function scrollToForm() {
    var top = form.getBoundingClientRect().top;
    if (top < 0 || top > window.innerHeight * 0.4) {
      form.scrollIntoView({ behavior: reduce.matches ? 'auto' : 'smooth', block: 'start' });
    }
  }

  /* ------------------------------------------------------------ validation */
  function showFieldError(rule, msg) {
    var errEl = form.querySelector('[data-err-for="' + rule.name + '"]');
    var target = document.getElementById(rule.target);
    if (errEl) { errEl.textContent = msg; errEl.hidden = !msg; }
    if (!target) return;
    if (target.tagName === 'FIELDSET') {
      if (msg) target.setAttribute('data-invalid', ''); else target.removeAttribute('data-invalid');
    } else {
      target.setAttribute('aria-invalid', msg ? 'true' : 'false');
    }
  }

  function validateStep1() {
    var failed = [];
    RULES.forEach(function (rule) {
      var msg = rule.check(value(rule.name));
      showFieldError(rule, msg);
      if (msg) failed.push({ rule: rule, msg: msg });
    });
    renderSummary(failed);
    return failed;
  }

  function renderSummary(failed) {
    if (!errorsBox) return;
    while (errorsList.firstChild) errorsList.removeChild(errorsList.firstChild);
    if (!failed.length) { errorsBox.hidden = true; return; }
    errorsTitle.textContent = failed.length === 1 ? 'One thing to check' : 'A few things to check';
    failed.forEach(function (f) {
      var li = document.createElement('li');
      var a = document.createElement('a');
      a.href = '#' + f.rule.target;
      a.textContent = f.msg;
      a.addEventListener('click', function (e) {
        e.preventDefault();
        var t = document.getElementById(f.rule.target);
        var focusable = t && t.tagName === 'FIELDSET' ? (t.querySelector('input:checked') || t.querySelector('input')) : t;
        if (focusable) { focusable.focus({ preventScroll: true }); t.scrollIntoView({ block: 'center' }); }
      });
      li.appendChild(a);
      errorsList.appendChild(li);
    });
    errorsBox.hidden = false;
  }

  /* Clear a field's message as soon as it is fixed (errors show only after a first attempt). */
  var attempted = false;
  function revalidate(e) {
    if (!attempted || !e.target.name) return;
    RULES.forEach(function (rule) {
      if (rule.name === e.target.name) showFieldError(rule, rule.check(value(rule.name)));
    });
    var remaining = RULES.filter(function (r) { return r.check(value(r.name)); });
    if (!remaining.length && errorsBox) errorsBox.hidden = true;
  }
  form.addEventListener('change', revalidate);
  form.addEventListener('input', revalidate);

  function passStep1() {
    attempted = true;
    var failed = validateStep1();
    if (failed.length) {
      if (form.getAttribute('data-step') === '2') setStep(1, false);
      errorsBox.focus({ preventScroll: true });
      errorsBox.scrollIntoView({ behavior: reduce.matches ? 'auto' : 'smooth', block: 'center' });
      return false;
    }
    return true;
  }

  /* ------------------------------------------------------------ agency wording */
  var orgLabel = form.querySelector('[data-enq-org-label]');
  var agencyLabel = form.querySelector('[data-enq-agency-label]');
  var orgDefault = orgLabel ? orgLabel.textContent : '';
  var agencyDefault = agencyLabel ? agencyLabel.textContent : '';
  function syncAsWording() {
    var isAgency = value('as') === 'agency';
    if (orgLabel) orgLabel.textContent = isAgency ? 'End client, if you can share it' : orgDefault;
    if (agencyLabel) agencyLabel.textContent = isAgency ? 'Your agency' : agencyDefault;
  }
  form.addEventListener('change', function (e) { if (e.target.name === 'as') syncAsWording(); });

  /* ------------------------------------------------------------ summary ("what would be sent") */
  function readable(name, raw) {
    if (name === 'as') return AS_TEXT[raw] || raw;
    if (name === 'flexible') return raw ? 'Yes' : '';
    if (name === 'kind') return KIND_TEXT[raw] || '';
    return raw;
  }

  function labelFor(name, isAgency) { return isAgency && name === 'org' ? 'End client' : LABELS[name]; }

  /* ------------------------------------------------------------ delivery */
  var kickerEl = document.querySelector('[data-enq-kicker]');
  var titleEl = document.querySelector('[data-enq-title]');
  var ledeEl = document.querySelector('[data-enq-lede]');
  var sendBox = document.querySelector('[data-enq-send]');
  var mailBtn = document.querySelector('[data-enq-mailto]');
  var BODY_MAX = 1600;

  function mailtoHref(f, subject, get, order) {
    var isAgency = get('as') === 'agency';
    var lines = [];
    order.forEach(function (name) {
      if (name === 'kind') return;
      var v = readable(name, get(name));
      if (v) lines.push(labelFor(name, isAgency) + ': ' + v);
    });
    var body = lines.join('\n');
    if (body.length > BODY_MAX) body = body.slice(0, BODY_MAX) + '…';
    var to = f.getAttribute('data-mailto') || '';
    return 'mailto:' + to + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
  }

  /* Without a form service the request goes through the visitor's email app, and every label says so.
     Once data-endpoint is set on the forms, the labels switch to their "send" wording (data-send-label). */
  if ((form.getAttribute('data-endpoint') || '').trim()) {
    Array.prototype.forEach.call(document.querySelectorAll('[data-send-label]'), function (n) {
      n.textContent = n.getAttribute('data-send-label');
    });
  }

  /* Delivery route: a form service (data-endpoint) if set; else email (data-mailto) if set;
     else Instagram messages, with a copy-the-details button. Set data-mailto on both forms to switch email on. */
  var hasMail = !!(form.getAttribute('data-mailto') || '').trim();
  var btnLabel = document.querySelector('[data-enq-btn-label]');
  var altEl = document.querySelector('[data-enq-alt]');
  if (hasMail && btnLabel) {
    btnLabel.textContent = 'Open your email app';
    if (mailBtn) { mailBtn.removeAttribute('target'); mailBtn.removeAttribute('rel'); }
    if (altEl) altEl.textContent = 'and paste them into an email if no email app opens.';
  }

  function setResult(state, href) {
    var sent = state === 'sent';
    var sending = state === 'sending';
    if (kickerEl) kickerEl.textContent = sent ? 'Request sent' : sending ? 'Sending' : 'Almost done';
    if (titleEl) {
      titleEl.textContent = sent ? 'Thank you. Your request is on its way.'
        : sending ? 'Sending your request.'
        : hasMail ? 'Send it from your email app.' : 'Send it to Nisha as a message.';
    }
    if (ledeEl) {
      ledeEl.textContent = sent
        ? 'The reply comes to the phone, WhatsApp or email you gave.'
        : sending ? 'One moment.'
        : hasMail ? 'It opens with everything below filled in. Check it, then press send.'
        : 'Copy the details below, then send them to @nishashetty22 on Instagram.';
    }
    if (sendBox) sendBox.hidden = state !== 'mail';
    if (mailBtn && href && hasMail) mailBtn.setAttribute('href', href);
  }

  var copyBtn = document.querySelector('[data-enq-copy]');
  var copiedEl = document.querySelector('[data-enq-copied]');
  if (copyBtn) {
    copyBtn.addEventListener('click', function () {
      var lines = [];
      Array.prototype.forEach.call(summary.querySelectorAll('.enq-sheet__row'), function (row) {
        var dt = row.querySelector('dt');
        var dd = row.querySelector('dd');
        if (dt && dd) lines.push(dt.textContent + ': ' + dd.textContent);
      });
      var text = lines.join('\n');
      var done = function (ok) { if (copiedEl) copiedEl.textContent = ok ? 'Copied.' : 'Select the details above to copy them.'; };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(false); });
      } else { done(false); }
    });
  }

  function deliver(f, subject, get, order) {
    var href = mailtoHref(f, subject, get, order);
    var endpoint = (f.getAttribute('data-endpoint') || '').trim();
    if (!endpoint || !window.fetch || !window.FormData) { setResult('mail', href); return; }
    setResult('sending', href);
    window.fetch(endpoint, { method: 'POST', body: new FormData(f), headers: { Accept: 'application/json' } })
      .then(function (r) { if (!r.ok) throw new Error('status ' + r.status); setResult('sent'); })
      .catch(function () { setResult('mail', href); });
  }

  function renderEcho(get, order) {
    while (summary.firstChild) summary.removeChild(summary.firstChild);
    var rows = 0;
    var isAgency = get('as') === 'agency';
    (order || ORDER).forEach(function (name) {
      var v = readable(name, get(name));
      if (!v) return;
      var row = document.createElement('div');
      row.className = 'enq-sheet__row';
      var dt = document.createElement('dt');
      var dd = document.createElement('dd');
      dt.textContent = labelFor(name, isAgency);
      dd.textContent = v; /* textContent only: visitor input is never parsed as HTML */
      row.appendChild(dt);
      row.appendChild(dd);
      summary.appendChild(row);
      rows++;
    });
    return rows;
  }

  function showReceived() {
    main.classList.add('is-sent');
    received.classList.add('is-shown');
    if (editBtn) editBtn.hidden = false;
    fade(received);
    var h = received.querySelector('h2');
    if (h) h.focus({ preventScroll: true });
    received.scrollIntoView({ behavior: reduce.matches ? 'auto' : 'smooth', block: 'start' });
  }

  function hideReceived() {
    main.classList.remove('is-sent');
    received.classList.remove('is-shown');
    if (location.hash === '#received' && window.history && history.replaceState) {
      history.replaceState(null, '', location.pathname + '#availability');
    }
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!passStep1()) return;
    lastSource = 'availability';
    if (editBtn) editBtn.textContent = 'Edit the request';
    renderEcho(value);
    deliver(form, 'Availability: ' + [value('format'), value('date'), value('city')].filter(Boolean).join(', '), value, ORDER);
    showReceived();
  });

  if (editBtn) {
    editBtn.addEventListener('click', function () {
      hideReceived();
      if (lastSource === 'enquiry' && ask) {
        var h = document.getElementById('enquiry-title');
        ask.scrollIntoView({ behavior: reduce.matches ? 'auto' : 'smooth', block: 'start' });
        if (h) h.focus({ preventScroll: true });
        return;
      }
      setStep(1, true);
    });
  }

  var newLink = document.querySelector('[data-enq-new]');
  if (newLink) {
    newLink.addEventListener('click', function (e) {
      e.preventDefault();
      form.reset();
      if (ask) ask.reset();
      hideReceived();
      setStep(1, true);
    });
  }

  /* ------------------------------------------------------------ Make an enquiry (short form) */
  if (ask) {
    var askErrors = ask.querySelector('[data-enq-errors]');
    var askErrorsTitle = ask.querySelector('[data-enq-errors-title]');
    var askErrorsList = ask.querySelector('[data-enq-errors-list]');
    var ASK_RULES = [
      { name: 'message', target: 'q-message', check: function (v) { return v ? '' : 'Write your question.'; } },
      { name: 'name', target: 'q-name', check: function (v) { return v ? '' : 'Add your name.'; } },
      { name: 'contact', target: 'q-contact', check: checkContact }
    ];
    var askValue = function (name) {
      var el = ask.elements[name];
      if (!el) return '';
      return String(el.value || '').trim();
    };
    var askAttempted = false;
    var askCheck = function (showAll) {
      var failed = [];
      ASK_RULES.forEach(function (rule) {
        var msg = rule.check(askValue(rule.name));
        var errEl = ask.querySelector('[data-err-for="' + rule.name + '"]');
        var target = document.getElementById(rule.target);
        if (showAll || !msg) {
          if (errEl) { errEl.textContent = msg; errEl.hidden = !msg; }
          if (target) target.setAttribute('aria-invalid', msg ? 'true' : 'false');
        }
        if (msg) failed.push({ rule: rule, msg: msg });
      });
      return failed;
    };
    var askSummary = function (failed) {
      while (askErrorsList.firstChild) askErrorsList.removeChild(askErrorsList.firstChild);
      if (!failed.length) { askErrors.hidden = true; return; }
      askErrorsTitle.textContent = failed.length === 1 ? 'One thing to check' : 'A few things to check';
      failed.forEach(function (f) {
        var li = document.createElement('li');
        var a = document.createElement('a');
        a.href = '#' + f.rule.target;
        a.textContent = f.msg;
        a.addEventListener('click', function (e) {
          e.preventDefault();
          var t = document.getElementById(f.rule.target);
          if (t) { t.focus({ preventScroll: true }); t.scrollIntoView({ block: 'center' }); }
        });
        li.appendChild(a);
        askErrorsList.appendChild(li);
      });
      askErrors.hidden = false;
    };
    var askRevalidate = function () {
      if (!askAttempted) return;
      if (!askCheck(false).length) askErrors.hidden = true;
    };
    ask.setAttribute('novalidate', '');
    ask.addEventListener('input', askRevalidate);
    ask.addEventListener('change', askRevalidate);
    ask.addEventListener('submit', function (e) {
      e.preventDefault();
      askAttempted = true;
      var failed = askCheck(true);
      askSummary(failed);
      if (failed.length) {
        askErrors.focus({ preventScroll: true });
        askErrors.scrollIntoView({ behavior: reduce.matches ? 'auto' : 'smooth', block: 'center' });
        return;
      }
      lastSource = 'enquiry';
      renderEcho(askValue, ORDER_ASK);
      deliver(ask, 'Enquiry from ' + askValue('name'), askValue, ORDER_ASK);
      if (editBtn) editBtn.textContent = 'Edit the enquiry';
      showReceived();
    });
  }

  /* ------------------------------------------------------------ init */
  form.setAttribute('novalidate', '');
  if (progress) progress.hidden = false;
  setStep(1, false);

  var nextBtn = form.querySelector('[data-enq-next]');
  if (nextBtn) nextBtn.addEventListener('click', function () { if (passStep1()) setStep(2, true); });
  if (backBtn) backBtn.addEventListener('click', function () { setStep(1, true); });

  var params;
  try { params = new URLSearchParams(location.search); } catch (err) { params = null; }
  if (params) {
    var as = params.get('as');
    if (as && AS_TEXT[as]) {
      [form, ask].forEach(function (f) {
        var radio = f && f.querySelector('input[name="as"][value="' + as + '"]');
        if (radio) radio.checked = true;
      });
    }
    syncAsWording();
  }
})();
