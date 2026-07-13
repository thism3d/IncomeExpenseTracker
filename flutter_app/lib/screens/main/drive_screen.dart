import 'dart:async';
import 'dart:io';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';

import '../../models/models.dart';
import '../../services/api_service.dart';
import '../../services/ws_client.dart' show ApiException;
import '../../utils/formatters.dart';
import '../../widgets/attachment_tile.dart';
import '../../widgets/common.dart';

const List<String> prebuiltTopics = [
  'Case Documents',
  'Tax Records',
  'Court Fees',
  'Chamber Rent',
  'Receipts & Bills',
  'Staff Salaries',
  'Other'
];

/// The Drive: every bill, receipt, document and voice note, grouped by day, with
/// filters — the README's "like Google Drive, date wise".
class DriveScreen extends StatefulWidget {
  const DriveScreen({super.key});

  @override
  State<DriveScreen> createState() => _DriveScreenState();
}

class _DriveScreenState extends State<DriveScreen> {
  final _search = TextEditingController();
  Timer? _debounce;

  List<Attachment> _files = [];
  AttachmentKind? _kind;
  String _selectedTopicFilter = 'All';
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _search.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final files = await ApiService.files(
        kind: _kind,
        search: _search.text.trim(),
        topic: _selectedTopicFilter,
      );
      if (!mounted) return;
      setState(() {
        _files = files;
        _loading = false;
      });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _onSearchChanged(String _) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 350), _load);
  }

  Future<void> _delete(Attachment file) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Delete this file?'),
        content: Text('“${file.name}” will be permanently removed.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(
                backgroundColor: Theme.of(dialogContext).colorScheme.error),
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;

    try {
      await ApiService.deleteFile(file.id);
      if (!mounted) return;
      setState(() => _files.remove(file));
      showSnack(context, 'File deleted');
    } on ApiException catch (e) {
      if (mounted) showSnack(context, e.message, error: true);
    }
  }

  Future<void> _showUploadSheet() async {
    final result = await FilePicker.platform.pickFiles(
      allowMultiple: false,
      type: FileType.any,
    );
    if (result == null || result.files.single.path == null) return;
    final file = File(result.files.single.path!);

    if (!mounted) return;

    String selectedTopic = 'Case Documents';
    final customTopicController = TextEditingController();
    DateTime selectedDate = DateTime.now();

    final uploaded = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (sheetContext) => StatefulBuilder(
        builder: (context, setSheetState) {
          final theme = Theme.of(context);
          return Padding(
            padding: EdgeInsets.only(
              bottom: MediaQuery.of(sheetContext).viewInsets.bottom + 20,
              left: 20,
              right: 20,
              top: 20,
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Upload to Drive',
                  style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 10),
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: const Icon(Icons.description_outlined),
                  title: Text(result.files.single.name),
                  subtitle: Text(Fmt.bytes(result.files.single.size)),
                ),
                const SizedBox(height: 15),
                DropdownButtonFormField<String>(
                  value: selectedTopic,
                  decoration: const InputDecoration(
                    labelText: 'Select Topic',
                    border: OutlineInputBorder(),
                    contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                  ),
                  items: prebuiltTopics.map((t) {
                    return DropdownMenuItem<String>(
                      value: t,
                      child: Text(t),
                    );
                  }).toList(),
                  onChanged: (val) {
                    if (val != null) {
                      setSheetState(() => selectedTopic = val);
                    }
                  },
                ),
                if (selectedTopic == 'Other') ...[
                  const SizedBox(height: 12),
                  TextField(
                    controller: customTopicController,
                    decoration: const InputDecoration(
                      labelText: 'Custom Topic Name',
                      border: OutlineInputBorder(),
                    ),
                  ),
                ],
                const SizedBox(height: 15),
                InkWell(
                  onTap: () async {
                    final date = await showDatePicker(
                      context: context,
                      initialDate: selectedDate,
                      firstDate: DateTime(2020),
                      lastDate: DateTime(2100),
                    );
                    if (date != null) {
                      setSheetState(() => selectedDate = date);
                    }
                  },
                  child: InputDecorator(
                    decoration: const InputDecoration(
                      labelText: 'Specific Date',
                      border: OutlineInputBorder(),
                      contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                    ),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(Fmt.date(selectedDate)),
                        const Icon(Icons.calendar_today_rounded, size: 18),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 25),
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton(
                        onPressed: () => Navigator.of(sheetContext).pop(false),
                        child: const Text('Cancel'),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: FilledButton(
                        onPressed: () async {
                          final finalTopic = selectedTopic == 'Other'
                              ? customTopicController.text.trim()
                              : selectedTopic;

                          if (finalTopic.isEmpty) {
                            showSnack(context, 'Please specify a topic name', error: true);
                            return;
                          }

                          Navigator.of(sheetContext).pop(true);

                          showDialog(
                            context: context,
                            barrierDismissible: false,
                            builder: (context) => const Center(
                              child: CircularProgressIndicator(),
                            ),
                          );

                          try {
                            await ApiService.uploadFiles(
                              [file],
                              topic: finalTopic,
                              createdAt: selectedDate,
                            );
                            if (context.mounted) {
                              Navigator.of(context).pop(); // Dismiss progress
                              showSnack(context, 'Uploaded successfully');
                              _load();
                            }
                          } catch (e) {
                            if (context.mounted) {
                              Navigator.of(context).pop(); // Dismiss progress
                              showSnack(context, e.toString(), error: true);
                            }
                          }
                        },
                        child: const Text('Upload'),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          );
        },
      ),
    );

    customTopicController.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    // Group by day, like a drive's "recent" view.
    final groups = <String, List<Attachment>>{};
    for (final f in _files) {
      groups.putIfAbsent(Fmt.relativeDay(f.createdAt), () => []).add(f);
    }

    final totalBytes = _files.fold<int>(0, (s, f) => s + f.size);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Drive'),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(0),
          child: _loading
              ? const LinearProgressIndicator(minHeight: 2)
              : const SizedBox.shrink(),
        ),
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _showUploadSheet,
        icon: const Icon(Icons.upload_file_rounded),
        label: const Text('Upload'),
      ),
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
              child: TextField(
                controller: _search,
                onChanged: _onSearchChanged,
                decoration: InputDecoration(
                  hintText: 'Search files and notes…',
                  prefixIcon: const Icon(Icons.search_rounded),
                  isDense: true,
                  suffixIcon: _search.text.isEmpty
                      ? null
                      : IconButton(
                          icon: const Icon(Icons.close_rounded, size: 18),
                          onPressed: () {
                            _search.clear();
                            _load();
                          },
                        ),
                ),
              ),
            ),

            SizedBox(
              height: 42,
              child: ListView(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 16),
                children: [
                  _kindChip(theme, 'All files', null),
                  _kindChip(theme, 'Images', AttachmentKind.image),
                  _kindChip(theme, 'PDFs', AttachmentKind.pdf),
                  _kindChip(theme, 'Documents', AttachmentKind.doc),
                  _kindChip(theme, 'Audio', AttachmentKind.audio),
                ],
              ),
            ),
            const SizedBox(height: 6),
            SizedBox(
              height: 38,
              child: ListView(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 16),
                children: [
                  _topicChip(theme, 'All topics', 'All'),
                  ...prebuiltTopics.map((t) => _topicChip(theme, t, t)),
                ],
              ),
            ),

            if (!_loading && _files.isNotEmpty)
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 6, 20, 2),
                child: Row(
                  children: [
                    Text(
                      '${_files.length} file${_files.length == 1 ? '' : 's'} · ${Fmt.bytes(totalBytes)}',
                      style: theme.textTheme.labelSmall?.copyWith(
                        color: theme.colorScheme.onSurface.withValues(alpha: 0.5),
                      ),
                    ),
                  ],
                ),
              ),

            Expanded(
              child: _loading && _files.isEmpty
                  ? const Center(child: CircularProgressIndicator())
                  : _files.isEmpty
                      ? EmptyState(
                          icon: Icons.folder_open_rounded,
                          title: _search.text.isEmpty && _kind == null && _selectedTopicFilter == 'All'
                              ? 'Your drive is empty'
                              : 'No files match',
                          message: _search.text.isEmpty && _kind == null && _selectedTopicFilter == 'All'
                              ? 'Upload files directly or attach them to transactions.'
                              : 'Try a different search, topic or file type.',
                        )
                      : RefreshIndicator(
                          onRefresh: _load,
                          child: ListView(
                            padding: const EdgeInsets.fromLTRB(16, 4, 16, 90),
                            children: [
                              for (final entry in groups.entries) ...[
                                Padding(
                                  padding: const EdgeInsets.fromLTRB(4, 12, 4, 2),
                                  child: Text(
                                    entry.key.toUpperCase(),
                                    style: theme.textTheme.labelSmall?.copyWith(
                                      letterSpacing: 0.8,
                                      fontWeight: FontWeight.w700,
                                      color: theme.colorScheme.onSurface
                                          .withValues(alpha: 0.45),
                                    ),
                                  ),
                                ),
                                for (final file in entry.value)
                                  _fileRow(theme, file),
                              ],
                            ],
                          ),
                        ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _fileRow(ThemeData theme, Attachment file) {
    final tx = file.transaction;

    return Padding(
      padding: const EdgeInsets.only(top: 8),
      child: Material(
        color: theme.colorScheme.surface,
        borderRadius: BorderRadius.circular(13),
        child: InkWell(
          borderRadius: BorderRadius.circular(13),
          onTap: () => openAttachment(context, file),
          onLongPress: () => _delete(file),
          child: Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              border: Border.all(color: theme.colorScheme.outline),
              borderRadius: BorderRadius.circular(13),
            ),
            child: Row(
              children: [
                if (file.kind == AttachmentKind.image)
                  ClipRRect(
                    borderRadius: BorderRadius.circular(10),
                    child: Image.network(
                      ApiService.fileUrl(file.id),
                      headers: ApiService.imageHeaders,
                      width: 48,
                      height: 48,
                      fit: BoxFit.cover,
                      errorBuilder: (_, __, ___) => CategoryAvatar(
                        icon: iconForKind(file.kind),
                        color: theme.colorScheme.primary,
                        size: 48,
                      ),
                    ),
                  )
                else
                  CategoryAvatar(
                    icon: iconForKind(file.kind),
                    color: theme.colorScheme.primary,
                    size: 48,
                  ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        file.name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: theme.textTheme.bodyMedium
                            ?.copyWith(fontWeight: FontWeight.w600),
                      ),
                      const SizedBox(height: 2),
                      if (file.topic != null && file.topic!.isNotEmpty) ...[
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                          decoration: BoxDecoration(
                            color: theme.colorScheme.primary.withValues(alpha: 0.1),
                            borderRadius: BorderRadius.circular(4),
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(Icons.local_offer_outlined, size: 10, color: theme.colorScheme.primary),
                              const SizedBox(width: 4),
                              Text(
                                file.topic!,
                                style: theme.textTheme.labelSmall?.copyWith(
                                  color: theme.colorScheme.primary,
                                  fontWeight: FontWeight.bold,
                                  fontSize: 10,
                                ),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(height: 2),
                      ],
                      Text(
                        [
                          file.kind.label,
                          Fmt.bytes(file.size),
                          if (tx != null)
                            '${tx.categoryName ?? tx.type.label} · ${Fmt.money(tx.amount, compact: true)}',
                        ].join(' · '),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: theme.colorScheme.onSurface.withValues(alpha: 0.55),
                        ),
                      ),
                    ],
                  ),
                ),
                Icon(Icons.chevron_right_rounded,
                    color: theme.colorScheme.onSurface.withValues(alpha: 0.3)),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _kindChip(ThemeData theme, String label, AttachmentKind? kind) {
    final selected = _kind == kind;
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: GestureDetector(
        onTap: () {
          setState(() => _kind = kind);
          _load();
        },
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
          decoration: BoxDecoration(
            color: selected
                ? theme.colorScheme.primary.withValues(alpha: 0.12)
                : null,
            border: Border.all(
              color: selected ? theme.colorScheme.primary : theme.colorScheme.outline,
            ),
            borderRadius: BorderRadius.circular(999),
          ),
          child: Text(
            label,
            style: theme.textTheme.labelMedium?.copyWith(
              fontWeight: FontWeight.w600,
              color: selected ? theme.colorScheme.primary : null,
            ),
          ),
        ),
      ),
    );
  }

  Widget _topicChip(ThemeData theme, String label, String topicValue) {
    final selected = _selectedTopicFilter == topicValue;
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: GestureDetector(
        onTap: () {
          setState(() => _selectedTopicFilter = topicValue);
          _load();
        },
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
          decoration: BoxDecoration(
            color: selected
                ? theme.colorScheme.secondary.withValues(alpha: 0.12)
                : null,
            border: Border.all(
              color: selected ? theme.colorScheme.secondary : theme.colorScheme.outline,
            ),
            borderRadius: BorderRadius.circular(999),
          ),
          child: Text(
            label,
            style: theme.textTheme.labelSmall?.copyWith(
              fontWeight: FontWeight.w600,
              color: selected ? theme.colorScheme.secondary : null,
            ),
          ),
        ),
      ),
    );
  }
}
