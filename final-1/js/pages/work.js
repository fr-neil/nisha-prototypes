/* work.html · page script. The page must work without it.
 * Enhancement only: the record's filters (family, place, asked back, format, sector, year).
 * - The readout names the active filters; it never shows a total or a row count (Phase 24: no counts).
 * - With no filter on, the two latest years show first and "Show earlier years" opens the rest
 *   (without JS every year is listed).
 * - On phones and tablets the filter panel starts folded behind one button, so the rows come first.
 * - State lives in the URL (?family=&format=&sector=&region=&again=1&year=), so a filtered view can be forwarded.
 *   Also accepts ?abroad=1 (Home's "All programmes abroad" link).
 * - Rows are static HTML; this script only shows and hides them. Shown rows settle in ≤240ms.
 * - On phones a slim bar under the header keeps the result line and a way back to the filters.
 */
(function () {
  'use strict';

  var doc = document;
  var form = doc.querySelector('[data-work-filters]');
  if (!form || !('URLSearchParams' in window)) return;

  var record = doc.getElementById('record');
  var rows = Array.prototype.slice.call(doc.querySelectorAll('.work-row'));
  var years = Array.prototype.slice.call(doc.querySelectorAll('[data-work-year]'));
  var chips = Array.prototype.slice.call(form.querySelectorAll('.chip[data-f]'));
  var selects = Array.prototype.slice.call(form.querySelectorAll('select[data-f]'));
  var status = doc.querySelector('[data-work-status]');
  var resets = Array.prototype.slice.call(doc.querySelectorAll('[data-work-reset]'));
  var empty = doc.querySelector('[data-work-empty]');
  var bar = doc.querySelector('[data-work-bar]');
  var barBtn = doc.querySelector('[data-work-bar-btn]');
  var barN = doc.querySelector('[data-work-bar-n]');
  var barText = doc.querySelector('[data-work-bar-text]');
  var heading = doc.getElementById('record-h');
  var earlier = doc.querySelector('[data-work-earlier]');
  var earlierBtn = doc.querySelector('[data-work-earlier-btn]');
  var OPEN_YEARS = ['2026', '2025'];
  var expanded = false;
  var mqPhone = window.matchMedia('(max-width: 1023px)');
  var foldToggle = null;
  var KEYS = ['family', 'format', 'sector', 'region', 'again', 'year'];
  var FAMILIES = ['corporate', 'entertainment', 'cultural', 'virtual'];
  var SETTLE_MAX = 24;
  var state = blank();

  function blank() { return { family: '', format: '', sector: '', region: '', again: '', year: '' }; }
  function each(list, fn) { Array.prototype.forEach.call(list, fn); }
  function slug(v) { return String(v || '').toLowerCase().replace(/&/g, ' ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }

  /* A select value is valid if it names an option; loose prefixes ("awards") resolve to the first match. */
  function optionValue(key, raw) {
    var v = slug(raw);
    if (!v) return '';
    var sel = form.querySelector('select[data-f="' + key + '"]');
    if (!sel) return '';
    var hit = '';
    each(sel.options, function (o) {
      if (!hit && o.value && (o.value === v || o.value.indexOf(v) === 0)) hit = o.value;
    });
    return hit;
  }

  function fromQuery(search) {
    var p = new URLSearchParams(search);
    var s = blank();
    var fam = slug(p.get('family')).split('-')[0];
    s.family = FAMILIES.indexOf(fam) > -1 ? fam : '';
    s.format = optionValue('format', p.get('format'));
    s.sector = optionValue('sector', p.get('sector'));
    s.year = optionValue('year', p.get('year'));
    var region = slug(p.get('region'));
    s.region = region === 'india' || region === 'abroad' ? region : (p.get('abroad') === '1' ? 'abroad' : '');
    s.again = p.get('again') === '1' ? '1' : '';
    return s;
  }

  function toQuery(s) {
    var p = new URLSearchParams();
    KEYS.forEach(function (k) { if (s[k]) p.set(k, s[k]); });
    return p.toString();
  }

  function activeCount(s) {
    return KEYS.reduce(function (n, k) { return n + (s[k] ? 1 : 0); }, 0);
  }

  function matches(row, s) {
    var d = row.dataset;
    return (!s.family || d.family === s.family) &&
      (!s.format || d.format === s.format) &&
      (!s.sector || d.sector === s.sector) &&
      (!s.region || d.region === s.region) &&
      (!s.again || d.again === '1') &&
      (!s.year || d.year === s.year);
  }

  function syncControls() {
    chips.forEach(function (c) {
      var f = c.getAttribute('data-f');
      var v = c.getAttribute('data-v');
      c.setAttribute('aria-pressed', String(state[f] === v));
    });
    selects.forEach(function (sel) { sel.value = state[sel.getAttribute('data-f')]; });
  }

  /* The words on the active controls, e.g. "Corporate · Abroad · Asked back". */
  function activeLabels(s) {
    var out = [];
    chips.forEach(function (c) {
      var f = c.getAttribute('data-f');
      var v = c.getAttribute('data-v');
      if (v && s[f] === v) out.push(c.textContent.trim());
    });
    selects.forEach(function (sel) {
      var v = s[sel.getAttribute('data-f')];
      if (!v) return;
      var opt = sel.querySelector('option[value="' + v + '"]');
      if (opt) out.push(opt.textContent.trim());
    });
    return out;
  }

  function statusText(shown, n) {
    if (!n) return 'All engagements, newest first.';
    if (!shown) return ''; /* the empty-state block below the rows says it once */
    return 'Filtered: ' + activeLabels(state).join(' · ') + '. Newest first.';
  }

  function apply(settle, updateURL) {
    var shown = 0;
    var settled = 0;
    rows.forEach(function (row) {
      var ok = matches(row, state);
      var wasHidden = row.hidden;
      row.hidden = !ok;
      if (ok) {
        shown++;
        if (settle && wasHidden && settled < SETTLE_MAX) {
          settled++;
          row.classList.remove('is-settling');
          void row.offsetWidth;
          row.classList.add('is-settling');
        }
      }
    });
    var n = activeCount(state);
    var folding = !n && !expanded;
    years.forEach(function (y) {
      var folded = folding && OPEN_YEARS.indexOf(y.getAttribute('data-work-year')) < 0;
      y.hidden = folded || !y.querySelector('.work-row:not([hidden])');
    });
    if (earlier) earlier.hidden = !folding;
    var text = statusText(shown, n);
    if (status && status.textContent !== text) status.textContent = text;
    if (barText) barText.textContent = n ? activeLabels(state).join(' · ') : 'All engagements';
    if (barN) barN.textContent = n ? ' on (' + n + ')' : '';
    if (empty) empty.hidden = shown > 0;
    resets.forEach(function (b) { if (!b.closest('[data-work-empty]')) b.hidden = !n || shown === 0; });
    if (foldToggle) foldToggle.querySelector('span').textContent = n ? 'Filters on (' + n + '): ' + activeLabels(state).join(' · ') : 'Filter the record';
    syncControls();
    if (updateURL) {
      var q = toQuery(state);
      try {
        history.replaceState(null, '', location.pathname + (q ? '?' + q + '#record' : location.hash === '#record' ? '#record' : ''));
      } catch (e) { /* file:// or sandboxed: the view still works */ }
    }
  }

  /* ---------------------------------------------------------------- controls */
  chips.forEach(function (c) {
    c.addEventListener('click', function () {
      var f = c.getAttribute('data-f');
      var v = c.getAttribute('data-v');
      state[f] = f === 'again' ? (state.again ? '' : '1') : v;
      apply(true, true);
    });
  });
  selects.forEach(function (sel) {
    sel.addEventListener('change', function () {
      state[sel.getAttribute('data-f')] = sel.value;
      apply(true, true);
    });
  });
  form.addEventListener('submit', function (e) { e.preventDefault(); });
  resets.forEach(function (b) {
    b.addEventListener('click', function () {
      state = blank();
      apply(true, true);
      var first = form.querySelector('.chip');
      if (first) first.focus();
    });
  });

  /* Section links elsewhere on the page ("Awards nights in the record") filter in place. */
  each(doc.querySelectorAll('a[data-work-filter]'), function (a) {
    a.addEventListener('click', function (e) {
      var href = a.getAttribute('href') || '';
      var q = href.split('#')[0];
      if (q.charAt(0) !== '?') return;
      e.preventDefault();
      state = fromQuery(q);
      apply(false, true);
      if (heading) {
        heading.setAttribute('tabindex', '-1');
        record.scrollIntoView({ block: 'start' });
        heading.focus({ preventScroll: true });
      }
    });
  });

  /* ---------------------------------------------------------------- earlier years */
  function expand(focusYear) {
    expanded = true;
    apply(true, false);
    if (earlierBtn) earlierBtn.setAttribute('aria-expanded', 'true');
    var target = focusYear && doc.getElementById(focusYear);
    if (target) {
      var h = target.querySelector('.work-year__h');
      if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
    }
  }
  if (earlierBtn) {
    earlierBtn.addEventListener('click', function () { expand('y2024'); });
  }
  /* "Jump to a year" into a folded year opens the earlier years first. */
  each(doc.querySelectorAll('.work-jump__list a'), function (a) {
    a.addEventListener('click', function () {
      var id = (a.getAttribute('href') || '').slice(1);
      var y = doc.getElementById(id);
      if (y && y.hidden && !activeCount(state)) expand(null);
    });
  });

  /* ---------------------------------------------------------------- phones and tablets: the panel starts folded */
  function initFold(startFolded) {
    foldToggle = doc.createElement('button');
    foldToggle.type = 'button';
    foldToggle.className = 'work-filters__toggle';
    foldToggle.setAttribute('aria-controls', form.id || 'work-filters');
    foldToggle.appendChild(doc.createElement('span'));
    if (!form.id) form.id = 'work-filters';
    form.insertBefore(foldToggle, form.firstChild);
    var setFolded = function (on) {
      form.classList.toggle('is-folded', on);
      foldToggle.setAttribute('aria-expanded', String(!on));
    };
    foldToggle.addEventListener('click', function () { setFolded(!form.classList.contains('is-folded')); });
    setFolded(startFolded);
  }

  /* ---------------------------------------------------------------- phone bar */
  if (bar && barBtn && 'IntersectionObserver' in window) {
    bar.hidden = false;
    var seen = { form: true, record: false };
    var render = function () {
      var show = !seen.form && seen.record;
      if (show) bar.setAttribute('data-show', '');
      else bar.removeAttribute('data-show');
      barBtn.tabIndex = show ? 0 : -1;
      bar.setAttribute('aria-hidden', String(!show));
      doc.documentElement.classList.toggle('work-bar-on', show);
    };
    new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.target === form) seen.form = en.isIntersecting;
        else seen.record = en.isIntersecting;
      });
      render();
    }, { rootMargin: '-72px 0px 0px 0px' }).observe(form);
    var ledger = doc.querySelector('.work-ledger');
    if (ledger) {
      /* The bar leaves as soon as the last row passes under the header and the bar (56 + 57px). */
      new IntersectionObserver(function (entries) {
        seen.record = entries[0].isIntersecting;
        render();
      }, { rootMargin: '-114px 0px 0px 0px' }).observe(ledger);
    }
    barBtn.addEventListener('click', function () {
      if (foldToggle && form.classList.contains('is-folded')) foldToggle.click();
      form.scrollIntoView({ block: 'start' });
      var target = form.querySelector('.chip[aria-pressed="true"]') || form.querySelector('.chip');
      if (target) target.focus({ preventScroll: true });
    });
    render();
  }

  /* ---------------------------------------------------------------- start */
  form.hidden = false;
  state = fromQuery(location.search);
  initFold(mqPhone.matches);
  apply(false, false);
})();
