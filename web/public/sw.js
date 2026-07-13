/* SISIRBINDU TRACKERAPP — service worker.
 *
 * Its only job is notifications. It deliberately does NOT cache the app shell:
 * this is a live financial ledger, and serving a stale balance from a cache would
 * be worse than showing a loading spinner.
 *
 * Two paths land here:
 *   push          — the server pushed while the tab was closed (or backgrounded).
 *   postMessage   — the open tab received a WebSocket event and asked us to raise
 *                   a real OS notification, so it looks the same either way.
 */

const TAG = 'sisirbindu';

self.addEventListener('install', () => {
    // Take over immediately rather than waiting for every old tab to close.
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
});

/** Raise a notification. Shared by the push and postMessage paths. */
const show = (data) => {
    const title = data.title || 'SisirBindu Tracker';

    return self.registration.showNotification(title, {
        body: data.message || '',
        icon: '/icon-192.png',
        // Monochrome silhouette — Android masks the badge, so a colour logo would
        // render as a grey blob.
        badge: '/badge-72.png',
        tag: data.id || TAG,
        // A budget alert should not silently replace an earlier payment reminder.
        renotify: !!data.id,
        requireInteraction: data.type === 'BUDGET_ALERT',
        timestamp: Date.now(),
        data: {
            url: data.url || '/app',
            type: data.type || 'SYSTEM',
        },
    });
};

self.addEventListener('push', (event) => {
    let payload = {};
    try {
        payload = event.data ? event.data.json() : {};
    } catch {
        payload = { title: 'SisirBindu Tracker', message: event.data?.text() || '' };
    }
    event.waitUntil(show(payload));
});

/* The tab is open and got a WebSocket event. It cannot raise an OS notification
   itself in a way that survives being backgrounded, so it hands it to us. */
self.addEventListener('message', (event) => {
    if (event.data?.type === 'notify') {
        event.waitUntil(show(event.data.payload || {}));
    }
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const url = event.notification.data?.url || '/app';

    // Focus an existing tab if there is one, rather than piling up new ones.
    event.waitUntil(
        self.clients
            .matchAll({ type: 'window', includeUncontrolled: true })
            .then((clients) => {
                for (const client of clients) {
                    if ('focus' in client) {
                        client.navigate(url);
                        return client.focus();
                    }
                }
                return self.clients.openWindow(url);
            })
    );
});
