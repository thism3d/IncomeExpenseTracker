// WebSocket transport, shaped like a REST client.
//
// The backend turns each frame into a synthetic Express request, so `get('/accounts')`
// hits the very same handler an HTTP GET would. Two things the reference
// implementation got wrong and that are fixed here:
//
//   1. Requests time out. A dropped response used to leave a promise pending forever.
//   2. In-flight requests are re-issued on reconnect instead of being rejected, so a
//      brief network blip doesn't surface as an error to the user.

export type ApiResponse<T = any> = { success: boolean; message?: string; data: T };
export type ApiError = { code: string; message: string; [k: string]: any };

export class ApiRequestError extends Error {
    code: string;
    status: number;
    detail: ApiError;

    constructor(status: number, error: ApiError) {
        super(error?.message || 'Request failed');
        this.name = 'ApiRequestError';
        this.status = status;
        this.code = error?.code || 'UNKNOWN';
        this.detail = error;
    }
}

const HTTP_BASE: string = (import.meta.env.VITE_API_URL as string) || 'http://localhost:5051/api';
const WS_URL = HTTP_BASE.replace(/^http/, 'ws').replace(/\/api\/?$/, '') + '/ws';

const REQUEST_TIMEOUT_MS = 20000;
const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 15000;

type Pending = {
    resolve: (v: any) => void;
    reject: (e: any) => void;
    frame: Record<string, unknown>;
    timer: ReturnType<typeof setTimeout>;
    retried: boolean;
};

type EventHandler = (payload: any) => void;

class WsClient {
    private ws: WebSocket | null = null;
    private pending = new Map<string, Pending>();
    private listeners = new Map<string, Set<EventHandler>>();
    private statusListeners = new Set<(connected: boolean) => void>();
    private counter = 0;
    private attempts = 0;
    private connecting = false;
    private queue: Array<() => void> = [];

    connected = false;

    constructor() {
        this.connect();
        // A tab that comes back from the background often has a socket the browser
        // already killed without firing 'close'. Re-check on focus.
        if (typeof window !== 'undefined') {
            window.addEventListener('online', () => this.connect());
            window.addEventListener('focus', () => {
                if (this.ws?.readyState !== WebSocket.OPEN) this.connect();
            });
        }
    }

    private token() {
        return localStorage.getItem('sb_token');
    }

    private connect() {
        if (this.connecting) return;
        if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return;

        this.connecting = true;
        const ws = new WebSocket(WS_URL);
        this.ws = ws;

        ws.onopen = () => {
            this.connecting = false;
            this.attempts = 0;
            this.connected = true;
            this.statusListeners.forEach((fn) => fn(true));

            // Bind this socket to the user so server pushes find it.
            if (this.token()) this.send('GET', '/auth/me').catch(() => {});

            // Anything queued while we were down goes out now.
            const queued = this.queue;
            this.queue = [];
            queued.forEach((fn) => fn());

            // Re-issue whatever was in flight when the socket dropped — but only
            // once, so a request that itself kills the connection can't loop.
            for (const [, p] of this.pending) {
                if (!p.retried) {
                    p.retried = true;
                    ws.send(JSON.stringify(p.frame));
                }
            }
        };

        ws.onmessage = (evt) => {
            let msg: any;
            try {
                msg = JSON.parse(evt.data);
            } catch {
                return;
            }

            if (msg.type === 'event') {
                this.listeners.get(msg.event)?.forEach((fn) => fn(msg.payload));
                this.listeners.get('*')?.forEach((fn) => fn(msg));
                return;
            }

            const p = this.pending.get(msg.id);
            if (!p) return;
            this.pending.delete(msg.id);
            clearTimeout(p.timer);

            if (msg.status >= 200 && msg.status < 300) {
                p.resolve(msg.payload);
            } else {
                p.reject(new ApiRequestError(msg.status, msg.payload?.error || { code: 'UNKNOWN', message: 'Request failed' }));
            }
        };

        ws.onclose = () => {
            this.connecting = false;
            this.connected = false;
            this.statusListeners.forEach((fn) => fn(false));

            // Don't reject in-flight requests here: onopen re-issues them. Their own
            // timeouts are the backstop if the socket never comes back.
            this.attempts += 1;
            const delay = Math.min(RECONNECT_BASE_MS * 2 ** (this.attempts - 1), RECONNECT_MAX_MS);
            setTimeout(() => this.connect(), delay);
        };

        ws.onerror = () => {
            this.connecting = false;
        };
    }

    private send<T>(method: string, action: string, payload: unknown = {}): Promise<ApiResponse<T>> {
        const id = `r${++this.counter}_${Date.now()}`;
        const token = this.token();
        const frame: Record<string, unknown> = {
            id,
            action: action.replace(/^\//, ''),
            method,
            payload,
            ...(token ? { token: `Bearer ${token}` } : {}),
        };

        return new Promise<ApiResponse<T>>((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pending.delete(id);
                reject(new ApiRequestError(408, {
                    code: 'TIMEOUT',
                    message: 'The server took too long to respond. Check your connection.',
                }));
            }, REQUEST_TIMEOUT_MS);

            this.pending.set(id, { resolve, reject, frame, timer, retried: false });

            const write = () => this.ws!.send(JSON.stringify(frame));
            if (this.ws?.readyState === WebSocket.OPEN) {
                write();
            } else {
                // Hold it until the socket opens rather than failing immediately.
                this.queue.push(write);
                this.connect();
            }
        });
    }

    get<T = any>(action: string, params?: Record<string, any>) {
        let path = action;
        if (params) {
            const qs = new URLSearchParams(
                Object.entries(params)
                    .filter(([, v]) => v !== undefined && v !== null && v !== '')
                    .map(([k, v]) => [k, String(v)])
            ).toString();
            if (qs) path += `?${qs}`;
        }
        return this.send<T>('GET', path);
    }

    post<T = any>(action: string, body?: unknown) { return this.send<T>('POST', action, body); }
    put<T = any>(action: string, body?: unknown) { return this.send<T>('PUT', action, body); }
    delete<T = any>(action: string) { return this.send<T>('DELETE', action); }

    // The unsubscribe must return void, not Set.delete's boolean — React would
    // otherwise reject it as an effect cleanup function.
    on(event: string, handler: EventHandler): () => void {
        if (!this.listeners.has(event)) this.listeners.set(event, new Set());
        this.listeners.get(event)!.add(handler);
        return () => {
            this.listeners.get(event)?.delete(handler);
        };
    }

    onStatus(handler: (connected: boolean) => void): () => void {
        this.statusListeners.add(handler);
        handler(this.connected);
        return () => {
            this.statusListeners.delete(handler);
        };
    }

    // Binary bodies can't ride the WebSocket — uploads and report downloads go over
    // real HTTP against the same server, with the same bearer token.
    async upload<T = any>(path: string, form: FormData, onProgress?: (pct: number) => void): Promise<ApiResponse<T>> {
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('POST', `${HTTP_BASE}${path}`);
            const token = this.token();
            if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);

            xhr.upload.onprogress = (e) => {
                if (onProgress && e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
            };
            xhr.onload = () => {
                let body: any;
                try { body = JSON.parse(xhr.responseText); } catch { body = {}; }
                if (xhr.status >= 200 && xhr.status < 300) resolve(body);
                else reject(new ApiRequestError(xhr.status, body?.error || { code: 'UPLOAD_FAILED', message: 'Upload failed' }));
            };
            xhr.onerror = () => reject(new ApiRequestError(0, { code: 'NETWORK', message: 'Network error during upload' }));
            xhr.send(form);
        });
    }

    // Authenticated file/report download. Fetches as a blob so the bearer token can
    // be attached — a plain <a href> can't carry it.
    async download(path: string, filename?: string) {
        const res = await fetch(`${HTTP_BASE}${path}`, {
            headers: this.token() ? { Authorization: `Bearer ${this.token()}` } : {},
        });
        if (!res.ok) {
            let detail: ApiError = { code: 'DOWNLOAD_FAILED', message: 'Download failed' };
            try { detail = (await res.json()).error ?? detail; } catch { /* keep the default */ }
            throw new ApiRequestError(res.status, detail);
        }

        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename || path.split('/').pop() || 'download';
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    }

    /**
     * Fetch an authenticated binary as a Blob.
     *
     * `<img src>`, `<iframe src>` and `<audio src>` cannot carry an Authorization
     * header — the browser issues those requests bare, and our file route answers
     * 401. So anything that needs to *display* a file fetches it here and wraps the
     * result in an object URL. See useFileBlob().
     */
    async fetchBlob(path: string): Promise<Blob> {
        const res = await fetch(`${HTTP_BASE}${path}`, {
            headers: this.token() ? { Authorization: `Bearer ${this.token()}` } : {},
        });
        if (!res.ok) {
            let detail: ApiError = { code: 'FETCH_FAILED', message: 'Could not load this file' };
            try { detail = (await res.json()).error ?? detail; } catch { /* keep the default */ }
            throw new ApiRequestError(res.status, detail);
        }
        return res.blob();
    }

    /**
     * Open the browser's print dialog for a server-generated PDF (a statement, a
     * receipt). Loads it into a hidden iframe and prints that, so the user never
     * leaves the page and never has to save the file first.
     */
    async print(path: string) {
        const blob = await this.fetchBlob(path);
        const url = URL.createObjectURL(blob);

        const frame = document.createElement('iframe');
        frame.style.position = 'fixed';
        frame.style.right = '0';
        frame.style.bottom = '0';
        frame.style.width = '0';
        frame.style.height = '0';
        frame.style.border = '0';
        frame.src = url;

        return new Promise<void>((resolve) => {
            frame.onload = () => {
                try {
                    frame.contentWindow?.focus();
                    frame.contentWindow?.print();
                } catch {
                    // A blocked print dialog is not worth throwing over — the user can
                    // still download the file.
                }
                // Give the print dialog time to take its own copy of the document
                // before the blob and the frame disappear underneath it.
                setTimeout(() => {
                    URL.revokeObjectURL(url);
                    frame.remove();
                    resolve();
                }, 60000);
            };
            document.body.appendChild(frame);
        });
    }

    fileUrl(id: string) {
        return `${HTTP_BASE}/files/${id}`;
    }
}

export const api = new WsClient();
export const HTTP_API_BASE = HTTP_BASE;
