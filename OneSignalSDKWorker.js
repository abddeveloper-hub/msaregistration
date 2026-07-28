importScripts('https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js');
try {
  importScripts('./sw.js');
} catch (e) {
  console.warn('Service worker import notice:', e);
}
