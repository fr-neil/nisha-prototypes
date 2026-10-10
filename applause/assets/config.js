/* The one file to edit before launch; then rebuild the pages (see the launch notes).
   The build writes these values into the pages for link previews and visitors without
   JavaScript; the page script reads the contact values for the message composer.
   PLACEHOLDER values are deliberately fake. Replace them with Nisha's. */
window.NISHA_SITE = {
  url: 'https://fr-neil.github.io/nisha-prototypes/applause/', // PLACEHOLDER preview address. Canonical, link preview and JSON-LD use it. End with "/".
  preview: true,                                         // true while on preview: pages carry noindex. Set false at launch.
  whatsapp: '910000000000',                              // PLACEHOLDER (fake). Digits only, country code first (used for wa.me).
  phone: '+910000000000',                                // PLACEHOLDER (fake). Used for tel: links.
  phoneDisplay: '+91 00000 00000',                       // PLACEHOLDER (fake). As printed on the page.
  email: 'bookings@example.com',                         // PLACEHOLDER (fake).
  instagram: 'https://www.instagram.com/nishashetty22/', // Her public account.
  linkedin: '',                                          // To confirm. Leave empty to hide the link.
  credit: 'HSBC photographs by @keshavphotography1.',   // To confirm with Nisha and the photographer.

  // Quotes from clients, role only. sample: true shows a "Sample quote" tag; launch drops samples.
  quotes: [
    { text: 'Our people walked in as employees and left feeling like the guests of honour.', by: 'Head of HR, a private bank', sample: true },
    { text: 'She kept a long awards list moving, and the room with her.', by: 'Sales head, a manufacturer', sample: true },
  ],

  // Good to know. confirm: true shows a "to confirm" tag; launch refuses while any remain.
  faq: [
    { q: 'Languages', a: 'English and Hindi.' },
    { q: 'Travel', a: 'Based in Mumbai; she hosts across India and abroad, in 15+ countries so far.' },
    { q: 'Fees', a: 'Shared on request; they depend on the format, the duration and the city.', confirm: true },
    { q: 'How she prepares', a: 'A brief call, then the script, a rehearsal, and the day itself.', confirm: true },
    { q: 'How far ahead to ask', a: 'Send the date as soon as you have one, even if it is close.', confirm: true },
  ],
  paperwork: { text: 'GST invoice and standard contract', confirm: true },
};
