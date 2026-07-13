import 'package:flutter/material.dart';
import 'package:just_audio/just_audio.dart';

import '../models/models.dart';
import '../screens/main/file_preview_screen.dart';
import '../services/api_service.dart';
import '../utils/formatters.dart';
import 'common.dart';

IconData iconForKind(AttachmentKind kind) => switch (kind) {
      AttachmentKind.image => Icons.image_rounded,
      AttachmentKind.pdf => Icons.picture_as_pdf_rounded,
      AttachmentKind.doc => Icons.description_rounded,
      AttachmentKind.audio => Icons.audiotrack_rounded,
      AttachmentKind.other => Icons.attach_file_rounded,
    };

/// One attached file in the transaction editor. Images get a thumbnail, audio
/// gets an inline player, everything else opens in the OS's own viewer.
class AttachmentTile extends StatelessWidget {
  const AttachmentTile({
    super.key,
    required this.attachment,
    this.onRemove,
  });

  final Attachment attachment;
  final VoidCallback? onRemove;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    if (attachment.kind == AttachmentKind.audio) {
      return _AudioAttachment(attachment: attachment, onRemove: onRemove);
    }

    return Padding(
      padding: const EdgeInsets.only(top: 8),
      child: Material(
        color: theme.colorScheme.onSurface.withValues(alpha: 0.03),
        borderRadius: BorderRadius.circular(12),
        child: InkWell(
          borderRadius: BorderRadius.circular(12),
          onTap: () => openAttachment(context, attachment),
          child: Padding(
            padding: const EdgeInsets.all(8),
            child: Row(
              children: [
                if (attachment.kind == AttachmentKind.image)
                  ClipRRect(
                    borderRadius: BorderRadius.circular(9),
                    child: Image.network(
                      ApiService.fileUrl(attachment.id),
                      // The file route is authenticated — a bare <img> would 401.
                      headers: ApiService.imageHeaders,
                      width: 44,
                      height: 44,
                      fit: BoxFit.cover,
                      errorBuilder: (_, __, ___) => CategoryAvatar(
                        icon: iconForKind(attachment.kind),
                        color: theme.colorScheme.primary,
                        size: 44,
                      ),
                    ),
                  )
                else
                  CategoryAvatar(
                    icon: iconForKind(attachment.kind),
                    color: theme.colorScheme.primary,
                    size: 44,
                  ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        attachment.name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: theme.textTheme.bodySmall
                            ?.copyWith(fontWeight: FontWeight.w600),
                      ),
                      Text(
                        '${attachment.kind.label} · ${Fmt.bytes(attachment.size)}',
                        style: theme.textTheme.labelSmall?.copyWith(
                          color: theme.colorScheme.onSurface.withValues(alpha: 0.5),
                        ),
                      ),
                    ],
                  ),
                ),
                if (onRemove != null)
                  IconButton(
                    icon: Icon(Icons.close_rounded,
                        size: 18,
                        color: theme.colorScheme.onSurface.withValues(alpha: 0.5)),
                    onPressed: onRemove,
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// An inline player. Audio is the one attachment type that's genuinely useful
/// without leaving the app — a lawyer's voice memo about a case.
class _AudioAttachment extends StatefulWidget {
  const _AudioAttachment({required this.attachment, this.onRemove});

  final Attachment attachment;
  final VoidCallback? onRemove;

  @override
  State<_AudioAttachment> createState() => _AudioAttachmentState();
}

class _AudioAttachmentState extends State<_AudioAttachment> {
  final _player = AudioPlayer();
  bool _loaded = false;

  @override
  void dispose() {
    _player.dispose();
    super.dispose();
  }

  Future<void> _toggle() async {
    try {
      if (!_loaded) {
        await _player.setUrl(
          ApiService.fileUrl(widget.attachment.id),
          headers: ApiService.imageHeaders,
        );
        _loaded = true;
      }
      if (_player.playing) {
        await _player.pause();
      } else {
        // Replay from the top once it has finished.
        if (_player.processingState == ProcessingState.completed) {
          await _player.seek(Duration.zero);
        }
        await _player.play();
      }
    } catch (_) {
      if (mounted) showSnack(context, 'Could not play this recording', error: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Padding(
      padding: const EdgeInsets.only(top: 8),
      child: Container(
        padding: const EdgeInsets.all(8),
        decoration: BoxDecoration(
          color: theme.colorScheme.onSurface.withValues(alpha: 0.03),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Row(
          children: [
            StreamBuilder<PlayerState>(
              stream: _player.playerStateStream,
              builder: (context, snapshot) {
                final playing = snapshot.data?.playing ?? false;
                final buffering =
                    snapshot.data?.processingState == ProcessingState.loading ||
                        snapshot.data?.processingState == ProcessingState.buffering;

                return IconButton(
                  onPressed: buffering ? null : _toggle,
                  icon: buffering
                      ? const SizedBox(
                          width: 20, height: 20,
                          child: CircularProgressIndicator(strokeWidth: 2))
                      : Icon(playing
                          ? Icons.pause_circle_filled_rounded
                          : Icons.play_circle_fill_rounded),
                  iconSize: 38,
                  color: theme.colorScheme.primary,
                  padding: EdgeInsets.zero,
                  constraints: const BoxConstraints(minWidth: 44, minHeight: 44),
                );
              },
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    widget.attachment.name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style:
                        theme.textTheme.bodySmall?.copyWith(fontWeight: FontWeight.w600),
                  ),
                  const SizedBox(height: 2),
                  StreamBuilder<Duration>(
                    stream: _player.positionStream,
                    builder: (context, snapshot) {
                      final position = snapshot.data ?? Duration.zero;
                      final total = _player.duration ??
                          Duration(milliseconds: widget.attachment.durationMs ?? 0);
                      final progress = total.inMilliseconds == 0
                          ? 0.0
                          : (position.inMilliseconds / total.inMilliseconds)
                              .clamp(0.0, 1.0);

                      return Row(
                        children: [
                          Expanded(
                            child: ClipRRect(
                              borderRadius: BorderRadius.circular(999),
                              child: LinearProgressIndicator(
                                value: progress,
                                minHeight: 3,
                                backgroundColor: theme.colorScheme.onSurface
                                    .withValues(alpha: 0.08),
                              ),
                            ),
                          ),
                          const SizedBox(width: 8),
                          Text(
                            Fmt.duration(total.inMilliseconds),
                            style: theme.textTheme.labelSmall?.copyWith(
                              color:
                                  theme.colorScheme.onSurface.withValues(alpha: 0.5),
                            ),
                          ),
                        ],
                      );
                    },
                  ),
                ],
              ),
            ),
            if (widget.onRemove != null)
              IconButton(
                icon: Icon(Icons.close_rounded,
                    size: 18,
                    color: theme.colorScheme.onSurface.withValues(alpha: 0.5)),
                onPressed: widget.onRemove,
              ),
          ],
        ),
      ),
    );
  }
}

/// Open the file preview screen.
Future<void> openAttachment(BuildContext context, Attachment attachment) async {
  Navigator.of(context).push(
    MaterialPageRoute(
      builder: (_) => FilePreviewScreen(attachment: attachment),
    ),
  );
}
