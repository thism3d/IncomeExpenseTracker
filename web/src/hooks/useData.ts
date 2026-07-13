import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/ws';

// A small fetch hook: no cache library, because every screen here wants live data
// and the WebSocket already pushes invalidations.
export function useApi<T>(
    path: string | null,
    params?: Record<string, any>,
    deps: unknown[] = []
) {
    const [data, setData] = useState<T | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const key = params ? JSON.stringify(params) : '';

    const load = useCallback(async () => {
        if (!path) {
            setLoading(false);
            return;
        }
        setError(null);
        try {
            const res = await api.get<T>(path, params);
            setData(res.data);
        } catch (err: any) {
            setError(err.message || 'Could not load');
        } finally {
            setLoading(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [path, key, ...deps]);

    useEffect(() => {
        setLoading(true);
        load();
    }, [load]);

    return { data, loading, error, reload: load, setData };
}

// Re-run a loader whenever the server says the ledger changed on any device.
export function useLiveRefresh(reload: () => void) {
    useEffect(() => {
        const off = [
            api.on('transaction:created', reload),
            api.on('transaction:updated', reload),
            api.on('transaction:deleted', reload),
        ];
        return () => off.forEach((fn) => fn());
    }, [reload]);
}
