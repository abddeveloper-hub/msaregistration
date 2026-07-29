// Notifications engine stub & Toast utility proxy
export async function sendAppNotification() { return Promise.resolve(null); }
export async function registerDeviceForPushNotifications() { return Promise.resolve(null); }
export function showToast(msg, type = 'info') {
    if (typeof window !== "undefined" && typeof window.originalShowToast === "function") {
        window.originalShowToast(msg, type);
    } else {
        const toast = document.createElement('div');
        toast.className = `toast-notification ${type}`;
        toast.innerHTML = `<span class="toast-icon">${type === 'success' ? '✓' : '⚠'}</span><span class="toast-message">${msg}</span>`;
        document.body.appendChild(toast);
        setTimeout(() => toast.classList.add('show'), 10);
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
}
export function triggerNativeNotification() {}
export async function requestAppNotificationPermission() { return Promise.resolve('granted'); }
export function runNotificationDiagnostic() {}
export function markAllAsRead() {}

if (typeof window !== "undefined") {
    window.sendAppNotification = sendAppNotification;
    if (!window.showToast) {
        window.showToast = showToast;
    }
    window.triggerNativeNotification = triggerNativeNotification;
    window.requestAppNotificationPermission = requestAppNotificationPermission;
    window.runNotificationDiagnostic = runNotificationDiagnostic;
    window.testNotification = runNotificationDiagnostic;
}
