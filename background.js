/**
 * Minimal MV3 service worker.
 * Registers the extension background process so Chrome can wake it quickly on
 * toolbar click. Does not run a keep-alive loop (by design — SW may still sleep).
 * No network I/O, no scrape logic, nothing on the popup critical path.
 */
chrome.runtime.onInstalled.addListener(() => {
  /* no-op: registration only */
});

chrome.runtime.onStartup.addListener(() => {
  /* no-op: ensure SW file is evaluated when browser starts */
});
