import { useEffect, useState } from 'react';
import { Wrench } from 'lucide-react';
import { api } from '@/lib/ws';
import { useAuth } from '@/context/AuthContext';
import { formatDate } from '@/lib/utils';

interface Maintenance {
    active: boolean;
    message: string;
    start: string | null;
    end: string | null;
}

// A full-screen curtain while the backend is in maintenance. Admins pass through —
// they are the ones who have to turn it back off.
export const MaintenanceGate = () => {
    const { isAdmin } = useAuth();
    const [state, setState] = useState<Maintenance | null>(null);

    useEffect(() => {
        api.get<{ maintenance: Maintenance }>('/app/config')
            .then((res) => setState(res.data.maintenance))
            .catch(() => { /* if config is unreachable, don't block the app on a guess */ });

        // The admin toggling maintenance broadcasts to every socket, so this flips
        // without a reload.
        return api.on('maintenance', (payload: Maintenance) => setState(payload));
    }, []);

    if (!state?.active || isAdmin) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background px-6">
            <div className="w-full max-w-md text-center">
                <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
                    <Wrench className="h-7 w-7 text-primary" />
                </div>
                <h1 className="text-xl font-semibold">Back shortly</h1>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{state.message}</p>
                {state.end && (
                    <p className="mt-4 rounded-lg bg-muted px-4 py-2.5 text-xs text-muted-foreground">
                        Expected back by <span className="font-medium text-foreground">{formatDate(state.end, 'full')}</span>
                    </p>
                )}
            </div>
        </div>
    );
};
