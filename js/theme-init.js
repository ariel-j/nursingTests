// Classic (non-module) script, loaded synchronously in <head> before the stylesheets, so a saved
// light / dark choice is on <html> before the first paint (modules run too late and would flash).
// Keep the storage key in sync with js/storage.js (prefix) and js/theme-core.js (THEME_KEY); a test checks it.
(function () {
  try {
    var saved = JSON.parse(window.localStorage.getItem('anatomy-quizzes:v1:theme'));
    if (saved === 'light' || saved === 'dark') document.documentElement.setAttribute('data-theme', saved);
  } catch (e) {
    // storage blocked or unreadable: stay on auto
  }
  // The subject's color theme, known at once from ?subject=<id> (js/nav.js sets it for other pages).
  var m = /[?&]subject=([a-z0-9-]+)(?:&|$)/.exec(window.location.search);
  if (m) document.documentElement.setAttribute('data-subject', m[1]);
})();
