/* js/pages/request.js: the six-step "Request availability" form (builder-owned, spec B.11).
   Without JS the form is one long page that submits (GET) to #received, shown by CSS :target.
   With JS: one step at a time, "Step n of 6" + progress bar, Back / Next, inline errors + an error summary,
   aria-invalid, focus on the first error; on submit nothing navigates or is sent: #received is shown,
   the URL becomes request.html#received (replaceState) and its heading takes focus. ?type= pre-selects the event type. */
(function () {
  'use strict'
  var doc = document
  var form = doc.querySelector('[data-request]')
  if (!form) return
  var $ = function (sel, ctx) { return (ctx || doc).querySelector(sel) }
  var $$ = function (sel, ctx) { return Array.prototype.slice.call((ctx || doc).querySelectorAll(sel)) }

  var steps = $$('.step', form)
  var back = $('[data-back]', form)
  var next = $('[data-next]', form)
  var send = $('[data-send]', form)
  var progress = $('[data-progress]', form)
  var progressLabel = $('[data-progress-label]', form)
  var progressFill = $('[data-progress-fill]', form)
  var summary = $('[data-err-sum]', form)
  var summaryList = $('[data-err-list]', form)
  var main = $('.r-main')
  var received = $('[data-received]')
  var dateInput = $('#date', form)
  var dateTbc = $('#date-tbc', form)
  var current = 0

  /* ---------- rules: one message per required answer ---------- */
  var EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  var RULES = {
    type: { focus: function () { return $('input[name="type"]', form) }, check: function () { return $('input[name="type"]:checked', form) ? '' : 'Choose the kind of event.' } },
    date: { focus: function () { return dateInput }, check: function () { return dateTbc.checked || dateInput.value ? '' : 'Add the date, or tick “Date not fixed yet”.' } },
    city: { focus: function () { return $('#city', form) }, check: function () { return $('#city', form).value.trim() ? '' : 'Add the city (or the country, if the city is not fixed yet).' } },
    name: { focus: function () { return $('#name', form) }, check: function () { return $('#name', form).value.trim() ? '' : 'Add your name.' } },
    email: {
      focus: function () { return $('#email', form) },
      check: function () {
        var v = $('#email', form).value.trim()
        if (!v) return 'Add your email address.'
        return EMAIL.test(v) ? '' : 'Check the email address: it needs an @ and a domain, like name@company.com.'
      },
    },
  }

  function setError (key, message) {
    var wrap = $('[data-field="' + key + '"]', form)
    var out = $('#' + key + '-err', form)
    var target = key === 'type' ? wrap : RULES[key].focus()
    if (out) { out.textContent = message; out.hidden = !message }
    if (target) { if (message) target.setAttribute('aria-invalid', 'true'); else target.removeAttribute('aria-invalid') }
    if (wrap) wrap.classList.toggle('has-error', !!message)
  }

  function validate (stepEl) {
    var errors = []
    $$('[data-field]', stepEl).forEach(function (wrap) {
      var key = wrap.getAttribute('data-field')
      var message = RULES[key] ? RULES[key].check() : ''
      setError(key, message)
      if (message) errors.push({ key: key, message: message })
    })
    return errors
  }

  function showSummary (errors) {
    summaryList.textContent = ''
    errors.forEach(function (err) {
      var li = doc.createElement('li')
      var a = doc.createElement('a')
      var field = RULES[err.key].focus()
      a.href = '#' + (field && field.id ? field.id : err.key + '-err')
      a.textContent = err.message
      a.addEventListener('click', function (e) { e.preventDefault(); var f = RULES[err.key].focus(); if (f) f.focus() })
      li.appendChild(a)
      summaryList.appendChild(li)
    })
    summary.hidden = false
  }
  function hideSummary () { summary.hidden = true; summaryList.textContent = '' }

  function focusFirstError (errors) {
    var field = errors.length && RULES[errors[0].key].focus()
    if (field) field.focus()
  }

  /* ---------- steps ---------- */
  function render () {
    steps.forEach(function (s, i) { s.classList.toggle('is-current', i === current) })
    var title = $('.step__title', steps[current])
    progressLabel.textContent = 'Step ' + (current + 1) + ' of ' + steps.length + ' · ' + (title ? title.textContent : '')
    progressFill.style.transform = 'scaleX(' + ((current + 1) / steps.length) + ')'
    back.hidden = current === 0
    next.hidden = current === steps.length - 1
    send.hidden = current !== steps.length - 1
  }
  function go (i) {
    current = Math.max(0, Math.min(steps.length - 1, i))
    hideSummary()
    render()
    var title = $('.step__title', steps[current])
    form.scrollIntoView({ block: 'start' })
    if (title) title.focus({ preventScroll: true })
  }
  function tryNext () {
    var errors = validate(steps[current])
    if (errors.length) { showSummary(errors); focusFirstError(errors); return false }
    go(current + 1)
    return true
  }

  /* ---------- received ---------- */
  function showReceived (replace) {
    if (main) main.classList.add('is-done')
    received.classList.add('is-shown')
    if (replace && window.history && history.replaceState) history.replaceState(null, '', window.location.pathname + '#received')
    var h = $('#received-title')
    received.scrollIntoView({ block: 'start' })
    if (h) h.focus({ preventScroll: true })
  }

  /* ---------- wire up ---------- */
  form.noValidate = true
  form.classList.add('is-stepped')
  progress.hidden = false
  next.hidden = false

  var type = new URLSearchParams(window.location.search).get('type')
  if (type) {
    $$('input[name="type"]', form).forEach(function (r) { if (r.value === type) r.checked = true })
  }

  dateTbc.addEventListener('change', function () {
    dateInput.disabled = dateTbc.checked
    if (dateTbc.checked) { dateInput.value = ''; setError('date', '') }
  })

  // Clear an error as soon as the answer is fixed.
  form.addEventListener('input', function (e) { recheck(e.target) })
  form.addEventListener('change', function (e) { recheck(e.target) })
  function recheck (el) {
    var wrap = el && el.closest && el.closest('[data-field]')
    if (!wrap || !wrap.classList.contains('has-error')) return
    var key = wrap.getAttribute('data-field')
    if (!RULES[key].check()) setError(key, '')
  }

  next.addEventListener('click', tryNext)
  back.addEventListener('click', function () { go(current - 1) })

  form.addEventListener('submit', function (e) {
    e.preventDefault()
    if (current < steps.length - 1) { tryNext(); return } // Enter in a field moves on, it does not send
    for (var i = 0; i < steps.length; i++) {
      var errors = validate(steps[i])
      if (errors.length) {
        if (i !== current) { current = i; render() }
        showSummary(errors)
        focusFirstError(errors)
        return
      }
    }
    hideSummary()
    showReceived(true)
  })

  render()
  if (window.location.hash === '#received') showReceived(false)
})()
