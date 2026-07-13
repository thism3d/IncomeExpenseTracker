import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

/// The filled/empty dots above the keypad. Shows the minimum length as outlined
/// slots so the user knows how many digits are actually required.
class PinDots extends StatelessWidget {
  const PinDots({
    super.key,
    required this.length,
    required this.total,
    required this.minimum,
    this.error = false,
  });

  final int length;
  final int total;
  final int minimum;
  final bool error;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final active = error ? theme.colorScheme.error : theme.colorScheme.primary;

    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: List.generate(total, (i) {
        final filled = i < length;
        // Anything past the minimum is optional, so it reads as a fainter slot.
        final optional = i >= minimum;

        return AnimatedContainer(
          duration: const Duration(milliseconds: 140),
          margin: const EdgeInsets.symmetric(horizontal: 7),
          width: filled ? 14 : 12,
          height: filled ? 14 : 12,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: filled ? active : Colors.transparent,
            border: filled
                ? null
                : Border.all(
                    color: theme.colorScheme.onSurface
                        .withValues(alpha: optional ? 0.15 : 0.32),
                    width: 1.5,
                  ),
          ),
        );
      }),
    );
  }
}

/// A numeric keypad. Deliberately not the system keyboard: it keeps the layout
/// stable, gives big hit targets, and puts the biometric button where the thumb
/// already is.
class PinPad extends StatelessWidget {
  const PinPad({
    super.key,
    required this.onDigit,
    required this.onBackspace,
    this.onBiometric,
    this.biometricIcon,
    this.enabled = true,
  });

  final void Function(String digit) onDigit;
  final VoidCallback onBackspace;
  final VoidCallback? onBiometric;
  final IconData? biometricIcon;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    Widget key(Widget child, VoidCallback? onTap, {bool subtle = false}) {
      return Expanded(
        child: Padding(
          padding: const EdgeInsets.all(6),
          child: Material(
            color: subtle
                ? Colors.transparent
                : theme.colorScheme.onSurface.withValues(alpha: 0.04),
            borderRadius: BorderRadius.circular(18),
            child: InkWell(
              borderRadius: BorderRadius.circular(18),
              onTap: (enabled && onTap != null)
                  ? () {
                      HapticFeedback.lightImpact();
                      onTap();
                    }
                  : null,
              child: SizedBox(height: 62, child: Center(child: child)),
            ),
          ),
        ),
      );
    }

    Widget digit(String d) => key(
          Text(
            d,
            style: theme.textTheme.headlineSmall?.copyWith(
              fontWeight: FontWeight.w500,
              color: enabled
                  ? theme.colorScheme.onSurface
                  : theme.colorScheme.onSurface.withValues(alpha: 0.35),
            ),
          ),
          () => onDigit(d),
        );

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(children: [digit('1'), digit('2'), digit('3')]),
          Row(children: [digit('4'), digit('5'), digit('6')]),
          Row(children: [digit('7'), digit('8'), digit('9')]),
          Row(
            children: [
              // Only offered when the user actually enabled a biometric.
              onBiometric != null
                  ? key(
                      Icon(biometricIcon ?? Icons.fingerprint_rounded,
                          size: 28, color: theme.colorScheme.primary),
                      onBiometric,
                      subtle: true,
                    )
                  : key(const SizedBox.shrink(), null, subtle: true),
              digit('0'),
              key(
                Icon(Icons.backspace_outlined,
                    size: 22,
                    color: theme.colorScheme.onSurface.withValues(alpha: 0.7)),
                onBackspace,
                subtle: true,
              ),
            ],
          ),
        ],
      ),
    );
  }
}
