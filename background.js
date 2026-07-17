/**
 * Minimal MV3 service worker.
 * Keeps the extension process warm so toolbar popup cold-start is faster.
 * No network I/O, no scrape logic.
 */
chrome.runtime.onInstalled.addListener(() => {
  /* no-op: registration only */
});
