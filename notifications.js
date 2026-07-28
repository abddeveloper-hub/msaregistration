// Stub for notifications engine (Notifications system removed)
export async function sendAppNotification() { return Promise.resolve(null); }
export async function registerDeviceForPushNotifications() { return Promise.resolve(null); }
export function showToast() {}
export function triggerNativeNotification() {}
export async function requestAppNotificationPermission() { return Promise.resolve('granted'); }
export function runNotificationDiagnostic() {}
export function markAllAsRead() {}

if (typeof window !== "undefined") {
    window.sendAppNotification = sendAppNotification;
    window.showToast = showToast;
    window.triggerNativeNotification = triggerNativeNotification;
    window.requestAppNotificationPermission = requestAppNotificationPermission;
    window.runNotificationDiagnostic = runNotificationDiagnostic;
    window.testNotification = runNotificationDiagnostic;
}
