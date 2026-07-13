import 'package:intl/intl.dart';

import 'constants.dart';

class Fmt {
  Fmt._();

  static final _money = NumberFormat('#,##0.00', 'en_US');
  static final _compact = NumberFormat.compact(locale: 'en_US');

  /// `৳1,234.56`. `compact` gives `৳1.2K` for axis labels and stat tiles.
  static String money(num value, {bool compact = false, bool sign = false}) {
    final abs = value.abs();
    final body = compact && abs >= 1000 ? _compact.format(abs) : _money.format(abs);
    final prefix = value < 0 ? '-' : (sign && value > 0 ? '+' : '');
    return '$prefix${AppConstants.currencySymbol}$body';
  }

  static String signed(num value) => money(value, sign: true);

  static String date(DateTime d) => DateFormat('dd MMM yyyy').format(d);
  static String dateLong(DateTime d) => DateFormat('d MMMM yyyy').format(d);
  static String dayLabel(DateTime d) => DateFormat('EEE, d MMM').format(d);
  static String time(DateTime d) => DateFormat('h:mm a').format(d);
  static String dateTime(DateTime d) => DateFormat('dd MMM yyyy, h:mm a').format(d);
  static String monthYear(DateTime d) => DateFormat('MMMM yyyy').format(d);
  static String monthShort(DateTime d) => DateFormat('MMM yy').format(d);
  static String dayShort(DateTime d) => DateFormat('d MMM').format(d);

  /// "Today" / "Yesterday" beat a date for the rows a user looks at most.
  static String relativeDay(DateTime d) {
    final now = DateTime.now();
    final day = DateTime(d.year, d.month, d.day);
    final today = DateTime(now.year, now.month, now.day);
    final diff = today.difference(day).inDays;
    if (diff == 0) return 'Today';
    if (diff == 1) return 'Yesterday';
    if (diff > 1 && diff < 7) return DateFormat('EEEE').format(d);
    return dayLabel(d);
  }

  static String relativeTime(DateTime d) {
    final diff = DateTime.now().difference(d);
    if (diff.inMinutes < 1) return 'just now';
    if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
    if (diff.inHours < 24) return '${diff.inHours}h ago';
    if (diff.inDays < 7) return '${diff.inDays}d ago';
    return date(d);
  }

  static String bytes(int b) {
    if (b <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    var i = 0;
    var value = b.toDouble();
    while (value >= 1024 && i < units.length - 1) {
      value /= 1024;
      i++;
    }
    return '${value.toStringAsFixed(i == 0 ? 0 : 1)} ${units[i]}';
  }

  static String duration(int? ms) {
    if (ms == null || ms <= 0) return '';
    final s = (ms / 1000).round();
    return '${s ~/ 60}:${(s % 60).toString().padLeft(2, '0')}';
  }

  /// Stored canonical (8801XXXXXXXXX) -> readable (01XXX-XXXXXX).
  static String phone(String? raw) {
    if (raw == null || raw.isEmpty) return '';
    final digits = raw.replaceAll(RegExp(r'\D'), '');
    if (digits.startsWith('880') && digits.length == 13) {
      final n = digits.substring(3);
      return '0${n.substring(0, 4)}-${n.substring(4)}';
    }
    return raw;
  }

  static String initials(String name) {
    final parts = name.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
    if (parts.isEmpty) return '?';
    if (parts.length == 1) return parts.first.substring(0, 1).toUpperCase();
    return (parts.first.substring(0, 1) + parts.last.substring(0, 1)).toUpperCase();
  }
}
