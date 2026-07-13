import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';

import '../models/models.dart';
import '../theme/app_theme.dart';
import '../utils/formatters.dart';

/// Charts.
///
/// The colour rules are the same ones the web app follows, and they are not
/// decorative:
///   income vs expense -> the diverging pair (polarity), never two arbitrary hues
///   categories        -> categorical slots, fixed order, never cycled
/// A 9th category folds into "Other" rather than reusing a hue.

class TrendChart extends StatelessWidget {
  const TrendChart({super.key, required this.points, this.height = 190});

  final List<TrendPoint> points;
  final double height;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final dark = theme.brightness == Brightness.dark;

    if (points.isEmpty) {
      return SizedBox(
        height: height,
        child: Center(
          child: Text('No activity yet',
              style: theme.textTheme.bodySmall?.copyWith(
                color: theme.colorScheme.onSurface.withValues(alpha: 0.5),
              )),
        ),
      );
    }

    final income = AppColors.income(dark);
    final expense = AppColors.expense(dark);
    final grid = theme.colorScheme.onSurface.withValues(alpha: 0.07);

    final maxY = points
        .expand((p) => [p.income, p.expense])
        .fold<double>(0, (m, v) => v > m ? v : m);

    List<FlSpot> spots(double Function(TrendPoint) pick) => [
          for (var i = 0; i < points.length; i++) FlSpot(i.toDouble(), pick(points[i])),
        ];

    LineChartBarData line(List<FlSpot> data, Color colour) => LineChartBarData(
          spots: data,
          isCurved: true,
          curveSmoothness: 0.28,
          color: colour,
          barWidth: 2,
          isStrokeCapRound: true,
          dotData: const FlDotData(show: false),
          belowBarData: BarAreaData(
            show: true,
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [colour.withValues(alpha: 0.22), colour.withValues(alpha: 0.01)],
            ),
          ),
        );

    return Column(
      children: [
        SizedBox(
          height: height,
          child: LineChart(
            LineChartData(
              minY: 0,
              maxY: maxY <= 0 ? 100 : maxY * 1.18,
              lineBarsData: [
                line(spots((p) => p.income), income),
                line(spots((p) => p.expense), expense),
              ],
              gridData: FlGridData(
                show: true,
                drawVerticalLine: false,
                horizontalInterval: maxY <= 0 ? 50 : maxY / 3,
                getDrawingHorizontalLine: (_) => FlLine(color: grid, strokeWidth: 1),
              ),
              borderData: FlBorderData(show: false),
              titlesData: FlTitlesData(
                topTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
                rightTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
                leftTitles: AxisTitles(
                  sideTitles: SideTitles(
                    showTitles: true,
                    reservedSize: 46,
                    interval: maxY <= 0 ? 50 : maxY / 2,
                    getTitlesWidget: (value, meta) => Text(
                      Fmt.money(value, compact: true).replaceAll('.00', ''),
                      style: theme.textTheme.labelSmall?.copyWith(
                        fontSize: 10,
                        color: theme.colorScheme.onSurface.withValues(alpha: 0.45),
                      ),
                    ),
                  ),
                ),
                bottomTitles: AxisTitles(
                  sideTitles: SideTitles(
                    showTitles: true,
                    reservedSize: 26,
                    // Only the ends, so the axis never collides with itself.
                    interval: (points.length - 1).clamp(1, 999).toDouble(),
                    getTitlesWidget: (value, meta) {
                      final i = value.round();
                      if (i < 0 || i >= points.length) return const SizedBox.shrink();
                      return Padding(
                        padding: const EdgeInsets.only(top: 6),
                        child: Text(
                          Fmt.monthShort(points[i].date),
                          style: theme.textTheme.labelSmall?.copyWith(
                            fontSize: 10,
                            color: theme.colorScheme.onSurface.withValues(alpha: 0.45),
                          ),
                        ),
                      );
                    },
                  ),
                ),
              ),
              lineTouchData: LineTouchData(
                touchTooltipData: LineTouchTooltipData(
                  getTooltipColor: (_) => dark
                      ? AppColors.surfaceDark
                      : AppColors.inkLight,
                  tooltipRoundedRadius: 10,
                  getTooltipItems: (spots) => spots.map((s) {
                    final isIncome = s.barIndex == 0;
                    return LineTooltipItem(
                      '${isIncome ? 'Income' : 'Expense'}  ${Fmt.money(s.y)}',
                      TextStyle(
                        color: isIncome ? income : expense,
                        fontWeight: FontWeight.w600,
                        fontSize: 12,
                      ),
                    );
                  }).toList(),
                ),
              ),
            ),
          ),
        ),
        const SizedBox(height: 10),
        // Two series, so a legend is mandatory — identity is never colour alone.
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            _LegendDot(colour: income, label: 'Income'),
            const SizedBox(width: 18),
            _LegendDot(colour: expense, label: 'Expense'),
          ],
        ),
      ],
    );
  }
}

class _LegendDot extends StatelessWidget {
  const _LegendDot({required this.colour, required this.label});

  final Color colour;
  final String label;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 8,
          height: 8,
          decoration: BoxDecoration(color: colour, shape: BoxShape.circle),
        ),
        const SizedBox(width: 6),
        Text(label,
            style: theme.textTheme.labelSmall?.copyWith(
              color: theme.colorScheme.onSurface.withValues(alpha: 0.6),
            )),
      ],
    );
  }
}

/// Category donut + the list beside it. The list is the relief channel: two of
/// the light-mode slots sit below 3:1 contrast, so the name and value are always
/// spelled out next to the swatch.
class CategoryDonut extends StatefulWidget {
  const CategoryDonut({super.key, required this.slices});

  final List<CategorySlice> slices;

  @override
  State<CategoryDonut> createState() => _CategoryDonutState();
}

class _CategoryDonutState extends State<CategoryDonut> {
  int _touched = -1;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final dark = theme.brightness == Brightness.dark;

    if (widget.slices.isEmpty) {
      return SizedBox(
        height: 160,
        child: Center(
          child: Text('No spending in this period',
              style: theme.textTheme.bodySmall?.copyWith(
                color: theme.colorScheme.onSurface.withValues(alpha: 0.5),
              )),
        ),
      );
    }

    // Eight slots exist and are never cycled — the rest fold into one "Other".
    final top = widget.slices.take(7).toList();
    final rest = widget.slices.skip(7).toList();
    final data = [
      ...top,
      if (rest.isNotEmpty)
        CategorySlice(
          name: 'Other (${rest.length})',
          total: rest.fold<double>(0, (s, r) => s + r.total),
          count: rest.fold<int>(0, (s, r) => s + r.count),
          percent: rest.fold<double>(0, (s, r) => s + r.percent),
        ),
    ];

    return Column(
      children: [
        SizedBox(
          height: 172,
          child: PieChart(
            PieChartData(
              sectionsSpace: 2,
              centerSpaceRadius: 46,
              startDegreeOffset: -90,
              pieTouchData: PieTouchData(
                touchCallback: (event, response) {
                  setState(() {
                    _touched = (!event.isInterestedForInteractions ||
                            response?.touchedSection == null)
                        ? -1
                        : response!.touchedSection!.touchedSectionIndex;
                  });
                },
              ),
              sections: [
                for (var i = 0; i < data.length; i++)
                  PieChartSectionData(
                    value: data[i].total,
                    color: AppColors.series(i, dark),
                    radius: _touched == i ? 30 : 25,
                    showTitle: false,
                    // A 2px surface ring, so adjacent fills never touch.
                    borderSide: BorderSide(
                      color: theme.colorScheme.surface,
                      width: 2,
                    ),
                  ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 14),
        for (var i = 0; i < data.length; i++)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 3),
            child: Row(
              children: [
                Container(
                  width: 9,
                  height: 9,
                  decoration: BoxDecoration(
                    color: AppColors.series(i, dark),
                    shape: BoxShape.circle,
                  ),
                ),
                const SizedBox(width: 9),
                Expanded(
                  child: Text(
                    data[i].name,
                    overflow: TextOverflow.ellipsis,
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: theme.colorScheme.onSurface.withValues(alpha: 0.75),
                    ),
                  ),
                ),
                Text(
                  Fmt.money(data[i].total, compact: true),
                  style: theme.textTheme.bodySmall?.copyWith(
                    fontWeight: FontWeight.w600,
                    fontFeatures: const [FontFeature.tabularFigures()],
                  ),
                ),
                const SizedBox(width: 8),
                SizedBox(
                  width: 34,
                  child: Text(
                    '${data[i].percent.round()}%',
                    textAlign: TextAlign.right,
                    style: theme.textTheme.labelSmall?.copyWith(
                      color: theme.colorScheme.onSurface.withValues(alpha: 0.5),
                    ),
                  ),
                ),
              ],
            ),
          ),
      ],
    );
  }
}

/// Income vs expense per payment method — a grouped bar, so it wears the
/// diverging pair too.
class PaymentMethodBars extends StatelessWidget {
  const PaymentMethodBars({super.key, required this.methods});

  final List<PaymentMethodStat> methods;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final dark = theme.brightness == Brightness.dark;

    if (methods.isEmpty) {
      return SizedBox(
        height: 140,
        child: Center(
          child: Text('No activity in this period',
              style: theme.textTheme.bodySmall?.copyWith(
                color: theme.colorScheme.onSurface.withValues(alpha: 0.5),
              )),
        ),
      );
    }

    final income = AppColors.income(dark);
    final expense = AppColors.expense(dark);
    final data = methods.take(5).toList();
    final maxY = data
        .expand((m) => [m.income, m.expense])
        .fold<double>(0, (m, v) => v > m ? v : m);

    return Column(
      children: [
        SizedBox(
          height: 176,
          child: BarChart(
            BarChartData(
              maxY: maxY <= 0 ? 100 : maxY * 1.2,
              alignment: BarChartAlignment.spaceAround,
              gridData: FlGridData(
                show: true,
                drawVerticalLine: false,
                horizontalInterval: maxY <= 0 ? 50 : maxY / 3,
                getDrawingHorizontalLine: (_) => FlLine(
                  color: theme.colorScheme.onSurface.withValues(alpha: 0.07),
                  strokeWidth: 1,
                ),
              ),
              borderData: FlBorderData(show: false),
              titlesData: FlTitlesData(
                topTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
                rightTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
                leftTitles: AxisTitles(
                  sideTitles: SideTitles(
                    showTitles: true,
                    reservedSize: 46,
                    interval: maxY <= 0 ? 50 : maxY / 2,
                    getTitlesWidget: (value, meta) => Text(
                      Fmt.money(value, compact: true).replaceAll('.00', ''),
                      style: theme.textTheme.labelSmall?.copyWith(
                        fontSize: 10,
                        color: theme.colorScheme.onSurface.withValues(alpha: 0.45),
                      ),
                    ),
                  ),
                ),
                bottomTitles: AxisTitles(
                  sideTitles: SideTitles(
                    showTitles: true,
                    reservedSize: 30,
                    getTitlesWidget: (value, meta) {
                      final i = value.round();
                      if (i < 0 || i >= data.length) return const SizedBox.shrink();
                      return Padding(
                        padding: const EdgeInsets.only(top: 6),
                        child: Text(
                          data[i].name,
                          overflow: TextOverflow.ellipsis,
                          style: theme.textTheme.labelSmall?.copyWith(
                            fontSize: 10,
                            color: theme.colorScheme.onSurface.withValues(alpha: 0.6),
                          ),
                        ),
                      );
                    },
                  ),
                ),
              ),
              barTouchData: BarTouchData(
                touchTooltipData: BarTouchTooltipData(
                  getTooltipColor: (_) =>
                      dark ? AppColors.surfaceDark : AppColors.inkLight,
                  tooltipRoundedRadius: 10,
                  getTooltipItem: (group, groupIndex, rod, rodIndex) => BarTooltipItem(
                    '${data[groupIndex].name}\n'
                    '${rodIndex == 0 ? 'Income' : 'Expense'} ${Fmt.money(rod.toY)}',
                    TextStyle(
                      color: rodIndex == 0 ? income : expense,
                      fontWeight: FontWeight.w600,
                      fontSize: 12,
                    ),
                  ),
                ),
              ),
              barGroups: [
                for (var i = 0; i < data.length; i++)
                  BarChartGroupData(
                    x: i,
                    // A 2px gap so adjacent bars never merge into one block.
                    barsSpace: 2,
                    barRods: [
                      BarChartRodData(
                        toY: data[i].income,
                        color: income,
                        width: 9,
                        borderRadius: const BorderRadius.vertical(top: Radius.circular(4)),
                      ),
                      BarChartRodData(
                        toY: data[i].expense,
                        color: expense,
                        width: 9,
                        borderRadius: const BorderRadius.vertical(top: Radius.circular(4)),
                      ),
                    ],
                  ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 10),
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            _LegendDot(colour: income, label: 'Income'),
            const SizedBox(width: 18),
            _LegendDot(colour: expense, label: 'Expense'),
          ],
        ),
      ],
    );
  }
}
