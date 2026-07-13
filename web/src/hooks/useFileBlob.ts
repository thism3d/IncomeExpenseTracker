import { useEffect, useState } from 'react';
import { api } from '@/lib/ws';

/**
 * An object URL for an authenticated file.
 *
 * The `/api/files/:id` route requires a bearer token, and a browser cannot attach
 * one to `<img src>`, `<iframe src>` or `<audio src>` — those requests go out bare
 * and come back 401. That is exactly why the Drive previews were blank.
 *
 * So fetch the bytes with the token, wrap them in an object URL, and hand *that*
 * to the element. The URL is revoked on unmount, so blobs don't accumulate as the
 * user clicks through their files.
 */
export function useFileBlob(fileId: string | null | undefined) {
    const [url, setUrl] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!fileId) {
            setUrl(null);
            return;
        }

        let objectUrl: string | null = null;
        let cancelled = false;

        setLoading(true);
        setError(null);

        api.fetchBlob(`/files/${fileId}`)
            .then((blob) => {
                if (cancelled) return;
                objectUrl = URL.createObjectURL(blob);
                setUrl(objectUrl);
            })
            .catch((err: any) => {
                if (cancelled) return;
                setError(err?.message || 'Could not load this file');
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => {
            cancelled = true;
            // Without this, every preview leaks its blob for the life of the tab.
            if (objectUrl) URL.revokeObjectURL(objectUrl);
        };
    }, [fileId]);

    return { url, loading, error };
}
