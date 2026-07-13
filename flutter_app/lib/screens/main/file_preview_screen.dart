import 'dart:io';

import 'package:flutter/material.dart';
import 'package:just_audio/just_audio.dart';
import 'package:open_filex/open_filex.dart';
import 'package:pdfrx/pdfrx.dart';
import 'package:share_plus/share_plus.dart';

import '../../models/models.dart';
import '../../services/api_service.dart';
import '../../utils/formatters.dart';
import '../../widgets/common.dart';

class FilePreviewScreen extends StatefulWidget {
  const FilePreviewScreen({super.key, required this.attachment});

  final Attachment attachment;

  @override
  State<FilePreviewScreen> createState() => _FilePreviewScreenState();
}

class _FilePreviewScreenState extends State<FilePreviewScreen> {
  File? _localFile;
  bool _loading = true;
  String? _error;

  // Audio player state if it is an audio file
  AudioPlayer? _audioPlayer;
  bool _audioPlaying = false;
  Duration _audioPosition = Duration.zero;
  Duration _audioDuration = Duration.zero;

  @override
  void initState() {
    super.initState();
    _download();
  }

  @override
  void dispose() {
    _audioPlayer?.dispose();
    super.dispose();
  }

  Future<void> _download() async {
    try {
      final file = await ApiService.downloadFile(widget.attachment);
      if (!mounted) return;

      setState(() {
        _localFile = file;
        _loading = false;
      });

      if (widget.attachment.kind == AttachmentKind.audio) {
        _initAudio(file);
      }
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  void _initAudio(File file) {
    _audioPlayer = AudioPlayer();
    _audioPlayer!.setFilePath(file.path).then((_) {
      if (!mounted) return;
      setState(() {
        _audioDuration = _audioPlayer!.duration ?? Duration.zero;
      });
    });

    _audioPlayer!.positionStream.listen((pos) {
      if (!mounted) return;
      setState(() {
        _audioPosition = pos;
      });
    });

    _audioPlayer!.playerStateStream.listen((state) {
      if (!mounted) return;
      setState(() {
        _audioPlaying = state.playing;
        if (state.processingState == ProcessingState.completed) {
          _audioPosition = Duration.zero;
          _audioPlayer!.seek(Duration.zero);
          _audioPlayer!.pause();
        }
      });
    });
  }

  Future<void> _share() async {
    if (_localFile == null) return;
    await Share.shareXFiles(
      [XFile(_localFile!.path)],
      text: widget.attachment.name,
    );
  }

  Future<void> _openExternal() async {
    if (_localFile == null) return;
    final result = await OpenFilex.open(_localFile!.path);
    if (!mounted) return;

    if (result.type != ResultType.done) {
      showSnack(
        context,
        result.type == ResultType.noAppToOpen
            ? 'No app on this phone can open this file type.'
            : 'Could not open file externally',
        error: true,
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      backgroundColor: widget.attachment.kind == AttachmentKind.image
          ? Colors.black
          : theme.colorScheme.surface,
      appBar: AppBar(
        title: Text(
          widget.attachment.name,
          style: TextStyle(
            color: widget.attachment.kind == AttachmentKind.image
                ? Colors.white
                : theme.colorScheme.onSurface,
          ),
        ),
        backgroundColor: widget.attachment.kind == AttachmentKind.image
            ? Colors.black
            : theme.colorScheme.surface,
        iconTheme: IconThemeData(
          color: widget.attachment.kind == AttachmentKind.image
              ? Colors.white
              : theme.colorScheme.onSurface,
        ),
        actions: [
          if (!_loading && _localFile != null) ...[
            IconButton(
              icon: const Icon(Icons.share_rounded),
              tooltip: 'Share file',
              onPressed: _share,
            ),
            IconButton(
              icon: const Icon(Icons.open_in_new_rounded),
              tooltip: 'Open in external app',
              onPressed: _openExternal,
            ),
          ]
        ],
      ),
      body: _buildBody(theme),
    );
  }

  Widget _buildBody(ThemeData theme) {
    if (_loading) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const CircularProgressIndicator(),
            const SizedBox(height: 16),
            Text(
              'Downloading file...',
              style: theme.textTheme.bodyMedium?.copyWith(
                color: widget.attachment.kind == AttachmentKind.image
                    ? Colors.white70
                    : theme.colorScheme.onSurface,
              ),
            ),
          ],
        ),
      );
    }

    if (_error != null || _localFile == null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(Icons.error_outline_rounded,
                  size: 48, color: theme.colorScheme.error),
              const SizedBox(height: 16),
              Text(
                'Could not load preview',
                style: theme.textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.bold,
                  color: widget.attachment.kind == AttachmentKind.image
                      ? Colors.white
                      : theme.colorScheme.onSurface,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                _error ?? 'File not found',
                textAlign: TextAlign.center,
                style: theme.textTheme.bodySmall?.copyWith(
                  color: widget.attachment.kind == AttachmentKind.image
                      ? Colors.white60
                      : theme.colorScheme.onSurface.withValues(alpha: 0.6),
                ),
              ),
              const SizedBox(height: 24),
              ElevatedButton(
                onPressed: () {
                  setState(() {
                    _loading = true;
                    _error = null;
                  });
                  _download();
                },
                child: const Text('Try Again'),
              ),
            ],
          ),
        ),
      );
    }

    return switch (widget.attachment.kind) {
      AttachmentKind.image => _buildImageViewer(),
      AttachmentKind.audio => _buildAudioPlayer(theme),
      AttachmentKind.pdf => _buildPdfViewer(theme),
      AttachmentKind.doc || AttachmentKind.other => _buildFallbackViewer(theme),
    };
  }

  Widget _buildImageViewer() {
    return SizedBox.expand(
      child: InteractiveViewer(
        maxScale: 4.0,
        child: Image.file(
          _localFile!,
          fit: BoxFit.contain,
        ),
      ),
    );
  }

  Widget _buildAudioPlayer(ThemeData theme) {
    String formatDuration(Duration d) {
      final min = d.inMinutes;
      final sec = d.inSeconds.remainder(60).toString().padLeft(2, '0');
      return '$min:$sec';
    }

    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 32),
        child: Card(
          elevation: 2,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  padding: const EdgeInsets.all(20),
                  decoration: BoxDecoration(
                    color: theme.colorScheme.primary.withValues(alpha: 0.1),
                    shape: BoxShape.circle,
                  ),
                  child: Icon(
                    Icons.audiotrack_rounded,
                    size: 64,
                    color: theme.colorScheme.primary,
                  ),
                ),
                const SizedBox(height: 24),
                Text(
                  widget.attachment.name,
                  textAlign: TextAlign.center,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: theme.textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  Fmt.bytes(widget.attachment.size),
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: theme.colorScheme.onSurface.withValues(alpha: 0.5),
                  ),
                ),
                const SizedBox(height: 24),
                // Slider
                Slider(
                  min: 0.0,
                  max: _audioDuration.inMilliseconds.toDouble(),
                  value: _audioPosition.inMilliseconds
                      .toDouble()
                      .clamp(0.0, _audioDuration.inMilliseconds.toDouble()),
                  onChanged: (val) {
                    _audioPlayer?.seek(Duration(milliseconds: val.toInt()));
                  },
                ),
                // Time labels
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 8),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        formatDuration(_audioPosition),
                        style: theme.textTheme.labelSmall,
                      ),
                      Text(
                        formatDuration(_audioDuration),
                        style: theme.textTheme.labelSmall,
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 24),
                // Play / Pause Buttons
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    IconButton(
                      icon: const Icon(Icons.replay_10_rounded),
                      iconSize: 32,
                      onPressed: () {
                        final newPos = _audioPosition - const Duration(seconds: 10);
                        _audioPlayer?.seek(newPos < Duration.zero ? Duration.zero : newPos);
                      },
                    ),
                    const SizedBox(width: 16),
                    CircleAvatar(
                      radius: 36,
                      backgroundColor: theme.colorScheme.primary,
                      child: IconButton(
                        icon: Icon(
                          _audioPlaying
                              ? Icons.pause_rounded
                              : Icons.play_arrow_rounded,
                        ),
                        iconSize: 40,
                        color: theme.colorScheme.onPrimary,
                        onPressed: () {
                          if (_audioPlaying) {
                            _audioPlayer?.pause();
                          } else {
                            _audioPlayer?.play();
                          }
                        },
                      ),
                    ),
                    const SizedBox(width: 16),
                    IconButton(
                      icon: const Icon(Icons.forward_10_rounded),
                      iconSize: 32,
                      onPressed: () {
                        final newPos = _audioPosition + const Duration(seconds: 10);
                        _audioPlayer?.seek(newPos > _audioDuration ? _audioDuration : newPos);
                      },
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildPdfViewer(ThemeData theme) {
    return PdfViewer.file(
      _localFile!.path,
      params: PdfViewerParams(
        margin: 8,
        backgroundColor: theme.colorScheme.surfaceContainerHighest,
      ),
    );
  }

  Widget _buildFallbackViewer(ThemeData theme) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              padding: const EdgeInsets.all(24),
              decoration: BoxDecoration(
                color: theme.colorScheme.primary.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(16),
              ),
              child: Icon(
                Icons.description_rounded,
                size: 64,
                color: theme.colorScheme.primary,
              ),
            ),
            const SizedBox(height: 24),
            Text(
              widget.attachment.name,
              textAlign: TextAlign.center,
              style: theme.textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              '${widget.attachment.kind.label} · ${Fmt.bytes(widget.attachment.size)}',
              style: theme.textTheme.bodyMedium?.copyWith(
                color: theme.colorScheme.onSurface.withValues(alpha: 0.6),
              ),
            ),
            const SizedBox(height: 32),
            FilledButton.icon(
              icon: const Icon(Icons.open_in_new_rounded),
              label: const Text('Open in External App'),
              onPressed: _openExternal,
            ),
          ],
        ),
      ),
    );
  }
}
