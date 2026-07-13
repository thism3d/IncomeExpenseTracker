import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    FileAudio, FileText, FolderOpen, Image as ImageIcon, Paperclip,
    Search, Upload, X, Calendar, Tag
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';
import { useApi } from '@/hooks/useData';
import { api } from '@/lib/ws';
import { debounce, formatBytes, formatDate, formatMoney } from '@/lib/utils';
import {
    Button, Card, CardContent, Dialog, DialogContent, DialogHeader, DialogTitle,
    EmptyState, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Skeleton,
} from '@/components/ui';
import { FilePreviewActions, FilePreviewBody, FileThumbnail } from '@/components/FilePreview';
import type { Attachment } from '@/lib/types';

const KINDS = [
    { value: 'all', label: 'All files' },
    { value: 'IMAGE', label: 'Images' },
    { value: 'PDF', label: 'PDFs' },
    { value: 'DOC', label: 'Documents' },
    { value: 'AUDIO', label: 'Audio' },
];

const PREBUILT_TOPICS = [
    'Case Documents',
    'Tax Records',
    'Court Fees',
    'Chamber Rent',
    'Receipts & Bills',
    'Staff Salaries',
    'Other'
];

const KIND_ICON = { IMAGE: ImageIcon, PDF: FileText, DOC: FileText, AUDIO: FileAudio, OTHER: Paperclip } as const;

interface Stats {
    byKind: Record<string, { count: number; bytes: number }>;
    totalCount: number;
    totalBytes: number;
}

export default function Drive() {
    const { user } = useAuth();
    const currency = user?.currency || 'BDT';

    const [search, setSearch] = useState('');
    const [debounced, setDebounced] = useState('');
    const [kind, setKind] = useState('all');
    const [filterTopic, setFilterTopic] = useState('all');
    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');
    const [preview, setPreview] = useState<Attachment | null>(null);
    const [uploading, setUploading] = useState(false);
    const [dragging, setDragging] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);

    // Upload dialog states
    const [uploadModalOpen, setUploadModalOpen] = useState(false);
    const [selectedFiles, setSelectedFiles] = useState<FileList | null>(null);
    const [uploadTopic, setUploadTopic] = useState('Case Documents');
    const [customTopic, setCustomTopic] = useState('');
    const [uploadDate, setUploadDate] = useState(() => new Date().toISOString().split('T')[0]);

    // eslint-disable-next-line react-hooks/exhaustive-deps
    const push = useCallback(debounce((v: string) => setDebounced(v), 350), []);
    useEffect(() => { push(search); }, [search, push]);

    const params = useMemo(() => {
        const p: Record<string, any> = { limit: 100 };
        if (debounced.trim()) p.search = debounced.trim();
        if (kind !== 'all') p.kind = kind;
        if (filterTopic !== 'all') p.topic = filterTopic;
        if (from) p.from = new Date(from).toISOString();
        if (to) p.to = new Date(`${to}T23:59:59`).toISOString();
        return p;
    }, [debounced, kind, filterTopic, from, to]);

    const filesQ = useApi<{ files: Attachment[]; stats: Stats }>(
        '/files', params, [debounced, kind, filterTopic, from, to]
    );

    const handleUploadSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedFiles?.length) return;
        setUploading(true);
        try {
            const form = new FormData();
            Array.from(selectedFiles).forEach((f) => form.append('files', f));
            
            const finalTopic = uploadTopic === 'Other' ? customTopic.trim() : uploadTopic;
            if (finalTopic) {
                form.append('topic', finalTopic);
            }
            if (uploadDate) {
                form.append('createdAt', new Date(uploadDate).toISOString());
            }

            const res = await api.upload<{ attachments: Attachment[] }>('/files', form);
            toast.success(`${res.data.attachments.length} file(s) uploaded`);
            setUploadModalOpen(false);
            setSelectedFiles(null);
            setCustomTopic('');
            filesQ.reload();
        } catch (err: any) {
            toast.error(err.message || 'Upload failed');
        } finally {
            setUploading(false);
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            setSelectedFiles(e.target.files);
            setUploadModalOpen(true);
        }
    };

    const handleDragUpload = async (files: FileList | null) => {
        if (!files?.length) return;
        setUploading(true);
        try {
            const form = new FormData();
            Array.from(files).forEach((f) => form.append('files', f));
            form.append('topic', 'Case Documents');
            const res = await api.upload<{ attachments: Attachment[] }>('/files', form);
            toast.success(`${res.data.attachments.length} file(s) uploaded to Case Documents`);
            filesQ.reload();
        } catch (err: any) {
            toast.error(err.message || 'Upload failed');
        } finally {
            setUploading(false);
        }
    };

    const remove = async (file: Attachment) => {
        try {
            await api.delete(`/files/${file.id}`);
            toast.success('File deleted');
            setPreview(null);
            filesQ.reload();
        } catch (err: any) {
            toast.error(err.message || 'Could not delete');
        }
    };

    // Group by day, like Google Drive's "recent" view.
    const groups = useMemo(() => {
        const out: Array<{ date: string; files: Attachment[] }> = [];
        for (const f of filesQ.data?.files ?? []) {
            const day = new Date(f.createdAt).toDateString();
            const last = out[out.length - 1];
            if (last && last.date === day) last.files.push(f);
            else out.push({ date: day, files: [f] });
        }
        return out;
    }, [filesQ.data]);

    const stats = filesQ.data?.stats;

    return (
        <div
            className="mx-auto max-w-6xl space-y-5"
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); handleDragUpload(e.dataTransfer.files); }}
        >
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight">Drive</h1>
                    <p className="text-sm text-muted-foreground">
                        Every bill, receipt, document and voice note stored in your space.
                    </p>
                </div>
                <Button loading={uploading} onClick={() => fileRef.current?.click()}>
                    <Upload className="mr-2 h-4 w-4" /> Upload files
                </Button>
                <input
                    ref={fileRef}
                    type="file"
                    multiple
                    hidden
                    accept="image/*,application/pdf,.doc,.docx,.odt,.txt,audio/*"
                    onChange={handleFileChange}
                />
            </div>

            {/* Storage summary */}
            {stats && stats.totalCount > 0 && (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                    <Card>
                        <CardContent className="p-4">
                            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Total</p>
                            <p className="tabular mt-1 text-xl font-semibold">{stats.totalCount}</p>
                            <p className="text-xs text-muted-foreground">{formatBytes(stats.totalBytes)}</p>
                        </CardContent>
                    </Card>
                    {(['IMAGE', 'PDF', 'DOC', 'AUDIO'] as const).map((k) => {
                        const s = stats.byKind[k];
                        const Icon = KIND_ICON[k];
                        return (
                            <Card key={k}>
                                <CardContent className="flex items-center gap-3 p-4">
                                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                                        <Icon className="h-4 w-4" />
                                    </span>
                                    <div>
                                        <p className="tabular text-lg font-semibold">{s?.count ?? 0}</p>
                                        <p className="text-xs text-muted-foreground">
                                            {KINDS.find((x) => x.value === k)?.label}
                                        </p>
                                    </div>
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            )}

            {/* Filters */}
            <Card>
                <CardContent className="flex flex-wrap gap-2 p-4">
                    <div className="relative min-w-[200px] flex-1">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search by file name or note…"
                            className="pl-9"
                        />
                    </div>
                    <Select value={kind} onValueChange={setKind}>
                        <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            {KINDS.map((k) => (
                                <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Select value={filterTopic} onValueChange={setFilterTopic}>
                        <SelectTrigger className="w-[150px]"><SelectValue placeholder="All topics" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All topics</SelectItem>
                            {PREBUILT_TOPICS.map((t) => (
                                <SelectItem key={t} value={t}>{t}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-[140px]" aria-label="From" />
                    <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-[140px]" aria-label="To" />
                    {(from || to || kind !== 'all' || filterTopic !== 'all' || search) && (
                        <Button
                            variant="ghost"
                            onClick={() => { setSearch(''); setKind('all'); setFilterTopic('all'); setFrom(''); setTo(''); }}
                        >
                            <X className="h-4 w-4" /> Clear
                        </Button>
                    )}
                </CardContent>
            </Card>

            {filesQ.loading ? (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-40" />)}
                </div>
            ) : !filesQ.data?.files.length ? (
                <Card>
                    <EmptyState
                        icon={FolderOpen}
                        title={search || kind !== 'all' || filterTopic !== 'all' ? 'No files match' : 'Your drive is empty'}
                        description={
                            search || kind !== 'all' || filterTopic !== 'all'
                                ? 'Try a different search, topic or file type.'
                                : 'Upload files directly to topics or attach them to transactions.'
                        }
                        action={<Button size="sm" onClick={() => fileRef.current?.click()}>Upload files</Button>}
                    />
                </Card>
            ) : (
                <div className="space-y-5">
                    {groups.map((group) => (
                        <div key={group.date}>
                            <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                {formatDate(group.date, 'day')}
                            </p>
                            <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                                {group.files.map((f) => {
                                    const Icon = KIND_ICON[f.kind] || Paperclip;
                                    return (
                                        <Card key={f.id} className="group overflow-hidden transition-shadow hover:shadow-md">
                                            <button onClick={() => setPreview(f)} className="block w-full text-left">
                                                <div className="relative flex h-28 items-center justify-center bg-muted">
                                                    <FileThumbnail
                                                        file={f}
                                                        className="absolute inset-0 h-full w-full object-cover"
                                                    />
                                                    <Icon className="h-9 w-9 text-muted-foreground" />
                                                </div>
                                                <CardContent className="p-3">
                                                    <p className="truncate text-sm font-medium">{f.name}</p>
                                                    <p className="text-xs text-muted-foreground">{formatBytes(f.size)}</p>
                                                    {f.topic && (
                                                        <span className="inline-flex items-center gap-1 mt-1 px-1.5 py-0.5 text-[10px] font-semibold bg-primary/10 text-primary rounded-full">
                                                            <Tag className="h-2.5 w-2.5" />
                                                            {f.topic}
                                                        </span>
                                                    )}
                                                    {f.transaction && (
                                                        <p className="mt-1 truncate text-xs text-muted-foreground">
                                                            {f.transaction.categoryName || f.transaction.type} ·{' '}
                                                            <span className="tabular">
                                                                {formatMoney(f.transaction.amount, currency, { compact: true })}
                                                            </span>
                                                        </p>
                                                    )}
                                                </CardContent>
                                            </button>
                                        </Card>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Drag and Drop overlay */}
            {dragging && (
                <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-primary/10 backdrop-blur-sm">
                    <div className="rounded-2xl border-2 border-dashed border-primary bg-card px-10 py-8 text-center">
                        <Upload className="mx-auto mb-2 h-8 w-8 text-primary" />
                        <p className="font-medium">Drop to upload</p>
                    </div>
                </div>
            )}

            {/* Detailed Custom Upload Modal */}
            <Dialog open={uploadModalOpen} onOpenChange={setUploadModalOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Upload Settings</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleUploadSubmit} className="space-y-4">
                        <div className="p-3 bg-muted rounded-lg text-sm truncate flex items-center gap-2">
                            <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" />
                            <span>
                                {selectedFiles ? `${selectedFiles.length} file(s) selected` : 'No files selected'}
                            </span>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium flex items-center gap-1.5">
                                <Tag className="h-4 w-4 text-muted-foreground" /> Select Topic
                            </label>
                            <Select value={uploadTopic} onValueChange={setUploadTopic}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {PREBUILT_TOPICS.map((t) => (
                                        <SelectItem key={t} value={t}>{t}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {uploadTopic === 'Other' && (
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Custom Topic Name</label>
                                <Input
                                    value={customTopic}
                                    onChange={(e) => setCustomTopic(e.target.value)}
                                    placeholder="Enter topic name..."
                                    required
                                />
                            </div>
                        )}

                        <div className="space-y-2">
                            <label className="text-sm font-medium flex items-center gap-1.5">
                                <Calendar className="h-4 w-4 text-muted-foreground" /> Specific Date
                            </label>
                            <Input
                                type="date"
                                value={uploadDate}
                                onChange={(e) => setUploadDate(e.target.value)}
                                required
                            />
                        </div>

                        <div className="flex gap-2 justify-end pt-2">
                            <Button type="button" variant="ghost" onClick={() => setUploadModalOpen(false)}>
                                Cancel
                            </Button>
                            <Button type="submit" loading={uploading}>
                                Upload to Topic
                            </Button>
                        </div>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Preview Dialog */}
            <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
                <DialogContent className="max-w-3xl">
                    {preview && (
                        <>
                            <DialogHeader>
                                <DialogTitle className="truncate pr-8">{preview.name}</DialogTitle>
                                <p className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
                                    <span>{formatBytes(preview.size)}</span>
                                    <span>·</span>
                                    <span>{formatDate(preview.createdAt, 'full')}</span>
                                    {preview.topic && (
                                        <>
                                            <span>·</span>
                                            <span className="font-semibold text-primary">Topic: {preview.topic}</span>
                                        </>
                                    )}
                                    {preview.transaction && (
                                        <>
                                            <span>·</span>
                                            <span>{preview.transaction.categoryName || preview.transaction.type}</span>
                                        </>
                                    )}
                                </p>
                            </DialogHeader>

                            <div className="flex min-h-[280px] items-center justify-center rounded-xl bg-muted p-4">
                                <FilePreviewBody file={preview} />
                            </div>

                            <FilePreviewActions file={preview} onDelete={() => remove(preview)} />
                        </>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
