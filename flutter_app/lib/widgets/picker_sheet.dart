import 'package:flutter/material.dart';

import 'common.dart';

/// A searchable picker with an inline "create" row, so the user never has to
/// leave the form to add a category or payment method that's missing.
Future<T?> showPickerSheet<T>(
  BuildContext context, {
  required String title,
  required List<T> items,
  required String Function(T) labelOf,
  required String Function(T) idOf,
  required IconData Function(T) iconOf,
  String? Function(T)? subtitleOf,
  Color Function(T)? colourOf,
  String? selectedId,
  Future<T?> Function(String name)? onCreate,
}) {
  return showModalBottomSheet<T>(
    context: context,
    isScrollControlled: true,
    builder: (sheetContext) => _PickerSheet<T>(
      title: title,
      items: items,
      labelOf: labelOf,
      idOf: idOf,
      iconOf: iconOf,
      subtitleOf: subtitleOf,
      colourOf: colourOf,
      selectedId: selectedId,
      onCreate: onCreate,
    ),
  );
}

class _PickerSheet<T> extends StatefulWidget {
  const _PickerSheet({
    required this.title,
    required this.items,
    required this.labelOf,
    required this.idOf,
    required this.iconOf,
    this.subtitleOf,
    this.colourOf,
    this.selectedId,
    this.onCreate,
  });

  final String title;
  final List<T> items;
  final String Function(T) labelOf;
  final String Function(T) idOf;
  final IconData Function(T) iconOf;
  final String? Function(T)? subtitleOf;
  final Color Function(T)? colourOf;
  final String? selectedId;
  final Future<T?> Function(String name)? onCreate;

  @override
  State<_PickerSheet<T>> createState() => _PickerSheetState<T>();
}

class _PickerSheetState<T> extends State<_PickerSheet<T>> {
  final _search = TextEditingController();
  bool _creating = false;

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  Future<void> _create(String name) async {
    if (widget.onCreate == null) return;
    setState(() => _creating = true);
    final created = await widget.onCreate!(name.trim());
    if (!mounted) return;
    setState(() => _creating = false);
    if (created != null) Navigator.of(context).pop(created);
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final query = _search.text.trim().toLowerCase();

    final filtered = query.isEmpty
        ? widget.items
        : widget.items
            .where((i) => widget.labelOf(i).toLowerCase().contains(query))
            .toList();

    final exact = filtered
        .any((i) => widget.labelOf(i).toLowerCase() == query);
    final canCreate = widget.onCreate != null && query.isNotEmpty && !exact;

    return Padding(
      // Sit above the keyboard rather than behind it.
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: DraggableScrollableSheet(
        expand: false,
        initialChildSize: 0.7,
        maxChildSize: 0.92,
        minChildSize: 0.4,
        builder: (_, controller) => Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 4, 20, 10),
              child: Row(
                children: [
                  Text(widget.title,
                      style: theme.textTheme.titleMedium
                          ?.copyWith(fontWeight: FontWeight.w600)),
                  const Spacer(),
                  IconButton(
                    icon: const Icon(Icons.close_rounded),
                    onPressed: () => Navigator.of(context).pop(),
                  ),
                ],
              ),
            ),

            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
              child: TextField(
                controller: _search,
                autofocus: false,
                onChanged: (_) => setState(() {}),
                decoration: InputDecoration(
                  hintText: widget.onCreate == null
                      ? 'Search'
                      : 'Search or type to add…',
                  prefixIcon: const Icon(Icons.search_rounded),
                  isDense: true,
                ),
              ),
            ),

            Expanded(
              child: (filtered.isEmpty && !canCreate)
                  ? EmptyState(
                      icon: Icons.search_off_rounded,
                      title: 'Nothing found',
                      message: query.isEmpty
                          ? 'Nothing here yet'
                          : 'No match for “${_search.text.trim()}”',
                    )
                  : ListView(
                      controller: controller,
                      padding: const EdgeInsets.only(bottom: 20),
                      children: [
                        if (canCreate)
                          ListTile(
                            leading: _creating
                                ? const SizedBox(
                                    width: 22, height: 22,
                                    child: CircularProgressIndicator(strokeWidth: 2))
                                : Icon(Icons.add_circle_outline_rounded,
                                    color: theme.colorScheme.primary),
                            title: Text(
                              'Add “${_search.text.trim()}”',
                              style: TextStyle(
                                color: theme.colorScheme.primary,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                            onTap: _creating ? null : () => _create(_search.text),
                          ),
                        for (final item in filtered)
                          ListTile(
                            leading: CategoryAvatar(
                              icon: widget.iconOf(item),
                              color: widget.colourOf?.call(item) ??
                                  theme.colorScheme.primary,
                              size: 38,
                            ),
                            title: Text(widget.labelOf(item),
                                style: const TextStyle(fontWeight: FontWeight.w500)),
                            subtitle: widget.subtitleOf == null
                                ? null
                                : Text(widget.subtitleOf!(item) ?? ''),
                            trailing: widget.idOf(item) == widget.selectedId
                                ? Icon(Icons.check_rounded,
                                    color: theme.colorScheme.primary)
                                : null,
                            onTap: () => Navigator.of(context).pop(item),
                          ),
                      ],
                    ),
            ),
          ],
        ),
      ),
    );
  }
}
