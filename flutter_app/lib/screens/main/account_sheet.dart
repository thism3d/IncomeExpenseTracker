import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../models/models.dart';
import '../../providers/data_provider.dart';
import '../../services/api_service.dart';
import '../../utils/formatters.dart';
import '../../widgets/common.dart';

/// Manage accounts: add, rename, set default, delete. The README's "add separate
/// Account, Search Option, edit option".
Future<void> showAccountSheet(BuildContext context, {Account? edit}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    builder: (_) => _AccountSheet(edit: edit),
  );
}

class _AccountSheet extends StatefulWidget {
  const _AccountSheet({this.edit});

  final Account? edit;

  @override
  State<_AccountSheet> createState() => _AccountSheetState();
}

class _AccountSheetState extends State<_AccountSheet> {
  final _name = TextEditingController();
  final _opening = TextEditingController(text: '0');
  bool _saving = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    if (widget.edit != null) {
      _name.text = widget.edit!.name;
      _opening.text = widget.edit!.openingBalance.toStringAsFixed(2);
    }
  }

  @override
  void dispose() {
    _name.dispose();
    _opening.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final data = context.read<DataProvider>();
    if (_name.text.trim().isEmpty) {
      return setState(() => _error = 'Give the account a name');
    }

    setState(() {
      _saving = true;
      _error = null;
    });

    final ok = widget.edit == null
        ? await data.addAccount(
            _name.text.trim(), double.tryParse(_opening.text.trim()) ?? 0)
        : await data.renameAccount(widget.edit!.id, _name.text.trim());

    if (!mounted) return;
    setState(() => _saving = false);

    if (ok) {
      Navigator.of(context).pop();
      showSnack(context, widget.edit == null ? 'Account added' : 'Account updated');
    } else {
      setState(() => _error = data.error ?? 'Could not save the account');
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 4, 20, 20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                widget.edit == null ? 'New account' : 'Rename account',
                style: theme.textTheme.titleMedium
                    ?.copyWith(fontWeight: FontWeight.w600),
              ),
              const SizedBox(height: 6),
              Text(
                widget.edit == null
                    ? 'Separate your personal, chamber, or client money.'
                    : 'Change the name or correct the opening balance.',
                style: theme.textTheme.bodySmall?.copyWith(
                  color: theme.colorScheme.onSurface.withValues(alpha: 0.6),
                ),
              ),
              const SizedBox(height: 18),

              TextField(
                controller: _name,
                autofocus: true,
                textCapitalization: TextCapitalization.words,
                decoration: const InputDecoration(
                  labelText: 'Account name',
                  hintText: 'Chamber Account',
                ),
              ),
              const SizedBox(height: 12),

              TextField(
                controller: _opening,
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                enabled: widget.edit == null,
                decoration: InputDecoration(
                  labelText: 'Opening balance',
                  helperText: widget.edit == null
                      ? 'What was already in this account before you started tracking'
                      : null,
                  helperMaxLines: 2,
                ),
              ),
              const SizedBox(height: 16),

              ErrorBanner(_error),

              ElevatedButton(
                onPressed: _saving ? null : _save,
                child: _saving
                    ? const SizedBox(
                        width: 22, height: 22,
                        child: CircularProgressIndicator(
                            strokeWidth: 2.2, color: Colors.white))
                    : Text(widget.edit == null ? 'Add account' : 'Save'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// The list of accounts, with edit/default/delete on each.
class AccountsScreen extends StatelessWidget {
  const AccountsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final data = context.watch<DataProvider>();

    return Scaffold(
      appBar: AppBar(
        title: const Text('Accounts'),
        actions: [
          IconButton(
            icon: const Icon(Icons.add_rounded),
            onPressed: () => showAccountSheet(context),
          ),
        ],
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            for (final a in data.accounts)
              Card(
                margin: const EdgeInsets.only(bottom: 10),
                child: ListTile(
                  leading: CategoryAvatar(
                    icon: Icons.account_balance_wallet_rounded,
                    color: theme.colorScheme.primary,
                  ),
                  title: Row(
                    children: [
                      Flexible(
                        child: Text(a.name,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(fontWeight: FontWeight.w600)),
                      ),
                      if (a.isDefault) ...[
                        const SizedBox(width: 6),
                        const Icon(Icons.star_rounded, size: 15, color: Colors.amber),
                      ],
                    ],
                  ),
                  subtitle: Text(
                    '${Fmt.money(a.balance)} · ${a.transactionCount} transaction${a.transactionCount == 1 ? '' : 's'}',
                  ),
                  trailing: PopupMenuButton<String>(
                    itemBuilder: (_) => [
                      const PopupMenuItem(value: 'rename', child: Text('Rename')),
                      if (!a.isDefault)
                        const PopupMenuItem(
                            value: 'default', child: Text('Set as default')),
                      const PopupMenuItem(value: 'delete', child: Text('Delete')),
                    ],
                    onSelected: (action) async {
                      switch (action) {
                        case 'rename':
                          await showAccountSheet(context, edit: a);
                        case 'default':
                          await ApiService.setDefaultAccount(a.id);
                          await data.refresh(silent: true);
                          if (!context.mounted) return;
                          showSnack(context, '${a.name} is now your default account');
                        case 'delete':
                          final ok = await data.removeAccount(a.id);
                          if (!context.mounted) return;
                          // A populated account can't be deleted — the API says why.
                          showSnack(
                            context,
                            ok ? 'Account deleted' : (data.error ?? 'Could not delete'),
                            error: !ok,
                          );
                      }
                    },
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

