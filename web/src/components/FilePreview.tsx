import { AlertCircle, Download, FileText, Loader2, Music, Printer, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/ws';
import { useFileBlob } from '@/hooks/useFileBlob';
import { formatBytes, formatDate } from '@/lib/utils';
import { Button } from '@/components/ui';
import type { Attachment } from '@/lib/types';

/**
 * The preview body for one attachment.
 *
 * Everything here goes through a blob URL rather than the raw file route: the file
 * route needs a bearer token, and a browser will not attach one to `<img src>`,
 * `<iframe src>` or `<audio src>`. Pointing those straight at the API is what made
 * the Drive previews come back blank.
 */
export function FilePreviewBody({ file }: { file: Attachment }) {
    const { url, loading, error } = useFileBlob(file.id);

    if (loading) {
        return (
            <div className="flex min-h-[280px] items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (error || !url) {
        return (
            <div className="flex min-h-[280px] flex-col items-center justify-center gap-3 text-center">
                <AlertCircle className="h-8 w-8 text-destructive" />
                <p className="text-sm text-muted-foreground">{error || 'Could not load this file'}</p>
            </div>
        );
    }

    switch (file.kind) {
        case 'IMAGE':
            return (
                <img
                    src={url}
                    alt={file.name}
                    className="mx-auto max-h-[65vh] max-w-full rounded-lg object-contain"
                />
            );

        case 'PDF':
            return (
                <iframe
                    src={url}
                    title={file.name}
                    className="h-[65vh] w-full rounded-lg border-0 bg-white"
                />
            );

        case 'AUDIO':
            return (
                <div className="w-full space-y-4 py-10 text-center">
                    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
                        <Music className="h-8 w-8 text-primary" />
                    </div>
                    {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                    <audio controls src={url} className="w-full" autoPlay={false} />
                </div>
            );

        default:
            // Word/ODT have no browser-native viewer. Offering a download beats an
            // iframe that renders a blank page.
            return (
                <div className="space-y-4 py-12 text-center">
                    <FileText className="mx-auto h-10 w-10 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">
                        This document cannot be previewed in the browser.
                    </p>
                    <Button variant="outline" size="sm" asChild>
                        <a href={url} download={file.name}>
                            <Download className="h-4 w-4" /> Download to open
                        </a>
                    </Button>
                </div>
            );
    }
}

/** Download / print / delete for the previewed file. */
export function FilePreviewActions({
    file,
    onDelete,
}: {
    file: Attachment;
    onDelete?: () => void;
}) {
    const download = () =>
        api
            .download(`/files/${file.id}?download=1`, file.name)
            .catch((err) => toast.error(err.message || 'Download failed'));

    const print = () =>
        api
            .print(`/files/${file.id}`)
            .catch((err) => toast.error(err.message || 'Could not print'));

    // Only what the browser can actually put on paper.
    const printable = file.kind === 'PDF' || file.kind === 'IMAGE';

    return (
        <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
                {formatBytes(file.size)} · {formatDate(file.createdAt, 'full')}
            </p>

            <div className="flex gap-2">
                {onDelete && (
                    <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={onDelete}
                    >
                        <Trash2 className="h-4 w-4" /> Delete
                    </Button>
                )}
                {printable && (
                    <Button variant="outline" size="sm" onClick={print}>
                        <Printer className="h-4 w-4" /> Print
                    </Button>
                )}
                <Button variant="outline" size="sm" onClick={download}>
                    <Download className="h-4 w-4" /> Download
                </Button>
            </div>
        </div>
    );
}

/** The thumbnail in a Drive grid cell. Images only; everything else gets an icon. */
export function FileThumbnail({
    file,
    className,
}: {
    file: Attachment;
    className?: string;
}) {
    // Only fetch bytes for images — asking for a 40 MB PDF just to draw an icon
    // would be absurd.
    const { url } = useFileBlob(file.kind === 'IMAGE' ? file.id : null);

    if (file.kind === 'IMAGE' && url) {
        return <img src={url} alt="" loading="lazy" className={className} />;
    }
    return null;
}
