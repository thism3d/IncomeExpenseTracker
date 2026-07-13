import 'dart:io';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';

import '../../models/models.dart';
import '../../providers/data_provider.dart';
import '../../services/api_service.dart';
import '../../services/ws_client.dart' show ApiException;
import '../../theme/app_theme.dart';
import '../../utils/category_icons.dart';
import '../../utils/formatters.dart';
import '../../widgets/attachment_tile.dart';
import '../../widgets/common.dart';
import '../../widgets/picker_sheet.dart';
import '../../widgets/voice_recorder.dart';

/// Add / edit a transaction. Everything the README asks for lives here: the
/// amount, a searchable category and payment method (with inline create), notes,
/// the Add Items grid, the Add Bills attachments (camera, gallery, documents,
/// voice), date/time, and recurrence with a reminder.
class TransactionEditor extends StatefulWidget {
  const TransactionEditor({
    super.key,
    this.existing,
    this.initialType = TxType.expense,
    this.initialDate,
  });

  final Transaction? existing;
  final TxType initialType;
  final DateTime? initialDate;

  @override
  State<TransactionEditor> createState() => _TransactionEditorState();
}

class _TransactionEditorState extends State<TransactionEditor> {
  late TxType _type;
  String? _accountId;
  String? _toAccountId;
  String? _categoryId;
  String? _paymentMethodId;

  final _amount = TextEditingController();
  final _note = TextEditingController();

  late DateTime _occurredAt;
  String _recurrence = 'NONE';
  DateTime? _reminderAt;

  final List<_ItemRow> _items = [];
  final List<Attachment> _attachments = [];

  bool _saving = false;
  bool _uploading = false;
  String? _error;

  bool get _isEditing => widget.existing != null;

  @override
  void initState() {
    super.initState();

    final tx = widget.existing;
    _type = tx?.type ?? widget.initialType;
    _occurredAt = tx?.occurredAt ?? widget.initialDate ?? DateTime.now();

    if (tx != null) {
      _accountId = tx.accountId;
      _toAccountId = tx.toAccountId;
      _categoryId = tx.categoryId;
      _paymentMethodId = tx.paymentMethodId;
      _amount.text = tx.amount.toStringAsFixed(2);
      _note.text = tx.note ?? '';
      _recurrence = tx.recurrence;
      _reminderAt = tx.reminderAt;
      // Items and attachments only come back on the detail route.
      _hydrate(tx.id);
    } else {
      WidgetsBinding.instance.addPostFrameCallback((_) => _applyDefaults());
    }
  }

  void _applyDefaults() {
    final data = context.read<DataProvider>();
    setState(() {
      _accountId = data.selectedAccountId ??
          data.accounts.where((a) => a.isDefault).firstOrNull?.id ??
          data.accounts.firstOrNull?.id;
      _paymentMethodId ??=
          data.paymentMethods.where((p) => p.name == 'Cash').firstOrNull?.id;
    });
  }

  Future<void> _hydrate(String id) async {
    try {
      final full = await ApiService.transaction(id);
      if (!mounted) return;
      setState(() {
        _items
          ..clear()
          ..addAll(full.items.map(_ItemRow.from));
        _attachments
          ..clear()
          ..addAll(full.attachments);
      });
    } catch (_) {
      // The header is already on screen; items can stay empty.
    }
  }

  @override
  void dispose() {
    _amount.dispose();
    _note.dispose();
    for (final i in _items) {
      i.dispose();
    }
    super.dispose();
  }

  /// When the items grid has rows it is authoritative — the amount becomes the
  /// sum, so a bill and its total can never disagree.
  double get _itemsTotal =>
      _items.fold<double>(0, (s, i) => s + i.quantity * i.rate);

  void _syncAmountFromItems() {
    if (_items.isEmpty) return;
    _amount.text = _itemsTotal.toStringAsFixed(2);
  }

  // ------------------------------------------------------------ attachments

  Future<void> _addFiles(List<File> files, {int? durationMs}) async {
    if (files.isEmpty) return;
    setState(() => _uploading = true);
    try {
      final uploaded = await ApiService.uploadFiles(files, durationMs: durationMs);
      if (!mounted) return;
      setState(() => _attachments.addAll(uploaded));
    } on ApiException catch (e) {
      if (mounted) showSnack(context, e.message, error: true);
    } finally {
      if (mounted) setState(() => _uploading = false);
    }
  }

  Future<void> _pickImage(ImageSource source) async {
    final picker = ImagePicker();
    // Resize on capture: a 12MP phone photo is ~5MB and nothing here needs that.
    final shot = await picker.pickImage(
      source: source,
      imageQuality: 82,
      maxWidth: 2000,
    );
    if (shot == null) return;
    await _addFiles([File(shot.path)]);
  }

  Future<void> _pickDocuments() async {
    final result = await FilePicker.platform.pickFiles(
      allowMultiple: true,
      type: FileType.custom,
      allowedExtensions: const ['pdf', 'doc', 'docx', 'odt', 'txt'],
    );
    if (result == null) return;
    await _addFiles(
      result.paths.whereType<String>().map(File.new).toList(),
    );
  }

  Future<void> _pickAudioFile() async {
    final result = await FilePicker.platform.pickFiles(
      allowMultiple: true,
      type: FileType.audio,
    );
    if (result == null) return;
    await _addFiles(result.paths.whereType<String>().map(File.new).toList());
  }

  Future<void> _recordVoice() async {
    final recording = await showVoiceRecorder(context);
    if (recording == null) return;
    await _addFiles([recording.file], durationMs: recording.durationMs);
  }

  void _showAttachSheet() {
    showModalBottomSheet<void>(
      context: context,
      builder: (sheetContext) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const SizedBox(height: 4),
            for (final option in [
              (Icons.photo_camera_rounded, 'Take a photo', 'Capture a bill or receipt',
                  () => _pickImage(ImageSource.camera)),
              (Icons.photo_library_rounded, 'Choose a photo', 'From your gallery',
                  () => _pickImage(ImageSource.gallery)),
              (Icons.description_rounded, 'Document', 'PDF, DOC or DOCX', _pickDocuments),
              (Icons.mic_rounded, 'Record a voice note', 'Dictate a memo', _recordVoice),
              (Icons.audiotrack_rounded, 'Audio file', 'MP3, M4A, WAV and more',
                  _pickAudioFile),
            ])
              ListTile(
                leading: Icon(option.$1, color: Theme.of(sheetContext).colorScheme.primary),
                title: Text(option.$2,
                    style: const TextStyle(fontWeight: FontWeight.w600)),
                subtitle: Text(option.$3),
                onTap: () {
                  Navigator.of(sheetContext).pop();
                  option.$4();
                },
              ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
  }

  Future<void> _removeAttachment(Attachment a) async {
    setState(() => _attachments.remove(a));
    // While editing, only detach — the file stays in the Drive. On a new
    // transaction the upload is orphaned unless we clean it up.
    if (!_isEditing) {
      try {
        await ApiService.deleteFile(a.id);
      } catch (_) {/* an orphaned temp file is not worth an error toast */}
    }
  }

  // ------------------------------------------------------------------ save

  Future<void> _save() async {
    final data = context.read<DataProvider>();
    setState(() => _error = null);

    final amount = double.tryParse(_amount.text.trim()) ?? 0;
    if (_accountId == null) {
      return setState(() => _error = 'Choose an account');
    }
    if (amount <= 0) {
      return setState(() => _error = 'Enter an amount greater than zero');
    }
    if (_type == TxType.transfer) {
      if (_toAccountId == null) {
        return setState(() => _error = 'Choose the account to transfer into');
      }
      if (_toAccountId == _accountId) {
        return setState(() => _error = 'Pick two different accounts');
      }
    }

    setState(() => _saving = true);
    try {
      await ApiService.saveTransaction(
        id: widget.existing?.id,
        type: _type,
        accountId: _accountId!,
        toAccountId: _toAccountId,
        amount: amount,
        categoryId: _categoryId,
        paymentMethodId: _paymentMethodId,
        note: _note.text.trim(),
        occurredAt: _occurredAt,
        recurrence: _recurrence,
        reminderAt: _reminderAt,
        items: _items
            .where((i) => i.name.trim().isNotEmpty)
            .map((i) => i.toModel())
            .toList(),
        attachmentIds: _attachments.map((a) => a.id).toList(),
      );

      if (!mounted) return;
      data.refresh(silent: true);
      Navigator.of(context).pop(true);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _delete() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Delete this transaction?'),
        content: const Text(
            'The entry and its attached files will be removed. This cannot be undone.'),
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
    if (confirmed != true || !mounted) return;

    try {
      await ApiService.deleteTransaction(widget.existing!.id);
      if (!mounted) return;
      context.read<DataProvider>().refresh(silent: true);
      Navigator.of(context).pop(true);
    } on ApiException catch (e) {
      if (mounted) showSnack(context, e.message, error: true);
    }
  }

  // ------------------------------------------------------------------ build

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final dark = theme.brightness == Brightness.dark;
    final data = context.watch<DataProvider>();

    final categories = data.categoriesFor(
        _type == TxType.transfer ? TxType.expense : _type);
    final category = categories.where((c) => c.id == _categoryId).firstOrNull;
    final method =
        data.paymentMethods.where((p) => p.id == _paymentMethodId).firstOrNull;
    final account = data.accounts.where((a) => a.id == _accountId).firstOrNull;
    final toAccount = data.accounts.where((a) => a.id == _toAccountId).firstOrNull;

    final accent = _type == TxType.income
        ? AppColors.income(dark)
        : _type == TxType.expense
            ? AppColors.expense(dark)
            : theme.colorScheme.primary;

    return Scaffold(
      appBar: AppBar(
        title: Text(_isEditing ? 'Edit transaction' : 'Add transaction'),
        actions: [
          if (_isEditing)
            IconButton(
              icon: Icon(Icons.delete_outline_rounded, color: theme.colorScheme.error),
              onPressed: _saving ? null : _delete,
            ),
        ],
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
          children: [
            if (!_isEditing) ...[
              _typeSelector(theme, dark),
              const SizedBox(height: 20),
            ],

            // Amount — the hero field.
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
              decoration: BoxDecoration(
                color: accent.withValues(alpha: 0.07),
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: accent.withValues(alpha: 0.25)),
              ),
              child: Row(
                children: [
                  Text(Fmt.money(0).substring(0, 1),
                      style: theme.textTheme.headlineSmall
                          ?.copyWith(color: accent, fontWeight: FontWeight.w600)),
                  const SizedBox(width: 6),
                  Expanded(
                    child: TextField(
                      controller: _amount,
                      enabled: _items.isEmpty,
                      keyboardType:
                          const TextInputType.numberWithOptions(decimal: true),
                      style: theme.textTheme.headlineSmall?.copyWith(
                        fontWeight: FontWeight.w700,
                        color: accent,
                        fontFeatures: const [FontFeature.tabularFigures()],
                      ),
                      decoration: const InputDecoration(
                        hintText: '0.00',
                        border: InputBorder.none,
                        enabledBorder: InputBorder.none,
                        focusedBorder: InputBorder.none,
                        disabledBorder: InputBorder.none,
                        filled: false,
                        contentPadding: EdgeInsets.symmetric(vertical: 8),
                      ),
                    ),
                  ),
                ],
              ),
            ),
            if (_items.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 6, left: 4),
                child: Text(
                  'Calculated from ${_items.length} item${_items.length == 1 ? '' : 's'} below',
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: theme.colorScheme.onSurface.withValues(alpha: 0.5),
                  ),
                ),
              ),
            const SizedBox(height: 18),

            // Accounts
            _field(
              theme,
              label: _type == TxType.transfer ? 'From account' : 'Account',
              icon: Icons.account_balance_wallet_rounded,
              value: account?.name,
              placeholder: 'Choose an account',
              trailing: account == null ? null : Fmt.money(account.balance, compact: true),
              onTap: () async {
                final picked = await showPickerSheet<Account>(
                  context,
                  title: 'Account',
                  items: data.accounts,
                  labelOf: (a) => a.name,
                  subtitleOf: (a) => Fmt.money(a.balance),
                  iconOf: (a) => Icons.account_balance_wallet_rounded,
                  selectedId: _accountId,
                  idOf: (a) => a.id,
                );
                if (picked != null) setState(() => _accountId = picked.id);
              },
            ),

            if (_type == TxType.transfer)
              _field(
                theme,
                label: 'To account',
                icon: Icons.swap_horiz_rounded,
                value: toAccount?.name,
                placeholder: 'Choose the destination',
                onTap: () async {
                  final picked = await showPickerSheet<Account>(
                    context,
                    title: 'Transfer into',
                    items: data.accounts.where((a) => a.id != _accountId).toList(),
                    labelOf: (a) => a.name,
                    subtitleOf: (a) => Fmt.money(a.balance),
                    iconOf: (a) => Icons.account_balance_wallet_rounded,
                    selectedId: _toAccountId,
                    idOf: (a) => a.id,
                  );
                  if (picked != null) setState(() => _toAccountId = picked.id);
                },
              )
            else ...[
              _field(
                theme,
                label: 'Category',
                icon: iconFor(category?.icon),
                iconColour: AppColors.fromHex(category?.color, fallback: accent),
                value: category?.name,
                placeholder: 'Choose a category',
                onTap: () async {
                  final picked = await showPickerSheet<Category>(
                    context,
                    title: 'Category',
                    items: categories,
                    labelOf: (c) => c.name,
                    iconOf: (c) => iconFor(c.icon),
                    colourOf: (c) => AppColors.fromHex(c.color),
                    selectedId: _categoryId,
                    idOf: (c) => c.id,
                    // The user can add their own from inside the picker.
                    onCreate: (name) async {
                      final created = await context
                          .read<DataProvider>()
                          .addCategory(_type, name);
                      return created;
                    },
                  );
                  if (picked != null) setState(() => _categoryId = picked.id);
                },
              ),
              _field(
                theme,
                label: 'Payment method',
                icon: iconFor(method?.icon),
                iconColour: AppColors.fromHex(method?.color, fallback: accent),
                value: method?.name,
                placeholder: 'How was it paid?',
                onTap: () async {
                  final picked = await showPickerSheet<PaymentMethod>(
                    context,
                    title: 'Payment method',
                    items: data.paymentMethods,
                    labelOf: (p) => p.name,
                    iconOf: (p) => iconFor(p.icon),
                    colourOf: (p) => AppColors.fromHex(p.color),
                    selectedId: _paymentMethodId,
                    idOf: (p) => p.id,
                    onCreate: (name) =>
                        context.read<DataProvider>().addPaymentMethod(name),
                  );
                  if (picked != null) setState(() => _paymentMethodId = picked.id);
                },
              ),
            ],

            // When
            _field(
              theme,
              label: 'Date & time',
              icon: Icons.event_rounded,
              value: Fmt.dateTime(_occurredAt),
              onTap: _pickDateTime,
            ),

            _field(
              theme,
              label: 'Repeats',
              icon: Icons.repeat_rounded,
              value: switch (_recurrence) {
                'DAILY' => 'Every day',
                'WEEKLY' => 'Every week',
                'MONTHLY' => 'Every month',
                'YEARLY' => 'Every year',
                _ => 'Does not repeat',
              },
              onTap: _pickRecurrence,
            ),

            if (_recurrence != 'NONE')
              _field(
                theme,
                label: 'Reminder',
                icon: Icons.notifications_active_outlined,
                value: _reminderAt == null ? null : Fmt.dateTime(_reminderAt!),
                placeholder: 'Remind me (optional)',
                onTap: _pickReminder,
                onClear: _reminderAt == null
                    ? null
                    : () => setState(() => _reminderAt = null),
              ),

            const SizedBox(height: 8),
            _itemsSection(theme),
            const SizedBox(height: 8),
            _attachmentsSection(theme),
            const SizedBox(height: 16),

            TextField(
              controller: _note,
              maxLines: 3,
              textCapitalization: TextCapitalization.sentences,
              decoration: const InputDecoration(
                labelText: 'Note',
                hintText: 'What was this for?',
                alignLabelWithHint: true,
              ),
            ),
            const SizedBox(height: 20),

            ErrorBanner(_error),

            ElevatedButton(
              onPressed: _saving ? null : _save,
              child: _saving
                  ? const SizedBox(
                      width: 22, height: 22,
                      child: CircularProgressIndicator(
                          strokeWidth: 2.2, color: Colors.white))
                  : Text(_isEditing ? 'Save changes' : 'Save transaction'),
            ),
          ],
        ),
      ),
    );
  }

  Widget _typeSelector(ThemeData theme, bool dark) {
    final options = [
      (TxType.expense, 'Expense', AppColors.expense(dark)),
      (TxType.income, 'Income', AppColors.income(dark)),
      (TxType.transfer, 'Transfer', theme.colorScheme.primary),
    ];

    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: theme.colorScheme.onSurface.withValues(alpha: 0.05),
        borderRadius: BorderRadius.circular(13),
      ),
      child: Row(
        children: [
          for (final o in options)
            Expanded(
              child: GestureDetector(
                onTap: () => setState(() {
                  _type = o.$1;
                  // A category belongs to exactly one type — it can't survive a
                  // switch from income to expense.
                  _categoryId = null;
                  _error = null;
                }),
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 150),
                  padding: const EdgeInsets.symmetric(vertical: 11),
                  decoration: BoxDecoration(
                    color: _type == o.$1 ? o.$3 : null,
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Text(
                    o.$2,
                    textAlign: TextAlign.center,
                    style: theme.textTheme.bodyMedium?.copyWith(
                      fontWeight: FontWeight.w600,
                      color: _type == o.$1
                          ? Colors.white
                          : theme.colorScheme.onSurface.withValues(alpha: 0.6),
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _field(
    ThemeData theme, {
    required String label,
    required IconData icon,
    String? value,
    String? placeholder,
    String? trailing,
    Color? iconColour,
    VoidCallback? onTap,
    VoidCallback? onClear,
  }) {
    final colour = iconColour ?? theme.colorScheme.primary;
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Material(
        color: theme.colorScheme.surface,
        borderRadius: BorderRadius.circular(12),
        child: InkWell(
          borderRadius: BorderRadius.circular(12),
          onTap: onTap,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
            decoration: BoxDecoration(
              border: Border.all(color: theme.colorScheme.outline),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Row(
              children: [
                CategoryAvatar(icon: icon, color: colour, size: 36),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(label,
                          style: theme.textTheme.labelSmall?.copyWith(
                            color: theme.colorScheme.onSurface.withValues(alpha: 0.55),
                          )),
                      const SizedBox(height: 1),
                      Text(
                        value ?? placeholder ?? '—',
                        overflow: TextOverflow.ellipsis,
                        style: theme.textTheme.bodyMedium?.copyWith(
                          fontWeight: FontWeight.w600,
                          color: value == null
                              ? theme.colorScheme.onSurface.withValues(alpha: 0.4)
                              : null,
                        ),
                      ),
                    ],
                  ),
                ),
                if (trailing != null)
                  Text(trailing,
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: theme.colorScheme.onSurface.withValues(alpha: 0.5),
                      )),
                if (onClear != null)
                  IconButton(
                    icon: const Icon(Icons.close_rounded, size: 18),
                    onPressed: onClear,
                  )
                else
                  Icon(Icons.chevron_right_rounded,
                      color: theme.colorScheme.onSurface.withValues(alpha: 0.3)),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _itemsSection(ThemeData theme) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 10, 14, 14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text('Items',
                    style: theme.textTheme.titleSmall
                        ?.copyWith(fontWeight: FontWeight.w600)),
                TextButton.icon(
                  onPressed: () => setState(() => _items.add(_ItemRow.empty())),
                  icon: const Icon(Icons.add_rounded, size: 17),
                  label: const Text('Add item'),
                ),
              ],
            ),
            if (_items.isEmpty)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 6),
                child: Text(
                  'Break the bill into lines — item, quantity, unit and rate.',
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: theme.colorScheme.onSurface.withValues(alpha: 0.5),
                  ),
                ),
              )
            else ...[
              for (var i = 0; i < _items.length; i++) _itemRow(theme, i),
              const Divider(height: 20),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text('Total',
                      style: theme.textTheme.bodyMedium
                          ?.copyWith(fontWeight: FontWeight.w600)),
                  Text(
                    Fmt.money(_itemsTotal),
                    style: theme.textTheme.titleSmall?.copyWith(
                      fontWeight: FontWeight.w700,
                      fontFeatures: const [FontFeature.tabularFigures()],
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

  Widget _itemRow(ThemeData theme, int i) {
    final item = _items[i];
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Column(
        children: [
          Row(
            children: [
              Expanded(
                flex: 3,
                child: TextField(
                  controller: item.name_,
                  decoration: const InputDecoration(
                    hintText: 'Item',
                    isDense: true,
                    contentPadding: EdgeInsets.symmetric(horizontal: 10, vertical: 10),
                  ),
                ),
              ),
              IconButton(
                icon: Icon(Icons.close_rounded,
                    size: 18, color: theme.colorScheme.onSurface.withValues(alpha: 0.5)),
                onPressed: () {
                  setState(() {
                    _items.removeAt(i).dispose();
                    if (_items.isEmpty) _amount.clear();
                  });
                  _syncAmountFromItems();
                },
              ),
            ],
          ),
          const SizedBox(height: 6),
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: item.qty,
                  keyboardType: const TextInputType.numberWithOptions(decimal: true),
                  onChanged: (_) => setState(_syncAmountFromItems),
                  decoration: const InputDecoration(
                    labelText: 'Qty',
                    isDense: true,
                    contentPadding: EdgeInsets.symmetric(horizontal: 10, vertical: 10),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: TextField(
                  controller: item.unit,
                  decoration: const InputDecoration(
                    labelText: 'Unit',
                    hintText: 'pcs',
                    isDense: true,
                    contentPadding: EdgeInsets.symmetric(horizontal: 10, vertical: 10),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: TextField(
                  controller: item.rate_,
                  keyboardType: const TextInputType.numberWithOptions(decimal: true),
                  onChanged: (_) => setState(_syncAmountFromItems),
                  decoration: const InputDecoration(
                    labelText: 'Rate',
                    isDense: true,
                    contentPadding: EdgeInsets.symmetric(horizontal: 10, vertical: 10),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text('Total',
                        style: theme.textTheme.labelSmall?.copyWith(
                          color: theme.colorScheme.onSurface.withValues(alpha: 0.5),
                        )),
                    Text(
                      Fmt.money(item.quantity * item.rate, compact: true),
                      style: theme.textTheme.bodySmall
                          ?.copyWith(fontWeight: FontWeight.w600),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _attachmentsSection(ThemeData theme) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 10, 14, 14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text('Bills & attachments',
                    style: theme.textTheme.titleSmall
                        ?.copyWith(fontWeight: FontWeight.w600)),
                TextButton.icon(
                  onPressed: _uploading ? null : _showAttachSheet,
                  icon: _uploading
                      ? const SizedBox(
                          width: 14, height: 14,
                          child: CircularProgressIndicator(strokeWidth: 2))
                      : const Icon(Icons.attach_file_rounded, size: 17),
                  label: const Text('Attach'),
                ),
              ],
            ),
            if (_attachments.isEmpty)
              GestureDetector(
                onTap: _uploading ? null : _showAttachSheet,
                child: Container(
                  width: double.infinity,
                  padding: const EdgeInsets.symmetric(vertical: 22),
                  margin: const EdgeInsets.only(top: 4),
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(
                      color: theme.colorScheme.outline,
                      style: BorderStyle.solid,
                    ),
                  ),
                  child: Column(
                    children: [
                      Icon(Icons.attach_file_rounded,
                          color: theme.colorScheme.onSurface.withValues(alpha: 0.4)),
                      const SizedBox(height: 6),
                      Text(
                        'Photos, PDFs, documents or voice notes',
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: theme.colorScheme.onSurface.withValues(alpha: 0.5),
                        ),
                      ),
                    ],
                  ),
                ),
              )
            else
              for (final a in _attachments)
                AttachmentTile(
                  attachment: a,
                  onRemove: () => _removeAttachment(a),
                ),
          ],
        ),
      ),
    );
  }

  Future<void> _pickDateTime() async {
    final date = await showDatePicker(
      context: context,
      initialDate: _occurredAt,
      firstDate: DateTime(2015),
      lastDate: DateTime.now().add(const Duration(days: 365 * 5)),
    );
    if (date == null || !mounted) return;

    final time = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.fromDateTime(_occurredAt),
    );
    if (!mounted) return;

    setState(() {
      _occurredAt = DateTime(
        date.year,
        date.month,
        date.day,
        time?.hour ?? _occurredAt.hour,
        time?.minute ?? _occurredAt.minute,
      );
    });
  }

  Future<void> _pickRecurrence() async {
    const options = [
      ('NONE', 'Does not repeat'),
      ('DAILY', 'Every day'),
      ('WEEKLY', 'Every week'),
      ('MONTHLY', 'Every month'),
      ('YEARLY', 'Every year'),
    ];

    final picked = await showModalBottomSheet<String>(
      context: context,
      builder: (sheetContext) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const SizedBox(height: 4),
            for (final o in options)
              ListTile(
                title: Text(o.$2),
                trailing: _recurrence == o.$1
                    ? Icon(Icons.check_rounded,
                        color: Theme.of(sheetContext).colorScheme.primary)
                    : null,
                onTap: () => Navigator.of(sheetContext).pop(o.$1),
              ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );

    if (picked == null || !mounted) return;
    setState(() {
      _recurrence = picked;
      if (picked == 'NONE') _reminderAt = null;
    });
  }

  Future<void> _pickReminder() async {
    final date = await showDatePicker(
      context: context,
      initialDate: _reminderAt ?? DateTime.now().add(const Duration(days: 1)),
      firstDate: DateTime.now(),
      lastDate: DateTime.now().add(const Duration(days: 365 * 3)),
    );
    if (date == null || !mounted) return;

    final time = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.fromDateTime(
          _reminderAt ?? DateTime.now().add(const Duration(hours: 1))),
    );
    if (!mounted) return;

    setState(() {
      _reminderAt = DateTime(
        date.year, date.month, date.day,
        time?.hour ?? 9, time?.minute ?? 0,
      );
    });
  }
}

/// One editable line in the items grid. Holds its own controllers so typing a
/// quantity doesn't rebuild the whole form.
class _ItemRow {
  final TextEditingController name_;
  final TextEditingController qty;
  final TextEditingController unit;
  final TextEditingController rate_;

  _ItemRow(this.name_, this.qty, this.unit, this.rate_);

  factory _ItemRow.empty() => _ItemRow(
        TextEditingController(),
        TextEditingController(text: '1'),
        TextEditingController(),
        TextEditingController(text: '0'),
      );

  factory _ItemRow.from(TxItem item) => _ItemRow(
        TextEditingController(text: item.name),
        TextEditingController(text: _trim(item.quantity)),
        TextEditingController(text: item.unit ?? ''),
        TextEditingController(text: _trim(item.rate)),
      );

  static String _trim(double v) =>
      v == v.roundToDouble() ? v.toStringAsFixed(0) : v.toString();

  String get name => name_.text;
  double get quantity => double.tryParse(qty.text.trim()) ?? 0;
  double get rate => double.tryParse(rate_.text.trim()) ?? 0;

  TxItem toModel() => TxItem(
        name: name_.text.trim(),
        quantity: quantity == 0 ? 1 : quantity,
        unit: unit.text.trim().isEmpty ? null : unit.text.trim(),
        rate: rate,
      );

  void dispose() {
    name_.dispose();
    qty.dispose();
    unit.dispose();
    rate_.dispose();
  }
}
