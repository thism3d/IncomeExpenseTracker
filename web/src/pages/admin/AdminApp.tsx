import { useEffect, useRef, useState } from 'react';
import {
    AlertTriangle, CheckCircle2, Download, Power, Smartphone, Trash2, Upload, Wrench,
} from 'lucide-react';
import { toast } from 'sonner';
import { api, HTTP_API_BASE } from '@/lib/ws';
import { useApi } from '@/hooks/useData';
import { cn, formatDate } from '@/lib/utils';
import {
    Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input,
    Label, Skeleton, Switch, Tabs, TabsContent, TabsList, TabsTrigger, Textarea,
} from '@/components/ui';
import type { AppVersion } from '@/lib/types';

interface MaintenanceState {
    active: boolean;
    inEffect: boolean;
    message: string;
    start: string;
    end: string;
    updatedAt: string;
}

// APK rows store a host-relative path (/downloads/…) so a dev upload can't pin a
// localhost URL into a row every phone will read. Resolve it against the API origin.
const resolveApkUrl = (raw: string | null) => {
    if (!raw) return '';
    if (raw.startsWith('http')) return raw;
    return `${HTTP_API_BASE.replace(/\/api\/?$/, '')}${raw}`;
};

export default function AdminApp() {
    const versionsQ = useApi<{ versions: AppVersion[] }>('/admin/app/versions');
    const maintenanceQ = useApi<MaintenanceState>('/admin/maintenance');

    // Release form
    const [file, setFile] = useState<File | null>(null);
    const [versionName, setVersionName] = useState('');
    const [versionCode, setVersionCode] = useState('');
    const [changelog, setChangelog] = useState('');
    const [mandatory, setMandatory] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [progress, setProgress] = useState(0);
    const fileRef = useRef<HTMLInputElement>(null);

    // Maintenance form
    const [mode, setMode] = useState<'immediate' | 'scheduled'>('immediate');
    const [message, setMessage] = useState('');
    const [start, setStart] = useState('');
    const [end, setEnd] = useState('');
    const [savingMaintenance, setSavingMaintenance] = useState(false);

    useEffect(() => {
        const m = maintenanceQ.data;
        if (!m) return;
        setMessage(m.message);
        setStart(m.start ? m.start.slice(0, 16) : '');
        setEnd(m.end ? m.end.slice(0, 16) : '');
        if (m.start || m.end) setMode('scheduled');
    }, [maintenanceQ.data]);

    const publish = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!file) return toast.error('Choose an APK file');
        if (!versionName.trim() || !versionCode.trim()) {
            return toast.error('Version name and code are both required');
        }

        setUploading(true);
        setProgress(0);
        try {
            const form = new FormData();
            form.append('apk', file);
            form.append('versionName', versionName.trim());
            form.append('versionCode', versionCode.trim());
            form.append('changelog', changelog.trim());
            form.append('mandatory', String(mandatory));

            await api.upload('/admin/app/version', form, setProgress);
            toast.success(`Version ${versionName} published`, {
                description: 'Every open app has been notified.',
            });
            setFile(null); setVersionName(''); setVersionCode(''); setChangelog(''); setMandatory(false);
            if (fileRef.current) fileRef.current.value = '';
            versionsQ.reload();
        } catch (err: any) {
            toast.error(err.message || 'Upload failed');
        } finally {
            setUploading(false);
            setProgress(0);
        }
    };

    const toggleActive = async (v: AppVersion) => {
        try {
            await api.put(`/admin/app/versions/${v.id}/active`, { isActive: !v.isActive });
            toast.success(v.isActive ? 'Version deactivated' : 'Version is now live');
            versionsQ.reload();
        } catch (err: any) {
            toast.error(err.message || 'Could not update');
        }
    };

    const removeVersion = async (v: AppVersion) => {
        try {
            await api.delete(`/admin/app/versions/${v.id}`);
            toast.success('Version deleted');
            versionsQ.reload();
        } catch (err: any) {
            toast.error(err.message || 'Could not delete');
        }
    };

    const setMaintenance = async (active: boolean) => {
        setSavingMaintenance(true);
        try {
            await api.put('/admin/maintenance', {
                active,
                mode,
                message: message.trim(),
                start: mode === 'scheduled' ? start : '',
                end: mode === 'scheduled' ? end : '',
            });
            toast.success(active ? 'Maintenance mode is on' : 'Maintenance mode is off', {
                description: active
                    ? 'Users are blocked. Admins can still work.'
                    : 'Everyone has access again.',
            });
            maintenanceQ.reload();
        } catch (err: any) {
            toast.error(err.message || 'Could not update maintenance');
        } finally {
            setSavingMaintenance(false);
        }
    };

    const m = maintenanceQ.data;
    const versions = versionsQ.data?.versions ?? [];
    const live = versions.find((v) => v.isActive);

    return (
        <div className="mx-auto max-w-4xl space-y-5">
            <div>
                <h1 className="text-2xl font-semibold tracking-tight">App &amp; maintenance</h1>
                <p className="text-sm text-muted-foreground">
                    Publish updates the app installs itself, or take the platform offline.
                </p>
            </div>

            {m?.inEffect && (
                <div className="flex items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-4">
                    <Wrench className="h-5 w-5 shrink-0 text-destructive" />
                    <div className="flex-1">
                        <p className="text-sm font-medium text-destructive">Maintenance mode is live</p>
                        <p className="text-xs text-muted-foreground">
                            Users are seeing: “{m.message}”
                        </p>
                    </div>
                    <Button
                        variant="destructive" size="sm"
                        loading={savingMaintenance}
                        onClick={() => setMaintenance(false)}
                    >
                        End now
                    </Button>
                </div>
            )}

            <Tabs defaultValue="updates">
                <TabsList>
                    <TabsTrigger value="updates">
                        <Smartphone className="mr-1.5 h-3.5 w-3.5" /> App updates
                    </TabsTrigger>
                    <TabsTrigger value="maintenance">
                        <Wrench className="mr-1.5 h-3.5 w-3.5" /> Maintenance
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="updates" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">Publish a new build</CardTitle>
                            <CardDescription>
                                The app checks on launch and installs it. A mandatory update cannot be dismissed.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <form onSubmit={publish} className="space-y-4">
                                <div className="space-y-2">
                                    <Label>APK file</Label>
                                    <button
                                        type="button"
                                        onClick={() => fileRef.current?.click()}
                                        className={cn(
                                            'flex w-full flex-col items-center gap-1.5 rounded-xl border border-dashed py-6 transition-colors hover:border-primary hover:bg-accent/40',
                                            file && 'border-primary bg-primary/5'
                                        )}
                                    >
                                        <Upload className="h-5 w-5 text-muted-foreground" />
                                        <span className="text-sm">
                                            {file ? file.name : 'Choose an .apk file'}
                                        </span>
                                        {file && (
                                            <span className="text-xs text-muted-foreground">
                                                {(file.size / 1024 / 1024).toFixed(1)} MB
                                            </span>
                                        )}
                                    </button>
                                    <input
                                        ref={fileRef}
                                        type="file"
                                        accept=".apk"
                                        hidden
                                        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                                    />
                                </div>

                                <div className="grid gap-4 sm:grid-cols-2">
                                    <div className="space-y-2">
                                        <Label htmlFor="vname">Version name</Label>
                                        <Input
                                            id="vname"
                                            value={versionName}
                                            onChange={(e) => setVersionName(e.target.value)}
                                            placeholder="1.0.1"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="vcode">Version code</Label>
                                        <Input
                                            id="vcode"
                                            type="number"
                                            min="1"
                                            value={versionCode}
                                            onChange={(e) => setVersionCode(e.target.value)}
                                            placeholder="2"
                                            className="tabular"
                                        />
                                        <p className="text-xs text-muted-foreground">
                                            Must be higher than the current build for phones to see it.
                                        </p>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="changelog">What's new</Label>
                                    <Textarea
                                        id="changelog"
                                        value={changelog}
                                        onChange={(e) => setChangelog(e.target.value)}
                                        placeholder="• Faster reports&#10;• Fixed the calendar on small screens"
                                        rows={3}
                                    />
                                </div>

                                <div className="flex items-center justify-between rounded-xl border p-3.5">
                                    <div>
                                        <p className="text-sm font-medium">Mandatory update</p>
                                        <p className="text-xs text-muted-foreground">
                                            Users cannot use the app until they install it.
                                        </p>
                                    </div>
                                    <Switch checked={mandatory} onCheckedChange={setMandatory} />
                                </div>

                                {uploading && progress > 0 && (
                                    <div>
                                        <div className="h-2 overflow-hidden rounded-full bg-muted">
                                            <div
                                                className="h-full rounded-full bg-primary transition-all"
                                                style={{ width: `${progress}%` }}
                                            />
                                        </div>
                                        <p className="mt-1 text-center text-xs text-muted-foreground">
                                            Uploading… {progress}%
                                        </p>
                                    </div>
                                )}

                                <Button type="submit" loading={uploading} className="w-full">
                                    <Upload /> Publish release
                                </Button>
                            </form>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">Published versions</CardTitle>
                            <CardDescription>
                                {live
                                    ? `Phones are currently offered v${live.versionName} (build ${live.versionCode}).`
                                    : 'Nothing is live yet.'}
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-2">
                            {versionsQ.loading ? (
                                Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-20" />)
                            ) : !versions.length ? (
                                <p className="py-8 text-center text-sm text-muted-foreground">
                                    No releases published yet.
                                </p>
                            ) : (
                                versions.map((v) => (
                                    <div key={v.id} className="flex items-center gap-3 rounded-xl border p-3.5">
                                        <span
                                            className={cn(
                                                'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                                                v.isActive
                                                    ? 'bg-[hsl(var(--income))]/10 text-[hsl(var(--income))]'
                                                    : 'bg-muted text-muted-foreground'
                                            )}
                                        >
                                            {v.isActive ? <CheckCircle2 className="h-4 w-4" /> : <Power className="h-4 w-4" />}
                                        </span>

                                        <div className="min-w-0 flex-1">
                                            <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
                                                v{v.versionName}
                                                <span className="tabular text-xs text-muted-foreground">
                                                    build {v.versionCode}
                                                </span>
                                                {v.isActive && <Badge variant="income" className="text-[10px]">live</Badge>}
                                                {v.mandatory && <Badge variant="destructive" className="text-[10px]">mandatory</Badge>}
                                            </p>
                                            {v.changelog && (
                                                <p className="mt-0.5 line-clamp-2 whitespace-pre-line text-xs text-muted-foreground">
                                                    {v.changelog}
                                                </p>
                                            )}
                                            <p className="mt-0.5 text-[11px] text-muted-foreground">
                                                {formatDate(v.createdAt, 'full')}
                                            </p>
                                        </div>

                                        <div className="flex shrink-0 gap-0.5">
                                            {v.apkUrl && (
                                                <Button
                                                    variant="ghost" size="icon-sm" asChild
                                                    title="Download APK"
                                                >
                                                    <a href={resolveApkUrl(v.apkUrl)} download>
                                                        <Download className="h-4 w-4" />
                                                    </a>
                                                </Button>
                                            )}
                                            <Button
                                                variant="ghost" size="icon-sm"
                                                onClick={() => toggleActive(v)}
                                                title={v.isActive ? 'Deactivate' : 'Make live'}
                                            >
                                                <Power className="h-4 w-4" />
                                            </Button>
                                            <Button
                                                variant="ghost" size="icon-sm"
                                                onClick={() => removeVersion(v)}
                                                className="hover:text-destructive"
                                                title="Delete"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="maintenance">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">Maintenance mode</CardTitle>
                            <CardDescription>
                                Blocks the app and the web portal for regular users. Admins keep working, so you
                                can always turn it back off.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted p-1">
                                {(['immediate', 'scheduled'] as const).map((v) => (
                                    <button
                                        key={v}
                                        type="button"
                                        onClick={() => setMode(v)}
                                        className={cn(
                                            'rounded-md py-2 text-sm font-medium capitalize transition-colors',
                                            mode === v ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'
                                        )}
                                    >
                                        {v === 'immediate' ? 'Right now' : 'Scheduled'}
                                    </button>
                                ))}
                            </div>

                            {mode === 'scheduled' && (
                                <div className="grid gap-4 sm:grid-cols-2">
                                    <div className="space-y-2">
                                        <Label htmlFor="start">Starts</Label>
                                        <Input
                                            id="start" type="datetime-local"
                                            value={start} onChange={(e) => setStart(e.target.value)}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="end">Ends</Label>
                                        <Input
                                            id="end" type="datetime-local"
                                            value={end} onChange={(e) => setEnd(e.target.value)}
                                        />
                                    </div>
                                </div>
                            )}

                            <div className="space-y-2">
                                <Label htmlFor="mmessage">Message shown to users</Label>
                                <Textarea
                                    id="mmessage"
                                    value={message}
                                    onChange={(e) => setMessage(e.target.value)}
                                    placeholder="We are performing scheduled maintenance. Please check back shortly."
                                    rows={2}
                                />
                            </div>

                            <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5">
                                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-500" />
                                <p className="text-xs leading-relaxed">
                                    Turning this on immediately blocks every user — the running apps will show the
                                    maintenance screen without needing a restart.
                                </p>
                            </div>

                            <div className="flex gap-2">
                                <Button
                                    variant="destructive"
                                    className="flex-1"
                                    loading={savingMaintenance}
                                    onClick={() => setMaintenance(true)}
                                >
                                    <Wrench /> {mode === 'scheduled' ? 'Schedule maintenance' : 'Start maintenance now'}
                                </Button>
                                <Button
                                    variant="outline"
                                    className="flex-1"
                                    loading={savingMaintenance}
                                    disabled={!m?.active}
                                    onClick={() => setMaintenance(false)}
                                >
                                    End maintenance
                                </Button>
                            </div>

                            {m?.updatedAt && (
                                <p className="text-center text-xs text-muted-foreground">
                                    Last changed {formatDate(m.updatedAt, 'full')}
                                </p>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
}
