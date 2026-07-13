import 'dart:async';

// foundation exports a `Category` annotation that collides with our model.
import 'package:flutter/foundation.dart' hide Category;

import '../models/models.dart';
import '../services/api_service.dart';
import '../services/notification_service.dart';
import '../services/ws_client.dart';

/// The shared, slow-changing data every screen needs: accounts, categories,
/// payment methods, and the home summary. Loaded once and refreshed on any
/// server push, so the phone and the web portal never disagree.
class DataProvider extends ChangeNotifier {
  List<Account> accounts = [];
  List<Category> categories = [];
  List<PaymentMethod> paymentMethods = [];
  Overview overview = const Overview();
  int unreadNotifications = 0;

  /// null = "All accounts".
  String? selectedAccountId;

  bool loading = true;
  String? error;

  StreamSubscription<WsEvent>? _events;

  DataProvider() {
    _events = WsClient.instance.events.listen(_onEvent);
  }

  Account? get selectedAccount => selectedAccountId == null
      ? null
      : accounts.where((a) => a.id == selectedAccountId).firstOrNull;

  String get currency => 'BDT';

  List<Category> categoriesFor(TxType type) =>
      categories.where((c) => c.type == type).toList();

  void _onEvent(WsEvent e) {
    switch (e.name) {
      // Another device (or the web portal) changed the ledger.
      case 'transaction:created':
      case 'transaction:updated':
      case 'transaction:deleted':
        refresh(silent: true);

      case 'notification':
        unreadNotifications += 1;
        notifyListeners();
        NotificationService.instance.show(
          title: '${e.payload['title'] ?? 'SisirBindu'}',
          body: '${e.payload['message'] ?? ''}',
        );
    }
  }

  Future<void> load() async {
    loading = true;
    error = null;
    notifyListeners();
    await refresh();
  }

  /// `silent` keeps the screen up while it refreshes — used for push-triggered
  /// reloads, where a spinner would be a distraction.
  Future<void> refresh({bool silent = false}) async {
    if (!silent) {
      loading = true;
      notifyListeners();
    }
    try {
      final results = await Future.wait([
        ApiService.accounts(),
        ApiService.categories(),
        ApiService.paymentMethods(),
        ApiService.overview(accountId: selectedAccountId),
        ApiService.notifications(limit: 1),
      ]);

      accounts = results[0] as List<Account>;
      categories = results[1] as List<Category>;
      paymentMethods = results[2] as List<PaymentMethod>;
      overview = results[3] as Overview;
      unreadNotifications = (results[4] as NotificationPage).unreadCount;

      // The selected account can vanish (deleted on another device).
      if (selectedAccountId != null &&
          !accounts.any((a) => a.id == selectedAccountId)) {
        selectedAccountId = null;
      }

      error = null;
    } on ApiException catch (e) {
      error = e.message;
      // A LOCK_REQUIRED here means the account has no app lock — the AuthProvider
      // owns that transition, so hand it over rather than showing a dead screen.
      onAuthError?.call(e);
    } catch (_) {
      error = 'Could not load your data.';
    } finally {
      loading = false;
      notifyListeners();
    }
  }

  /// Wired to AuthProvider.handleApiError in main.dart, so an auth-shaped failure
  /// on a data call routes the user to the right screen.
  void Function(Object error)? onAuthError;

  Future<void> selectAccount(String? id) async {
    selectedAccountId = id;
    notifyListeners();
    overview = await ApiService.overview(accountId: id);
    notifyListeners();
  }

  // ------------------------------------------------------------- accounts

  Future<bool> addAccount(String name, double openingBalance) async {
    try {
      await ApiService.createAccount(name: name, openingBalance: openingBalance);
      await refresh(silent: true);
      return true;
    } on ApiException catch (e) {
      error = e.message;
      notifyListeners();
      return false;
    }
  }

  Future<bool> renameAccount(String id, String name) async {
    try {
      await ApiService.updateAccount(id, name: name);
      await refresh(silent: true);
      return true;
    } on ApiException catch (e) {
      error = e.message;
      notifyListeners();
      return false;
    }
  }

  Future<bool> removeAccount(String id) async {
    try {
      await ApiService.deleteAccount(id);
      if (selectedAccountId == id) selectedAccountId = null;
      await refresh(silent: true);
      return true;
    } on ApiException catch (e) {
      // A populated account can't be deleted — the API explains why.
      error = e.message;
      notifyListeners();
      return false;
    }
  }

  // ----------------------------------------------------------- taxonomy

  Future<Category?> addCategory(TxType type, String name) async {
    try {
      final c = await ApiService.createCategory(type: type, name: name);
      categories = [...categories, c];
      notifyListeners();
      return c;
    } on ApiException catch (e) {
      error = e.message;
      notifyListeners();
      return null;
    }
  }

  Future<PaymentMethod?> addPaymentMethod(String name) async {
    try {
      final p = await ApiService.createPaymentMethod(name);
      paymentMethods = [...paymentMethods, p];
      notifyListeners();
      return p;
    } on ApiException catch (e) {
      error = e.message;
      notifyListeners();
      return null;
    }
  }

  void markNotificationsRead() {
    unreadNotifications = 0;
    notifyListeners();
  }

  void reset() {
    accounts = [];
    categories = [];
    paymentMethods = [];
    overview = const Overview();
    selectedAccountId = null;
    unreadNotifications = 0;
    loading = true;
    notifyListeners();
  }

  @override
  void dispose() {
    _events?.cancel();
    super.dispose();
  }
}
