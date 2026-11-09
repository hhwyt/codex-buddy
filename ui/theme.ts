// Day / night theme by the local clock: 07:00–19:00 is "day", the rest is "night".
// Sets <html data-theme="day|night">; the two looks live in app.css.
// Loaded in <head> before app.css, so the first paint already has the right theme.
// Preview screenshots can force one with ?theme=day or ?theme=night.
(() => {
  const DAY_START_HOUR = 7;
  const NIGHT_START_HOUR = 19;
  const root = document.documentElement;
  const forcedTheme = new URLSearchParams(location.search).get('theme');
  if (forcedTheme === 'day' || forcedTheme === 'night') { root.setAttribute('data-theme', forcedTheme); return; }

  const applyThemeForNow = () => {
    const hour = new Date().getHours();
    const theme = hour >= DAY_START_HOUR && hour < NIGHT_START_HOUR ? 'day' : 'night';
    if (root.getAttribute('data-theme') !== theme) root.setAttribute('data-theme', theme);
  };
  applyThemeForNow();
  // Check every minute rather than one long timer to the next switch: sleep and clock changes would make that timer late
  setInterval(applyThemeForNow, 60_000);
})();
