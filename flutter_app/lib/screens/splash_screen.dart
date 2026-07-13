import 'dart:async';

import 'package:flutter/material.dart';
import 'package:video_player/video_player.dart';

import '../theme/app_theme.dart';
import '../utils/constants.dart';

/// Plays the brand video, then hands off. The video is a nicety — if it fails to
/// decode on some device, we fall back to the logo rather than trapping the user
/// on a black screen.
class SplashScreen extends StatefulWidget {
  final VoidCallback onDone;

  const SplashScreen({super.key, required this.onDone});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen> with SingleTickerProviderStateMixin {
  VideoPlayerController? _video;
  late final AnimationController _fade;
  Timer? _failsafe;
  bool _finished = false;

  @override
  void initState() {
    super.initState();

    _fade = AnimationController(vsync: this, duration: const Duration(milliseconds: 700))
      ..forward();

    // Whatever happens to the video, the app moves on.
    _failsafe = Timer(const Duration(seconds: 5), _finish);

    _initVideo();
  }

  Future<void> _initVideo() async {
    try {
      final controller = VideoPlayerController.asset('assets/video/splash.mp4');
      await controller.initialize();
      if (!mounted) {
        await controller.dispose();
        return;
      }

      controller.setVolume(0);
      await controller.play();
      setState(() => _video = controller);

      controller.addListener(() {
        final v = controller.value;
        if (v.isInitialized && !v.isPlaying && v.position >= v.duration) {
          _finish();
        }
      });
    } catch (_) {
      // No video: show the logo for a beat and continue.
      Timer(const Duration(milliseconds: 1600), _finish);
    }
  }

  void _finish() {
    if (_finished || !mounted) return;
    _finished = true;
    widget.onDone();
  }

  @override
  void dispose() {
    _failsafe?.cancel();
    _video?.dispose();
    _fade.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final video = _video;

    return Scaffold(
      backgroundColor: Colors.white,
      body: Center(
        child: FadeTransition(
          opacity: _fade,
          child: video != null && video.value.isInitialized
              ? AspectRatio(
                  aspectRatio: video.value.aspectRatio,
                  child: VideoPlayer(video),
                )
              : Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Image.asset('assets/images/logo.png', width: 132, height: 132),
                    const SizedBox(height: 22),
                    const Text(
                      'SISIRBINDU',
                      style: TextStyle(
                        fontSize: 22,
                        fontWeight: FontWeight.w700,
                        letterSpacing: 3,
                        color: AppColors.inkLight,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'TRACKER APP',
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                        letterSpacing: 4,
                        color: AppColors.mutedLight.withValues(alpha: 0.9),
                      ),
                    ),
                    const SizedBox(height: 40),
                    const SizedBox(
                      width: 22,
                      height: 22,
                      child: CircularProgressIndicator(strokeWidth: 2.2),
                    ),
                  ],
                ),
        ),
      ),
    );
  }
}

/// Shown when the admin has taken the platform down.
class MaintenanceView extends StatelessWidget {
  const MaintenanceView({super.key, this.message});

  final String? message;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      body: Center(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 64,
                height: 64,
                decoration: BoxDecoration(
                  color: theme.colorScheme.primary.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Icon(Icons.build_rounded, color: theme.colorScheme.primary, size: 30),
              ),
              const SizedBox(height: 22),
              Text('Back shortly', style: theme.textTheme.titleLarge?.copyWith(
                fontWeight: FontWeight.w600,
              )),
              const SizedBox(height: 10),
              Text(
                message ?? 'We are performing scheduled maintenance on ${AppConstants.appShortName}.',
                textAlign: TextAlign.center,
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: theme.colorScheme.onSurface.withValues(alpha: 0.65),
                  height: 1.5,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
