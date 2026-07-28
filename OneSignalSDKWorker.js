try {
  importScripts('./sw.js');
} catch (e) {
  console.warn('Service worker import notice:', e);
}
