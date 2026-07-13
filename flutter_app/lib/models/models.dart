// Wire models. Every `fromJson` is defensive about nulls — the server may add
// fields, and a missing one must never crash a screen.

double _d(dynamic v) => v == null ? 0 : (v is num ? v.toDouble() : double.tryParse('$v') ?? 0);
int _i(dynamic v) => v == null ? 0 : (v is num ? v.toInt() : int.tryParse('$v') ?? 0);
DateTime _dt(dynamic v) => v == null ? DateTime.now() : (DateTime.tryParse('$v')?.toLocal() ?? DateTime.now());
DateTime? _dtn(dynamic v) => v == null ? null : DateTime.tryParse('$v')?.toLocal();

enum TxType { income, expense, transfer }

extension TxTypeX on TxType {
  String get wire => switch (this) {
        TxType.income => 'INCOME',
        TxType.expense => 'EXPENSE',
        TxType.transfer => 'TRANSFER',
      };

  String get label => switch (this) {
        TxType.income => 'Income',
        TxType.expense => 'Expense',
        TxType.transfer => 'Transfer',
      };

  static TxType parse(String? v) => switch (v) {
        'INCOME' => TxType.income,
        'TRANSFER' => TxType.transfer,
        _ => TxType.expense,
      };
}

class User {
  final String id;
  final String name;
  final String? email;
  final String? phone;
  final String currency;
  final String theme;
  final bool emailVerified;
  final bool phoneVerified;
  final bool lockConfigured;
  final bool biometricEnabled;
  final bool hasPin;
  final bool isAdmin;
  final String status;

  const User({
    required this.id,
    required this.name,
    this.email,
    this.phone,
    this.currency = 'BDT',
    this.theme = 'system',
    this.emailVerified = false,
    this.phoneVerified = false,
    this.lockConfigured = false,
    this.biometricEnabled = false,
    this.hasPin = false,
    this.isAdmin = false,
    this.status = 'ACTIVE',
  });

  factory User.fromJson(Map<String, dynamic> j) => User(
        id: '${j['id']}',
        name: '${j['name'] ?? ''}',
        email: j['email'] as String?,
        phone: j['phone'] as String?,
        currency: '${j['currency'] ?? 'BDT'}',
        theme: '${j['theme'] ?? 'system'}',
        emailVerified: j['emailVerified'] == true,
        phoneVerified: j['phoneVerified'] == true,
        lockConfigured: j['lockConfigured'] == true,
        biometricEnabled: j['biometricEnabled'] == true,
        hasPin: j['hasPin'] == true,
        isAdmin: j['isAdmin'] == true,
        status: '${j['status'] ?? 'ACTIVE'}',
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'email': email,
        'phone': phone,
        'currency': currency,
        'theme': theme,
        'emailVerified': emailVerified,
        'phoneVerified': phoneVerified,
        'lockConfigured': lockConfigured,
        'biometricEnabled': biometricEnabled,
        'hasPin': hasPin,
        'isAdmin': isAdmin,
        'status': status,
      };
}

class Account {
  final String id;
  final String name;
  final String icon;
  final String color;
  final double openingBalance;
  final double balance;
  final bool isDefault;
  final int transactionCount;

  const Account({
    required this.id,
    required this.name,
    this.icon = 'wallet',
    this.color = '#0E7C66',
    this.openingBalance = 0,
    this.balance = 0,
    this.isDefault = false,
    this.transactionCount = 0,
  });

  factory Account.fromJson(Map<String, dynamic> j) => Account(
        id: '${j['id']}',
        name: '${j['name'] ?? ''}',
        icon: '${j['icon'] ?? 'wallet'}',
        color: '${j['color'] ?? '#0E7C66'}',
        openingBalance: _d(j['openingBalance']),
        balance: _d(j['balance']),
        isDefault: j['isDefault'] == true,
        transactionCount: _i(j['transactionCount']),
      );
}

class Category {
  final String id;
  final TxType type;
  final String name;
  final String icon;
  final String color;
  final bool isDefault;
  final int usageCount;

  const Category({
    required this.id,
    required this.type,
    required this.name,
    this.icon = 'other_expenses',
    this.color = '#64748B',
    this.isDefault = false,
    this.usageCount = 0,
  });

  factory Category.fromJson(Map<String, dynamic> j) => Category(
        id: '${j['id']}',
        type: TxTypeX.parse(j['type'] as String?),
        name: '${j['name'] ?? ''}',
        icon: '${j['icon'] ?? 'other_expenses'}',
        color: '${j['color'] ?? '#64748B'}',
        isDefault: j['isDefault'] == true,
        usageCount: _i(j['usageCount']),
      );
}

class PaymentMethod {
  final String id;
  final String name;
  final String icon;
  final String color;
  final bool isDefault;

  const PaymentMethod({
    required this.id,
    required this.name,
    this.icon = 'others',
    this.color = '#64748B',
    this.isDefault = false,
  });

  factory PaymentMethod.fromJson(Map<String, dynamic> j) => PaymentMethod(
        id: '${j['id']}',
        name: '${j['name'] ?? ''}',
        icon: '${j['icon'] ?? 'others'}',
        color: '${j['color'] ?? '#64748B'}',
        isDefault: j['isDefault'] == true,
      );
}

class TxItem {
  final String? id;
  final String name;
  final double quantity;
  final String? unit;
  final double rate;

  const TxItem({
    this.id,
    required this.name,
    this.quantity = 1,
    this.unit,
    this.rate = 0,
  });

  double get total => quantity * rate;

  factory TxItem.fromJson(Map<String, dynamic> j) => TxItem(
        id: j['id'] as String?,
        name: '${j['name'] ?? ''}',
        quantity: _d(j['quantity']),
        unit: j['unit'] as String?,
        rate: _d(j['rate']),
      );

  Map<String, dynamic> toJson() => {
        'name': name,
        'quantity': quantity,
        'unit': unit,
        'rate': rate,
      };
}

enum AttachmentKind { image, pdf, doc, audio, other }

extension AttachmentKindX on AttachmentKind {
  static AttachmentKind parse(String? v) => switch (v) {
        'IMAGE' => AttachmentKind.image,
        'PDF' => AttachmentKind.pdf,
        'DOC' => AttachmentKind.doc,
        'AUDIO' => AttachmentKind.audio,
        _ => AttachmentKind.other,
      };

  String get label => switch (this) {
        AttachmentKind.image => 'Image',
        AttachmentKind.pdf => 'PDF',
        AttachmentKind.doc => 'Document',
        AttachmentKind.audio => 'Audio',
        AttachmentKind.other => 'File',
      };
}

class Attachment {
  final String id;
  final String? transactionId;
  final AttachmentKind kind;
  final String name;
  final String mime;
  final int size;
  final int? durationMs;
  final String? topic;
  final DateTime createdAt;
  final TransactionRef? transaction;

  const Attachment({
    required this.id,
    this.transactionId,
    required this.kind,
    required this.name,
    this.mime = '',
    this.size = 0,
    this.durationMs,
    this.topic,
    required this.createdAt,
    this.transaction,
  });

  factory Attachment.fromJson(Map<String, dynamic> j) => Attachment(
        id: '${j['id']}',
        transactionId: j['transactionId'] as String?,
        kind: AttachmentKindX.parse(j['kind'] as String?),
        name: '${j['name'] ?? 'file'}',
        mime: '${j['mime'] ?? ''}',
        size: _i(j['size']),
        durationMs: j['durationMs'] == null ? null : _i(j['durationMs']),
        topic: j['topic'] as String?,
        createdAt: _dt(j['createdAt']),
        transaction: j['transaction'] == null
            ? null
            : TransactionRef.fromJson(j['transaction'] as Map<String, dynamic>),
      );
}

/// The slim transaction summary the Drive listing hangs off each file.
class TransactionRef {
  final String id;
  final TxType type;
  final double amount;
  final String? note;
  final DateTime occurredAt;
  final String? categoryName;

  const TransactionRef({
    required this.id,
    required this.type,
    required this.amount,
    this.note,
    required this.occurredAt,
    this.categoryName,
  });

  factory TransactionRef.fromJson(Map<String, dynamic> j) => TransactionRef(
        id: '${j['id']}',
        type: TxTypeX.parse(j['type'] as String?),
        amount: _d(j['amount']),
        note: j['note'] as String?,
        occurredAt: _dt(j['occurredAt']),
        categoryName: j['categoryName'] as String?,
      );
}

class Transaction {
  final String id;
  final TxType type;
  final double amount;
  final String accountId;
  final String accountName;
  final String? toAccountId;
  final String? toAccountName;
  final String? categoryId;
  final String? categoryName;
  final String? categoryIcon;
  final String? categoryColor;
  final String? paymentMethodId;
  final String? paymentMethodName;
  final String? note;
  final DateTime occurredAt;
  final String recurrence;
  final DateTime? reminderAt;
  final int itemCount;
  final int attachmentCount;
  final List<TxItem> items;
  final List<Attachment> attachments;

  const Transaction({
    required this.id,
    required this.type,
    required this.amount,
    required this.accountId,
    this.accountName = '',
    this.toAccountId,
    this.toAccountName,
    this.categoryId,
    this.categoryName,
    this.categoryIcon,
    this.categoryColor,
    this.paymentMethodId,
    this.paymentMethodName,
    this.note,
    required this.occurredAt,
    this.recurrence = 'NONE',
    this.reminderAt,
    this.itemCount = 0,
    this.attachmentCount = 0,
    this.items = const [],
    this.attachments = const [],
  });

  bool get isIncome => type == TxType.income;
  bool get isTransfer => type == TxType.transfer;

  /// What the row shows as its title.
  String get title {
    if (isTransfer) return '$accountName → ${toAccountName ?? ''}';
    return categoryName ?? type.label;
  }

  factory Transaction.fromJson(Map<String, dynamic> j) {
    final cat = j['category'] as Map<String, dynamic>?;
    final pm = j['paymentMethod'] as Map<String, dynamic>?;
    return Transaction(
      id: '${j['id']}',
      type: TxTypeX.parse(j['type'] as String?),
      amount: _d(j['amount']),
      accountId: '${j['accountId']}',
      accountName: '${j['accountName'] ?? ''}',
      toAccountId: j['toAccountId'] as String?,
      toAccountName: j['toAccountName'] as String?,
      categoryId: j['categoryId'] as String?,
      categoryName: cat?['name'] as String?,
      categoryIcon: cat?['icon'] as String?,
      categoryColor: cat?['color'] as String?,
      paymentMethodId: j['paymentMethodId'] as String?,
      paymentMethodName: pm?['name'] as String?,
      note: j['note'] as String?,
      occurredAt: _dt(j['occurredAt']),
      recurrence: '${j['recurrence'] ?? 'NONE'}',
      reminderAt: _dtn(j['reminderAt']),
      itemCount: _i(j['itemCount']),
      attachmentCount: _i(j['attachmentCount']),
      items: (j['items'] as List?)
              ?.map((e) => TxItem.fromJson(e as Map<String, dynamic>))
              .toList() ??
          const [],
      attachments: (j['attachments'] as List?)
              ?.map((e) => Attachment.fromJson(e as Map<String, dynamic>))
              .toList() ??
          const [],
    );
  }
}

class PeriodTotals {
  final double income;
  final double expense;
  final double net;

  const PeriodTotals({this.income = 0, this.expense = 0, this.net = 0});

  factory PeriodTotals.fromJson(Map<String, dynamic>? j) => j == null
      ? const PeriodTotals()
      : PeriodTotals(
          income: _d(j['income']),
          expense: _d(j['expense']),
          net: _d(j['net']),
        );
}

class Overview {
  final double balance;
  final PeriodTotals daily;
  final PeriodTotals weekly;
  final PeriodTotals monthly;
  final PeriodTotals yearly;
  final PeriodTotals allTime;

  const Overview({
    this.balance = 0,
    this.daily = const PeriodTotals(),
    this.weekly = const PeriodTotals(),
    this.monthly = const PeriodTotals(),
    this.yearly = const PeriodTotals(),
    this.allTime = const PeriodTotals(),
  });

  factory Overview.fromJson(Map<String, dynamic> j) => Overview(
        balance: _d(j['balance']),
        daily: PeriodTotals.fromJson(j['daily'] as Map<String, dynamic>?),
        weekly: PeriodTotals.fromJson(j['weekly'] as Map<String, dynamic>?),
        monthly: PeriodTotals.fromJson(j['monthly'] as Map<String, dynamic>?),
        yearly: PeriodTotals.fromJson(j['yearly'] as Map<String, dynamic>?),
        allTime: PeriodTotals.fromJson(j['allTime'] as Map<String, dynamic>?),
      );

  PeriodTotals forPeriod(String period) => switch (period) {
        'daily' => daily,
        'weekly' => weekly,
        'yearly' => yearly,
        _ => monthly,
      };
}

class TrendPoint {
  final DateTime date;
  final double income;
  final double expense;

  const TrendPoint({required this.date, this.income = 0, this.expense = 0});

  factory TrendPoint.fromJson(Map<String, dynamic> j) => TrendPoint(
        date: _dt(j['date']),
        income: _d(j['income']),
        expense: _d(j['expense']),
      );
}

class CategorySlice {
  final String? id;
  final String name;
  final String icon;
  final String color;
  final double total;
  final int count;
  final double percent;

  const CategorySlice({
    this.id,
    required this.name,
    this.icon = 'other_expenses',
    this.color = '#64748B',
    this.total = 0,
    this.count = 0,
    this.percent = 0,
  });

  factory CategorySlice.fromJson(Map<String, dynamic> j) => CategorySlice(
        id: j['id'] as String?,
        name: '${j['name'] ?? 'Uncategorised'}',
        icon: '${j['icon'] ?? 'other_expenses'}',
        color: '${j['color'] ?? '#64748B'}',
        total: _d(j['total']),
        count: _i(j['count']),
        percent: _d(j['percent']),
      );
}

class PaymentMethodStat {
  final String? id;
  final String name;
  final String icon;
  final double income;
  final double expense;
  final int count;

  const PaymentMethodStat({
    this.id,
    required this.name,
    this.icon = 'others',
    this.income = 0,
    this.expense = 0,
    this.count = 0,
  });

  factory PaymentMethodStat.fromJson(Map<String, dynamic> j) => PaymentMethodStat(
        id: j['id'] as String?,
        name: '${j['name'] ?? 'Unspecified'}',
        icon: '${j['icon'] ?? 'others'}',
        income: _d(j['income']),
        expense: _d(j['expense']),
        count: _i(j['count']),
      );
}

class BudgetRow {
  final String id;
  final String? categoryId;
  final String? categoryName;
  final String? categoryIcon;
  final String? categoryColor;
  final double budget;
  final double spent;
  final double remaining;
  final double percentUsed;
  final double perDayAverage;
  final double perDayRemaining;

  const BudgetRow({
    required this.id,
    this.categoryId,
    this.categoryName,
    this.categoryIcon,
    this.categoryColor,
    this.budget = 0,
    this.spent = 0,
    this.remaining = 0,
    this.percentUsed = 0,
    this.perDayAverage = 0,
    this.perDayRemaining = 0,
  });

  factory BudgetRow.fromJson(Map<String, dynamic> j) {
    final cat = j['category'] as Map<String, dynamic>?;
    return BudgetRow(
      id: '${j['id']}',
      categoryId: j['categoryId'] as String?,
      categoryName: cat?['name'] as String?,
      categoryIcon: cat?['icon'] as String?,
      categoryColor: cat?['color'] as String?,
      budget: _d(j['budget']),
      spent: _d(j['spent']),
      remaining: _d(j['remaining']),
      percentUsed: _d(j['percentUsed']),
      perDayAverage: _d(j['perDayAverage']),
      perDayRemaining: _d(j['perDayRemaining']),
    );
  }
}

class CalendarDay {
  final DateTime date;
  final double income;
  final double expense;
  final int count;

  const CalendarDay({
    required this.date,
    this.income = 0,
    this.expense = 0,
    this.count = 0,
  });

  factory CalendarDay.fromJson(Map<String, dynamic> j) => CalendarDay(
        date: _dt(j['date']),
        income: _d(j['income']),
        expense: _d(j['expense']),
        count: _i(j['count']),
      );
}

class AppNotification {
  final String id;
  final String type;
  final String title;
  final String message;
  final bool isRead;
  final DateTime createdAt;

  const AppNotification({
    required this.id,
    this.type = 'SYSTEM',
    required this.title,
    required this.message,
    this.isRead = false,
    required this.createdAt,
  });

  factory AppNotification.fromJson(Map<String, dynamic> j) => AppNotification(
        id: '${j['id']}',
        type: '${j['type'] ?? 'SYSTEM'}',
        title: '${j['title'] ?? ''}',
        message: '${j['message'] ?? ''}',
        isRead: j['isRead'] == true,
        createdAt: _dt(j['createdAt']),
      );
}
