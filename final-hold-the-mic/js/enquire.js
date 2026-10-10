

(function boot(fn) { if (window.requestAnimationFrame) requestAnimationFrame(function () { setTimeout(fn, 0); }); else fn(); })(function () {
  'use strict';
  var doc = document, win = window;
  var SITE = win.SITE || {};
  var form = doc.getElementById('brief');
  var KEY = 'ns-brief';
  var FIELDS = ['event', 'date', 'flexible', 'city', 'name', 'reach'];
  var MIN_PHONE_DIGITS = 8;
  var BODY_MAX = 1500;

  function ref() { var s = typeof win.siteSource === 'function' ? win.siteSource() : ''; return s ? 'Ref: ' + s : ''; }
  function withRef(text) { var r = ref(); return r ? text + '\n\n' + r : text; }
  function waUrl(text) { return 'https://wa.me/' + SITE.whatsapp + '?text=' + encodeURIComponent(text); }
  function mailUrl(subject, body) { return 'mailto:' + SITE.email + '?subject=' + encodeURIComponent(subject) + (body ? '&body=' + encodeURIComponent(body) : ''); }

  if (SITE.whatsapp && ref()) {
    Array.prototype.forEach.call(doc.querySelectorAll('a[data-channel="whatsapp"]'), function (a) {
      a.href = waUrl(withRef('Hi Nisha, I’d like to check your availability for an event.'));
    });
    Array.prototype.forEach.call(doc.querySelectorAll('a[data-channel="email"]'), function (a) {
      a.href = mailUrl('Event enquiry', withRef('Hi Nisha,'));
    });
  }
  if (!form || !SITE.whatsapp || !SITE.email) return;

  var els = {
    date: form.elements.date, flexible: form.elements.flexible, city: form.elements.city,
    name: form.elements.name, reach: form.elements.reach,
  };
  var preview = form.querySelector('.preview');
  var msgEl = doc.getElementById('brief-msg');
  var nameHint = doc.getElementById('b-name-hint');
  var reachHint = doc.getElementById('b-reach-hint');
  var warnedReach = '';

  function eventValue() { var c = form.querySelector('input[name="event"]:checked'); return c ? c.value : ''; }
  function val(n) { return n === 'event' ? eventValue() : n === 'flexible' ? (els.flexible.checked ? 'yes' : '') : String(els[n].value || '').trim(); }

  function prettyDate(v) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
    if (!m) return v;
    try { return new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }); } catch (e) { return v; }
  }
  function compose() {
    var ev = val('event') || 'an event', date = val('date'), flex = val('flexible'), city = val('city');
    var when = date ? (flex ? ' around ' : ' on ') + prettyDate(date) : '';
    var line = 'Hi Nisha, I’m planning ' + ev + when + (city ? ' in ' + city : '') + ', and would like to check your availability.';
    if (flex) line += date ? ' The dates are flexible.' : ' The dates are still flexible.';
    var sign = val('name') ? '— ' + val('name') + (val('reach') ? ', ' + val('reach') : '') : '';
    return withRef(sign ? line + '\n\n' + sign : line).slice(0, BODY_MAX);
  }
  function subject() {
    var ev = val('event'), city = val('city');
    var kind = ev && ev !== 'an event' ? ev.replace(/^an? /, '') : 'event';
    return 'Availability: ' + kind.charAt(0).toUpperCase() + kind.slice(1) + (city ? ', ' + city : '') + (val('date') ? ', ' + prettyDate(val('date')) : '');
  }
  function touched() { return FIELDS.some(function (n) { return !!val(n); }); }
  function refresh() {
    preview.hidden = !touched();
    msgEl.textContent = compose();                  
  }

  function save() {
    var data = {};
    FIELDS.forEach(function (n) { data[n] = val(n); });
    try { sessionStorage.setItem(KEY, JSON.stringify(data)); } catch (e) {  }
  }
  (function restore() {
    var data = null;
    try { data = JSON.parse(sessionStorage.getItem(KEY) || 'null'); } catch (e) { data = null; }
    if (!data) return;
    if (data.event) { var r = form.querySelector('input[name="event"][value="' + String(data.event).replace(/"/g, '') + '"]'); if (r) r.checked = true; }
    ['date', 'city', 'name', 'reach'].forEach(function (n) { if (data[n]) els[n].value = data[n]; });
    els.flexible.checked = data.flexible === 'yes';
  })();

  function looksReachable(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) || v.replace(/\D/g, '').length >= MIN_PHONE_DIGITS; }
  function setHint(input, el, text) { el.textContent = text; input.setAttribute('aria-invalid', text ? 'true' : 'false'); }

  form.addEventListener('input', function (e) {
    if (e.target === els.name && val('name')) setHint(els.name, nameHint, '');
    if (e.target === els.reach && reachHint.textContent && (!val('reach') || looksReachable(val('reach')))) setHint(els.reach, reachHint, '');
    refresh(); save();
  });
  form.addEventListener('change', function () { refresh(); save(); });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var via = (e.submitter && e.submitter.value) || 'whatsapp';
    if (!val('name')) {
      setHint(els.name, nameHint, 'Add your name, so she knows who is asking.');
      els.name.focus();
      return;
    }
    var reach = val('reach');
    if (reach && !looksReachable(reach) && warnedReach !== reach) {
      warnedReach = reach;
      setHint(els.reach, reachHint, 'That doesn’t look like a phone number or an email. Check it, or send it as it is.');
      els.reach.focus();
      return;
    }
    save();
    var text = compose();
    if (typeof win.track === 'function') win.track('brief_send', { via: via, event: val('event') || 'unspecified' });
    if (via === 'email') {
      win.location.href = mailUrl(subject(), text);
    } else {

      var a = doc.createElement('a');
      a.href = waUrl(text); a.target = '_blank'; a.rel = 'noopener';
      a.style.display = 'none';
      doc.body.appendChild(a); a.click(); doc.body.removeChild(a);
    }
  });

  refresh();
});
