import { useEffect, useState } from 'react';
import { Megaphone, Send, Users } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/ws';
import { cn } from '@/lib/utils';
import {
    Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label,
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea,
} from '@/components/ui';

const SEGMENTS = [
    { value: 'active', label: 'Active users' },
    { value: 'suspended', label: 'Suspended users' },
    { value: 'verified', label: 'Verified users' },
    { value: 'inactive_30d', label: 'Inactive for 30+ days' },
    { value: 'admins', label: 'Admins only' },
];

export default function AdminBroadcast() {
    const [audience, setAudience] = useState<'all' | 'segment'>('all');
    const [segment, setSegment] = useState('active');
    const [title, setTitle] = useState('');
    const [message, setMessage] = useState('');
    const [count, setCount] = useState<number | null>(null);
    const [sending, setSending] = useState(false);

    // Live recipient count, so nobody sends to 4,000 people by accident.
    useEffect(() => {
        const params: Record<string, string> = { audience };
        if (audience === 'segment') params.segment = segment;

        api.get<{ count: number }>('/admin/broadcast/preview', params)
            .then((res) => setCount(res.data.count))
            .catch(() => setCount(null));
    }, [audience, segment]);

    const send = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!title.trim() || !message.trim()) {
            return toast.error('A title and a message are both required');
        }

        setSending(true);
        try {
            const res = await api.post<{ sent: number }>('/admin/broadcast', {
                audience,
                ...(audience === 'segment' ? { segment } : {}),
                title: title.trim(),
                message: message.trim(),
            });
            toast.success(`Sent to ${res.data.sent} user(s)`, {
                description: 'Anyone online sees it immediately.',
            });
            setTitle('');
            setMessage('');
        } catch (err: any) {
            toast.error(err.message || 'Could not send the broadcast');
        } finally {
            setSending(false);
        }
    };

    return (
        <div className="mx-auto max-w-3xl space-y-5">
            <div>
                <h1 className="text-2xl font-semibold tracking-tight">Broadcast</h1>
                <p className="text-sm text-muted-foreground">
                    Push a notification to your users. It appears instantly for anyone with the app open.
                </p>
            </div>

            <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Compose</CardTitle>
                        <CardDescription>Keep it short — it shows as a phone notification.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={send} className="space-y-4">
                            <div className="space-y-2">
                                <Label>Audience</Label>
                                <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted p-1">
                                    {(['all', 'segment'] as const).map((a) => (
                                        <button
                                            key={a}
                                            type="button"
                                            onClick={() => setAudience(a)}
                                            className={cn(
                                                'rounded-md py-2 text-sm font-medium transition-colors',
                                                audience === a ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'
                                            )}
                                        >
                                            {a === 'all' ? 'Everyone' : 'A segment'}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {audience === 'segment' && (
                                <div className="space-y-2">
                                    <Label>Segment</Label>
                                    <Select value={segment} onValueChange={setSegment}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            {SEGMENTS.map((s) => (
                                                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            )}

                            <div className="space-y-2">
                                <Label htmlFor="title">Title</Label>
                                <Input
                                    id="title"
                                    value={title}
                                    onChange={(e) => setTitle(e.target.value)}
                                    placeholder="Tax filing reminder"
                                    maxLength={160}
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="message">Message</Label>
                                <Textarea
                                    id="message"
                                    value={message}
                                    onChange={(e) => setMessage(e.target.value)}
                                    placeholder="Export your yearly statement before 30 November."
                                    rows={4}
                                    maxLength={2000}
                                />
                                <p className="text-right text-xs text-muted-foreground">{message.length}/2000</p>
                            </div>

                            <Button
                                type="submit"
                                loading={sending}
                                disabled={!title.trim() || !message.trim() || count === 0}
                                className="w-full"
                            >
                                <Send /> Send to {count ?? '…'} user{count === 1 ? '' : 's'}
                            </Button>
                        </form>
                    </CardContent>
                </Card>

                <div className="space-y-4">
                    <Card>
                        <CardContent className="p-5">
                            <div className="flex items-start justify-between">
                                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                    Recipients
                                </span>
                                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                                    <Users className="h-4 w-4" />
                                </span>
                            </div>
                            <p className="tabular mt-3 text-3xl font-semibold">{count ?? '—'}</p>
                            <p className="mt-1 text-xs text-muted-foreground">
                                {audience === 'all'
                                    ? 'Every registered user'
                                    : SEGMENTS.find((s) => s.value === segment)?.label}
                            </p>
                        </CardContent>
                    </Card>

                    {/* A live preview of what actually lands on the phone. */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-sm">Preview</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="rounded-xl border bg-muted/50 p-3.5">
                                <div className="flex items-start gap-2.5">
                                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary">
                                        <Megaphone className="h-4 w-4 text-primary-foreground" />
                                    </span>
                                    <div className="min-w-0">
                                        <p className="text-xs font-medium text-muted-foreground">SISIRBINDU TRACKERAPP</p>
                                        <p className="mt-0.5 break-words text-sm font-semibold">
                                            {title.trim() || 'Your title'}
                                        </p>
                                        <p className="mt-0.5 break-words text-xs leading-relaxed text-muted-foreground">
                                            {message.trim() || 'Your message will appear here.'}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
