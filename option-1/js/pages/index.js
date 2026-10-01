/* index.html · page script. Owned by the Home builder (SPEC.md §7). The page is complete without it.
 *  "The rooms" family titles: no-JS they land on the Work page's family anchors; with JS they open the
 *  filtered, forwardable view (work.html?family=<slug>#record).
 * S1 (the cue) and S2 (lower thirds) run from the shared js/signature.js via the hooks in the markup.
 */
(function () {
  'use strict';

  Array.prototype.forEach.call(document.querySelectorAll('.home-room__title a[data-family]'), function (a) {
    var slug = a.getAttribute('data-family');
    if (/^[a-z-]+$/.test(slug)) a.setAttribute('href', 'work.html?family=' + slug + '#record');
  });
})();
