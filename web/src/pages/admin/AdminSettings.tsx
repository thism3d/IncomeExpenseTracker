import { useState } from 'react';
import { Save, ScrollText, Settings2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/ws';
import { useApi } from '@/hooks/useData';
import { formatDate, relativeTime } from '@/lib/utils';
import {
    Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState,
    Input, Skeleton, Tabs, TabsContent, TabsList, TabsTrigger,
} from '@/components/ui';

interface Setting { key: string; value: string; updated_at: string }

interface AuditEntry {
    id: string;
    action: string;
    target: string | null;
    detail: any;
    ip: string | null;
    actor: { id: string; name: string; email: string } | null;
    createdAt: string;
}

// Maintenance keys are edited on the App page — showing them here as raw rows
// would just be a second, worse UI for the same thing.
const HIDDEN = /^maintenance_/;

export default function AdminSettings() {
    const settingsQ = useApi<{ settings: Setting[] }>('/admin/settings');
    const auditQ = useApi<{ entries: AuditEntry[] }>('/admin/audit', { limit: 60 });

    const [edited, setEdited] = useState<Record<string, string>>({});
    const [saving, setSaving] = useState<string | null>(null);

    const save = async (key: string) => {
        setSaving(key);
        try {
            await api.put('/admin/settings', { key, value: edited[key] });
            toast.success(`${key} saved`);
            setEdited((e) => {
                const next = { ...e };
                delete next[key];
                return next;
            });
            settingsQ.reload();
        } catch (err: any) {
            toast.error(err.message || 'Could not save');
        } finally {
            setSaving(null);
        }
    };

    const settings = (settingsQ.data?.settings ?? []).filter((s) => !HIDDEN.test(s.key));

    return (
        <div className="mx-auto max-w-4xl space-y-5">
            <div>
                <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
                <p className="text-sm text-muted-foreground">Platform configuration and the audit trail.</p>
            </div>

            <Tabs defaultValue="settings">
                <TabsList>
                    <TabsTrigger value="settings">
                        <Settings2 className="mr-1.5 h-3.5 w-3.5" /> Configuration
                    </TabsTrigger>
                    <TabsTrigger value="audit">
                        <ScrollText className="mr-1.5 h-3.5 w-3.5" /> Audit log
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="settings">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">Platform settings</CardTitle>
                            <CardDescription>
                                Maintenance is configured on the App page. These are the remaining keys.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            {settingsQ.loading ? (
                                Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14" />)
                            ) : !settings.length ? (
                                <p className="py-8 text-center text-sm text-muted-foreground">No settings to show.</p>
                            ) : (
                                settings.map((s) => {
                                    const dirty = edited[s.key] !== undefined && edited[s.key] !== s.value;
                                    return (
                                        <div key={s.key} className="flex flex-wrap items-end gap-3 rounded-xl border p-3.5">
                                            <div className="min-w-[180px] flex-1">
                                                <p className="mb-1.5 font-mono text-xs font-medium">{s.key}</p>
                                                <Input
                                                    value={edited[s.key] ?? s.value}
                                                    onChange={(e) =>
                                                        setEdited((prev) => ({ ...prev, [s.key]: e.target.value }))
                                                    }
                                                    className="h-9"
                                                />
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-[11px] text-muted-foreground">
                                                    {relativeTime(s.updated_at)}
                                                </span>
                                                <Button
                                                    size="sm"
                                                    disabled={!dirty}
                                                    loading={saving === s.key}
                                                    onClick={() => save(s.key)}
                                                >
                                                    <Save className="h-3.5 w-3.5" /> Save
                                                </Button>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="audit">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">Audit log</CardTitle>
                            <CardDescription>
                                Every admin action — suspensions, password resets, maintenance toggles, releases.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="px-0">
                            {auditQ.loading ? (
                                <div className="space-y-2 px-5">
                                    {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14" />)}
                                </div>
                            ) : !auditQ.data?.entries.length ? (
                                <EmptyState
                                    icon={ScrollText}
                                    title="Nothing logged yet"
                                    description="Admin actions will appear here as they happen."
                                />
                            ) : (
                                <div className="divide-y">
                                    {auditQ.data.entries.map((e) => (
                                        <div key={e.id} className="flex items-start gap-3 px-5 py-3">
                                            <Badge variant="secondary" className="mt-0.5 shrink-0 font-mono text-[10px]">
                                                {e.action}
                                            </Badge>
                                            <div className="min-w-0 flex-1">
                                                <p className="text-sm">
                                                    <span className="font-medium">{e.actor?.name ?? 'System'}</span>
                                                    {e.target && (
                                                        <span className="text-muted-foreground"> · {e.target}</span>
                                                    )}
                                                </p>
                                                {e.detail && (
                                                    <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
                                                        {JSON.stringify(e.detail)}
                                                    </p>
                                                )}
                                            </div>
                                            <span className="shrink-0 text-right text-[11px] text-muted-foreground">
                                                {formatDate(e.createdAt, 'full')}
                                                {e.ip && <span className="block">{e.ip}</span>}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
}
