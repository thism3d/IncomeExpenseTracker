import 'dart:io';

import 'package:dio/dio.dart';
import 'package:path_provider/path_provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../models/models.dart';
import '../utils/constants.dart';
import 'ws_client.dart';

/// Every API call the app makes.
///
/// Reads and writes go over the WebSocket (WsClient). Only the two things that
/// can't — multipart upload and binary download — use HTTP, against the same
/// server with the same bearer token.
class ApiService {
  ApiService._();

  static final _ws = WsClient.instance;
  static final _dio = Dio(BaseOptions(
    baseUrl: AppConstants.apiBaseUrl,
    connectTimeout: const Duration(seconds: 15),
    receiveTimeout: const Duration(minutes: 3), // a year's PDF is not instant
  ));

  static String? _token;
  static String? get token => _token;

  // ---------------------------------------------------------------- token

  static Future<void> loadToken() async {
    final prefs = await SharedPreferences.getInstance();
    _token = prefs.getString(AppConstants.tokenKey);
    _ws.setToken(_token);
  }

  static Future<void> setToken(String token) async {
    _token = token;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(AppConstants.tokenKey, token);
    _ws.setToken(token);
  }

  static Future<void> clearToken() async {
    _token = null;
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(AppConstants.tokenKey);
    await prefs.remove(AppConstants.userKey);
    _ws.setToken(null);
  }

  static Map<String, String> get _authHeader =>
      _token == null ? {} : {'Authorization': 'Bearer $_token'};

  /// The URL an `Image.network` or audio player can hit directly.
  static String fileUrl(String id) => '${AppConstants.apiBaseUrl}/files/$id';

  static Map<String, String> get imageHeaders => _authHeader;

  // Unwrap `{ success, message, data }`.
  static Map<String, dynamic> _data(Map<String, dynamic> res) =>
      (res['data'] as Map<String, dynamic>?) ?? const {};

  // ----------------------------------------------------------------- auth

  static Future<Map<String, dynamic>> registerSendOtp(String identifier) async =>
      _data(await _ws.request('auth/register/send-otp', payload: {'identifier': identifier}));

  static Future<String> registerVerifyOtp(String identifier, String code) async {
    final d = _data(await _ws.request(
      'auth/register/verify-otp',
      payload: {'identifier': identifier, 'code': code},
    ));
    return '${d['ticket']}';
  }

  static Future<User> registerSetPassword({
    required String ticket,
    required String name,
    required String password,
  }) async {
    final d = _data(await _ws.request(
      'auth/register/set-password',
      payload: {'ticket': ticket, 'name': name, 'password': password},
    ));
    await setToken('${d['token']}');
    return User.fromJson(d['user'] as Map<String, dynamic>);
  }

  static Future<User> login(String identifier, String password) async {
    final d = _data(await _ws.request(
      'auth/login',
      payload: {'identifier': identifier, 'password': password},
    ));
    await setToken('${d['token']}');
    return User.fromJson(d['user'] as Map<String, dynamic>);
  }

  static Future<Map<String, dynamic>> forgotPassword(String identifier) async =>
      _data(await _ws.request('auth/forgot-password', payload: {'identifier': identifier}));

  static Future<User> resetPassword({
    required String identifier,
    required String code,
    required String password,
  }) async {
    final d = _data(await _ws.request(
      'auth/reset-password',
      payload: {'identifier': identifier, 'code': code, 'password': password},
    ));
    await setToken('${d['token']}');
    return User.fromJson(d['user'] as Map<String, dynamic>);
  }

  static Future<User> me() async {
    final d = _data(await _ws.request('auth/me', method: 'GET'));
    return User.fromJson(d['user'] as Map<String, dynamic>);
  }

  static Future<User> updateProfile({String? name, String? currency, String? theme}) async {
    final d = _data(await _ws.request('auth/me', method: 'PUT', payload: {
      if (name != null) 'name': name,
      if (currency != null) 'currency': currency,
      if (theme != null) 'theme': theme,
    }));
    return User.fromJson(d['user'] as Map<String, dynamic>);
  }

  static Future<void> changePassword(String currentPassword, String password) =>
      _ws.request('auth/password', method: 'PUT', payload: {
        'currentPassword': currentPassword,
        'password': password,
      });

  // ------------------------------------------------------------- app lock

  static Future<User> setupLock({required String pin, required bool biometricEnabled}) async {
    final d = _data(await _ws.request('auth/lock/setup', payload: {
      'pin': pin,
      'biometricEnabled': biometricEnabled,
    }));
    return User.fromJson(d['user'] as Map<String, dynamic>);
  }

  static Future<bool> verifyPin(String pin) async {
    final d = _data(await _ws.request('auth/lock/verify-pin', payload: {'pin': pin}));
    return d['verified'] == true;
  }

  static Future<User> updateLock({String? currentPin, String? pin, bool? biometricEnabled}) async {
    final d = _data(await _ws.request('auth/lock', method: 'PUT', payload: {
      if (currentPin != null) 'currentPin': currentPin,
      if (pin != null) 'pin': pin,
      if (biometricEnabled != null) 'biometricEnabled': biometricEnabled,
    }));
    return User.fromJson(d['user'] as Map<String, dynamic>);
  }

  // ------------------------------------------------------------- accounts

  static Future<List<Account>> accounts({String? search}) async {
    final d = _data(await _ws.request('accounts', method: 'GET', query: {
      if (search != null && search.isNotEmpty) 'search': search,
    }));
    return (d['accounts'] as List? ?? [])
        .map((e) => Account.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  static Future<Account> createAccount({
    required String name,
    double openingBalance = 0,
  }) async {
    final d = _data(await _ws.request('accounts', payload: {
      'name': name,
      'openingBalance': openingBalance,
    }));
    return Account.fromJson(d['account'] as Map<String, dynamic>);
  }

  static Future<Account> updateAccount(String id, {String? name, double? openingBalance}) async {
    final d = _data(await _ws.request('accounts/$id', method: 'PUT', payload: {
      if (name != null) 'name': name,
      if (openingBalance != null) 'openingBalance': openingBalance,
    }));
    return Account.fromJson(d['account'] as Map<String, dynamic>);
  }

  static Future<void> deleteAccount(String id) => _ws.request('accounts/$id', method: 'DELETE');

  static Future<void> setDefaultAccount(String id) => _ws.request('accounts/$id/default');

  // ----------------------------------------------------- categories & methods

  static Future<List<Category>> categories({TxType? type, String? search}) async {
    final d = _data(await _ws.request('categories', method: 'GET', query: {
      if (type != null) 'type': type.wire,
      if (search != null && search.isNotEmpty) 'search': search,
    }));
    return (d['categories'] as List? ?? [])
        .map((e) => Category.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  static Future<Category> createCategory({required TxType type, required String name}) async {
    final d = _data(await _ws.request('categories', payload: {
      'type': type.wire,
      'name': name,
    }));
    return Category.fromJson(d['category'] as Map<String, dynamic>);
  }

  static Future<void> deleteCategory(String id) => _ws.request('categories/$id', method: 'DELETE');

  static Future<List<PaymentMethod>> paymentMethods({String? search}) async {
    final d = _data(await _ws.request('payment-methods', method: 'GET', query: {
      if (search != null && search.isNotEmpty) 'search': search,
    }));
    return (d['paymentMethods'] as List? ?? [])
        .map((e) => PaymentMethod.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  static Future<PaymentMethod> createPaymentMethod(String name) async {
    final d = _data(await _ws.request('payment-methods', payload: {'name': name}));
    return PaymentMethod.fromJson(d['paymentMethod'] as Map<String, dynamic>);
  }

  static Future<void> deletePaymentMethod(String id) =>
      _ws.request('payment-methods/$id', method: 'DELETE');

  // --------------------------------------------------------- transactions

  /// Keyset pagination — pass the previous page's cursor to get the next.
  static Future<TransactionPage> transactions({
    String? accountId,
    TxType? type,
    String? categoryId,
    DateTime? from,
    DateTime? to,
    String? search,
    int limit = AppConstants.pageSize,
    String? cursor,
    String? cursorId,
  }) async {
    final d = _data(await _ws.request('transactions', method: 'GET', query: {
      'limit': limit,
      if (accountId != null) 'accountId': accountId,
      if (type != null) 'type': type.wire,
      if (categoryId != null) 'categoryId': categoryId,
      if (from != null) 'from': from.toUtc().toIso8601String(),
      if (to != null) 'to': to.toUtc().toIso8601String(),
      if (search != null && search.isNotEmpty) 'search': search,
      if (cursor != null) 'cursor': cursor,
      if (cursorId != null) 'cursorId': cursorId,
    }));

    final next = d['nextCursor'] as Map<String, dynamic>?;
    return TransactionPage(
      items: (d['transactions'] as List? ?? [])
          .map((e) => Transaction.fromJson(e as Map<String, dynamic>))
          .toList(),
      hasMore: d['hasMore'] == true,
      cursor: next?['cursor'] as String?,
      cursorId: next?['cursorId'] as String?,
    );
  }

  static Future<Transaction> transaction(String id) async {
    final d = _data(await _ws.request('transactions/$id', method: 'GET'));
    return Transaction.fromJson(d['transaction'] as Map<String, dynamic>);
  }

  static Future<Transaction> saveTransaction({
    String? id,
    required TxType type,
    required String accountId,
    String? toAccountId,
    required double amount,
    String? categoryId,
    String? paymentMethodId,
    String? note,
    DateTime? occurredAt,
    String recurrence = 'NONE',
    DateTime? reminderAt,
    List<TxItem> items = const [],
    List<String> attachmentIds = const [],
  }) async {
    final body = <String, dynamic>{
      'type': type.wire,
      'accountId': accountId,
      'amount': amount,
      'toAccountId': type == TxType.transfer ? toAccountId : null,
      'categoryId': type == TxType.transfer ? null : categoryId,
      'paymentMethodId': type == TxType.transfer ? null : paymentMethodId,
      'note': (note == null || note.isEmpty) ? null : note,
      'occurredAt': (occurredAt ?? DateTime.now()).toUtc().toIso8601String(),
      'recurrence': recurrence,
      'reminderAt': reminderAt?.toUtc().toIso8601String(),
      'items': items.map((i) => i.toJson()).toList(),
      'attachmentIds': attachmentIds,
    };

    final d = _data(id == null
        ? await _ws.request('transactions', payload: body)
        : await _ws.request('transactions/$id', method: 'PUT', payload: body));
    return Transaction.fromJson(d['transaction'] as Map<String, dynamic>);
  }

  static Future<void> deleteTransaction(String id) =>
      _ws.request('transactions/$id', method: 'DELETE');

  // -------------------------------------------------------------- reports

  static Future<Overview> overview({String? accountId}) async {
    final d = _data(await _ws.request('reports/overview', method: 'GET', query: {
      if (accountId != null) 'accountId': accountId,
    }));
    return Overview.fromJson(d);
  }

  static Future<List<TrendPoint>> trend({String period = 'monthly', String? accountId}) async {
    final d = _data(await _ws.request('reports/trend', method: 'GET', query: {
      'period': period,
      if (accountId != null) 'accountId': accountId,
    }));
    return (d['points'] as List? ?? [])
        .map((e) => TrendPoint.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  static Future<List<CategorySlice>> categoryBreakdown({
    String period = 'monthly',
    TxType type = TxType.expense,
    String? accountId,
  }) async {
    final d = _data(await _ws.request('reports/categories', method: 'GET', query: {
      'period': period,
      'type': type.wire,
      if (accountId != null) 'accountId': accountId,
    }));
    return (d['categories'] as List? ?? [])
        .map((e) => CategorySlice.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  static Future<List<PaymentMethodStat>> paymentMethodBreakdown({
    String period = 'monthly',
    String? accountId,
  }) async {
    final d = _data(await _ws.request('reports/payment-methods', method: 'GET', query: {
      'period': period,
      if (accountId != null) 'accountId': accountId,
    }));
    return (d['paymentMethods'] as List? ?? [])
        .map((e) => PaymentMethodStat.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  static Future<CalendarMonth> calendar(DateTime month, {String? accountId}) async {
    final key = '${month.year}-${month.month.toString().padLeft(2, '0')}';
    final d = _data(await _ws.request('reports/calendar', method: 'GET', query: {
      'month': key,
      if (accountId != null) 'accountId': accountId,
    }));
    final totals = (d['totals'] as Map<String, dynamic>?) ?? const {};
    return CalendarMonth(
      days: (d['days'] as List? ?? [])
          .map((e) => CalendarDay.fromJson(e as Map<String, dynamic>))
          .toList(),
      income: (totals['income'] as num?)?.toDouble() ?? 0,
      expense: (totals['expense'] as num?)?.toDouble() ?? 0,
      balance: (totals['balance'] as num?)?.toDouble() ?? 0,
    );
  }

  static Future<BudgetSummary> budget() async {
    final d = _data(await _ws.request('reports/budget', method: 'GET'));
    return BudgetSummary(
      overall: d['overall'] == null
          ? null
          : BudgetRow.fromJson(d['overall'] as Map<String, dynamic>),
      categories: (d['categories'] as List? ?? [])
          .map((e) => BudgetRow.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
  }

  static Future<void> setBudget({String? categoryId, required double amount}) =>
      _ws.request('budgets', method: 'PUT', payload: {
        'categoryId': categoryId,
        'period': 'MONTHLY',
        'amount': amount,
      });

  static Future<void> deleteBudget(String id) => _ws.request('budgets/$id', method: 'DELETE');

  // -------------------------------------------------------- notifications

  static Future<NotificationPage> notifications({int limit = 30}) async {
    final d = _data(await _ws.request('notifications', method: 'GET', query: {'limit': limit}));
    return NotificationPage(
      items: (d['notifications'] as List? ?? [])
          .map((e) => AppNotification.fromJson(e as Map<String, dynamic>))
          .toList(),
      unreadCount: (d['unreadCount'] as num?)?.toInt() ?? 0,
    );
  }

  static Future<void> markAllRead() => _ws.request('notifications/read-all', method: 'PUT');

  // ---------------------------------------------------- files (the Drive)

  static Future<List<Attachment>> files({
    AttachmentKind? kind,
    String? search,
    String? topic,
    int limit = 100,
  }) async {
    final d = _data(await _ws.request('files', method: 'GET', query: {
      'limit': limit,
      if (kind != null) 'kind': kind.name.toUpperCase(),
      if (search != null && search.isNotEmpty) 'search': search,
      if (topic != null && topic != 'All') 'topic': topic,
    }));
    return (d['files'] as List? ?? [])
        .map((e) => Attachment.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  /// Multipart — HTTP, not the socket.
  static Future<List<Attachment>> uploadFiles(
    List<File> files, {
    String? transactionId,
    int? durationMs,
    String? topic,
    DateTime? createdAt,
    void Function(int sent, int total)? onProgress,
  }) async {
    final form = FormData();
    for (final f in files) {
      form.files.add(MapEntry('files', await MultipartFile.fromFile(f.path)));
    }
    if (transactionId != null) form.fields.add(MapEntry('transactionId', transactionId));
    if (durationMs != null) form.fields.add(MapEntry('durationMs', '$durationMs'));
    if (topic != null) form.fields.add(MapEntry('topic', topic));
    if (createdAt != null) form.fields.add(MapEntry('createdAt', createdAt.toUtc().toIso8601String()));

    try {
      final res = await _dio.post<Map<String, dynamic>>(
        '/files',
        data: form,
        options: Options(headers: _authHeader),
        onSendProgress: onProgress,
      );
      final d = (res.data?['data'] as Map<String, dynamic>?) ?? const {};
      return (d['attachments'] as List? ?? [])
          .map((e) => Attachment.fromJson(e as Map<String, dynamic>))
          .toList();
    } on DioException catch (e) {
      throw _fromDio(e, 'Upload failed');
    }
  }

  static Future<void> deleteFile(String id) => _ws.request('files/$id', method: 'DELETE');

  /// Pull a file down for previewing/sharing with the OS.
  static Future<File> downloadFile(Attachment attachment) async {
    final dir = await getTemporaryDirectory();
    final path = '${dir.path}/${attachment.name}';
    try {
      await _dio.download(
        '/files/${attachment.id}',
        path,
        options: Options(headers: _authHeader),
      );
      return File(path);
    } on DioException catch (e) {
      throw _fromDio(e, 'Could not download the file');
    }
  }

  /// PDF/Excel statement. Binary — HTTP.
  static Future<File> exportReport({
    required String format, // 'pdf' | 'excel'
    String period = 'monthly',
    String? accountId,
    DateTime? from,
    DateTime? to,
  }) async {
    final dir = await getTemporaryDirectory();
    final stamp = DateTime.now().toIso8601String().substring(0, 10);
    final ext = format == 'pdf' ? 'pdf' : 'xlsx';
    final path = '${dir.path}/SisirBindu-Statement-$stamp.$ext';

    try {
      await _dio.download(
        '/reports/export',
        path,
        queryParameters: {
          'format': format,
          'period': period,
          if (accountId != null) 'accountId': accountId,
          if (from != null) 'from': from.toUtc().toIso8601String(),
          if (to != null) 'to': to.toUtc().toIso8601String(),
        },
        options: Options(headers: _authHeader),
      );
      return File(path);
    } on DioException catch (e) {
      throw _fromDio(e, 'Could not generate the report');
    }
  }

  // ---------------------------------------------------------- app config

  static Future<AppConfig> appConfig() async {
    final d = _data(await _ws.request('app/config', method: 'GET'));
    final m = (d['maintenance'] as Map<String, dynamic>?) ?? const {};
    final v = d['latestVersion'] as Map<String, dynamic>?;
    return AppConfig(
      maintenanceActive: m['active'] == true,
      maintenanceMessage: '${m['message'] ?? ''}',
      latestVersionName: v?['versionName'] as String?,
      latestVersionCode: (v?['versionCode'] as num?)?.toInt(),
      changelog: v?['changelog'] as String?,
      apkUrl: v?['apkUrl'] as String?,
      mandatory: v?['mandatory'] == true,
    );
  }

  static ApiException _fromDio(DioException e, String fallback) {
    final data = e.response?.data;
    if (data is Map && data['error'] is Map) {
      final err = data['error'] as Map;
      return ApiException(
        e.response?.statusCode ?? 0,
        '${err['code'] ?? 'UNKNOWN'}',
        '${err['message'] ?? fallback}',
      );
    }
    return ApiException(e.response?.statusCode ?? 0, 'NETWORK', fallback);
  }
}

class TransactionPage {
  final List<Transaction> items;
  final bool hasMore;
  final String? cursor;
  final String? cursorId;

  const TransactionPage({
    this.items = const [],
    this.hasMore = false,
    this.cursor,
    this.cursorId,
  });
}

class CalendarMonth {
  final List<CalendarDay> days;
  final double income;
  final double expense;
  final double balance;

  const CalendarMonth({
    this.days = const [],
    this.income = 0,
    this.expense = 0,
    this.balance = 0,
  });
}

class BudgetSummary {
  final BudgetRow? overall;
  final List<BudgetRow> categories;

  const BudgetSummary({this.overall, this.categories = const []});
}

class NotificationPage {
  final List<AppNotification> items;
  final int unreadCount;

  const NotificationPage({this.items = const [], this.unreadCount = 0});
}

class AppConfig {
  final bool maintenanceActive;
  final String maintenanceMessage;
  final String? latestVersionName;
  final int? latestVersionCode;
  final String? changelog;
  final String? apkUrl;
  final bool mandatory;

  const AppConfig({
    this.maintenanceActive = false,
    this.maintenanceMessage = '',
    this.latestVersionName,
    this.latestVersionCode,
    this.changelog,
    this.apkUrl,
    this.mandatory = false,
  });

  bool get hasUpdate =>
      latestVersionCode != null && latestVersionCode! > AppConstants.appBuildNumber;
}
