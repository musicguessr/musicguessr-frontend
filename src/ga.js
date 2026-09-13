// Google Analytics 4 loader. The id is filled in at container start by the
// entrypoint from GA_MEASUREMENT_ID; with no id (or an unpatched dev build)
// this does nothing. Kept out of index.html so the Content-Security-Policy
// can forbid inline scripts.
(function () {
  var id = '__GA_MEASUREMENT_ID__';
  if (!id || id.charAt(0) === '_') return;
  var s = document.createElement('script');
  s.async = true;
  s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(id);
  document.head.appendChild(s);
  window.dataLayer = window.dataLayer || [];
  function gtag() {
    window.dataLayer.push(arguments);
  }
  window.gtag = gtag;
  gtag('js', new Date());
  gtag('config', id);
})();
