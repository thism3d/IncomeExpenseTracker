import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:path_provider/path_provider.dart';
import 'package:record/record.dart';

class VoiceRecording {
  final File file;
  final int durationMs;
  const VoiceRecording(this.file, this.durationMs);
}

/// Record a voice note without leaving the transaction form. Returns null if the
/// user cancels or denies the microphone.
Future<VoiceRecording?> showVoiceRecorder(BuildContext context) {
  return showModalBottomSheet<VoiceRecording>(
    context: context,
    isDismissible: false,
    enableDrag: false,
    builder: (_) => const _VoiceRecorderSheet(),
  );
}

class _VoiceRecorderSheet extends StatefulWidget {
  const _VoiceRecorderSheet();

  @override
  State<_VoiceRecorderSheet> createState() => _VoiceRecorderSheetState();
}

class _VoiceRecorderSheetState extends State<_VoiceRecorderSheet> {
  final _recorder = AudioRecorder();
  Timer? _ticker;

  bool _recording = false;
  int _elapsedMs = 0;
  double _amplitude = 0;
  String? _error;
  String? _path;

  @override
  void initState() {
    super.initState();
    _start();
  }

  Future<void> _start() async {
    try {
      if (!await _recorder.hasPermission()) {
        setState(() => _error =
            'Microphone permission is required to record a voice note.');
        return;
      }

      final dir = await getTemporaryDirectory();
      final path =
          '${dir.path}/voice-${DateTime.now().millisecondsSinceEpoch}.m4a';

      await _recorder.start(
        const RecordConfig(encoder: AudioEncoder.aacLc, bitRate: 96000),
        path: path,
      );

      if (!mounted) return;
      setState(() {
        _path = path;
        _recording = true;
        _error = null;
      });

      _ticker = Timer.periodic(const Duration(milliseconds: 100), (_) async {
        if (!mounted) return;
        // A live level meter, so the user can see it's actually listening.
        final amp = await _recorder.getAmplitude();
        setState(() {
          _elapsedMs += 100;
          // dBFS: -160 (silence) .. 0 (peak).
          _amplitude = ((amp.current + 45) / 45).clamp(0.05, 1.0);
        });
      });
    } catch (e) {
      if (mounted) setState(() => _error = 'Could not start recording.');
    }
  }

  Future<void> _stop({required bool keep}) async {
    _ticker?.cancel();
    String? path;
    try {
      path = await _recorder.stop();
    } catch (_) {
      path = _path;
    }

    if (!mounted) return;

    if (!keep || path == null) {
      // Discard: don't leave the temp file behind.
      if (path != null) File(path).delete().ignore();
      Navigator.of(context).pop();
      return;
    }

    Navigator.of(context).pop(VoiceRecording(File(path), _elapsedMs));
  }

  @override
  void dispose() {
    _ticker?.cancel();
    _recorder.dispose();
    super.dispose();
  }

  String get _clock {
    final seconds = _elapsedMs ~/ 1000;
    return '${seconds ~/ 60}:${(seconds % 60).toString().padLeft(2, '0')}';
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(24, 8, 24, 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              _error != null
                  ? 'Cannot record'
                  : _recording
                      ? 'Recording…'
                      : 'Preparing…',
              style: theme.textTheme.titleMedium
                  ?.copyWith(fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 24),

            if (_error != null) ...[
              Text(
                _error!,
                textAlign: TextAlign.center,
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: theme.colorScheme.onSurface.withValues(alpha: 0.65),
                ),
              ),
              const SizedBox(height: 24),
              OutlinedButton(
                onPressed: () => Navigator.of(context).pop(),
                child: const Text('Close'),
              ),
            ] else ...[
              // The pulsing ring is the level meter.
              AnimatedContainer(
                duration: const Duration(milliseconds: 100),
                width: 92 + (_amplitude * 26),
                height: 92 + (_amplitude * 26),
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: theme.colorScheme.error.withValues(alpha: 0.12),
                ),
                child: Center(
                  child: Container(
                    width: 68,
                    height: 68,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: theme.colorScheme.error,
                    ),
                    child: const Icon(Icons.mic_rounded,
                        color: Colors.white, size: 30),
                  ),
                ),
              ),
              const SizedBox(height: 20),

              Text(
                _clock,
                style: theme.textTheme.headlineSmall?.copyWith(
                  fontWeight: FontWeight.w600,
                  fontFeatures: const [FontFeature.tabularFigures()],
                ),
              ),
              const SizedBox(height: 26),

              Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: () => _stop(keep: false),
                      child: const Text('Discard'),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: FilledButton.icon(
                      onPressed: _elapsedMs < 500 ? null : () => _stop(keep: true),
                      icon: const Icon(Icons.check_rounded, size: 18),
                      label: const Text('Attach'),
                    ),
                  ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }
}
