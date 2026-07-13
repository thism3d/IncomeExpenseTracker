import { api } from './ws';

/**
 * Browser notifications.
 *
 * Two delivery paths, both ending in a real OS notification:
 *
 *   tab open   — the WebSocket already delivers the event. We hand it to the
 *                service worker, which raises the notification, so it shows up
 *                even when the tab is merely backgrounded (a page cannot reliably
 *                do that itself).
 *
 *   tab closed — the server sends a Web Push. That needs a VAPID key pair; when
 *                one is not configured, push is simply skipped and the user still
 *                gets the notification in-app and by email.
 */

const VAPID_PUBLIC_KEY = (import.meta.env.VITE_VAPID_PUBLIC_KEY as string) || '';

export const pushSupported = () =>
    'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

let registration: ServiceWorkerRegistration | null = null;

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
    if (!('serviceWorker' in navigator)) return null;
    if (registration) return registration;

    try {
        registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
        await navigator.serviceWorker.ready;
        return registration;
    } catch {
        // A failed SW registration must not break the app — notifications degrade
        // to in-app toasts and email.
        return null;
    }
}

export const permission = (): NotificationPermission =>
    'Notification' in window ? Notification.permission : 'denied';

/** VAPID keys are base64url; PushManager wants raw bytes. */
const urlBase64ToUint8Array = (base64: string) => {
    const padding = '='.repeat((4 - (base64.length % 4)) % 4);
    const normalised = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = window.atob(normalised);
    return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
};

/**
 * Ask for permission and subscribe to Web Push.
 * Must be called from a user gesture — browsers reject a bare permission prompt.
 */
export async function enableNotifications(): Promise<{ ok: boolean; reason?: string }> {
    if (!pushSupported()) {
        return { ok: false, reason: 'This browser does not support notifications.' };
    }

    const granted = await Notification.requestPermission();
    if (granted !== 'granted') {
        return {
            ok: false,
            reason:
                granted === 'denied'
                    ? 'Notifications are blocked. Enable them in your browser’s site settings.'
                    : 'Notification permission was dismissed.',
        };
    }

    const reg = await registerServiceWorker();
    if (!reg) return { ok: false, reason: 'Could not start the notification service.' };

    // Without a VAPID key we can still raise notifications while a tab is open —
    // we just cannot receive a push when every tab is closed.
    if (!VAPID_PUBLIC_KEY) {
        return { ok: true };
    }

    try {
        const existing = await reg.pushManager.getSubscription();
        const subscription =
            existing ??
            (await reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
            }));

        await api.post('/notifications/subscribe', subscription.toJSON());
        return { ok: true };
    } catch (err: any) {
        return { ok: false, reason: err?.message || 'Could not subscribe to push notifications.' };
    }
}

export async function disableNotifications() {
    const reg = await registerServiceWorker();
    const subscription = await reg?.pushManager.getSubscription();
    if (!subscription) return;

    await api.post('/notifications/unsubscribe', { endpoint: subscription.endpoint }).catch(() => {});
    await subscription.unsubscribe().catch(() => {});
}

/**
 * The tab is open and the WebSocket delivered an event. Hand it to the service
 * worker so it becomes a real OS notification rather than a toast the user misses
 * because they switched tabs.
 */
export async function notify(payload: {
    id?: string;
    title: string;
    message: string;
    type?: string;
    url?: string;
}) {
    if (permission() !== 'granted') return;
    const reg = await registerServiceWorker();
    reg?.active?.postMessage({ type: 'notify', payload });
}
