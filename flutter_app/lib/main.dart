import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import 'providers/auth_provider.dart';
import 'providers/data_provider.dart';
import 'providers/theme_provider.dart';
import 'screens/auth/lock_screen.dart';
import 'screens/auth/lock_setup_screen.dart';
import 'screens/auth/login_screen.dart';
import 'screens/main/main_shell.dart';
import 'screens/maintenance_screen.dart';
import 'screens/splash_screen.dart';
import 'services/api_service.dart';
import 'services/notification_service.dart';
import 'services/ws_client.dart';
import 'theme/app_theme.dart';

final rootNavigatorKey = GlobalKey<NavigatorState>();

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  await SystemChrome.setPreferredOrientations([
    DeviceOrientation.portraitUp,
    DeviceOrientation.portraitDown,
  ]);

  await NotificationService.instance.initialize();

  // Fire-and-forget: a dead network at launch must not block the splash.
  unawaited(WsClient.instance.connect());

  runApp(const SisirBinduApp());
}

class SisirBinduApp extends StatelessWidget {
  const SisirBinduApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [
        ChangeNotifierProvider(create: (_) => ThemeProvider()..load()),
        ChangeNotifierProvider(create: (_) => AuthProvider()),
        // A data call that fails with LOCK_REQUIRED / SUSPENDED is really an auth
        // transition — hand those to AuthProvider so the gate moves the user.
        ChangeNotifierProxyProvider<AuthProvider, DataProvider>(
          create: (_) => DataProvider(),
          update: (_, auth, data) => (data ?? DataProvider())
            ..onAuthError = auth.handleApiError,
        ),
      ],
      child: Consumer<ThemeProvider>(
        builder: (context, theme, _) => MaterialApp(
          title: 'SisirBindu Tracker',
          debugShowCheckedModeBanner: false,
          navigatorKey: rootNavigatorKey,
          theme: AppTheme.light(),
          darkTheme: AppTheme.dark(),
          themeMode: theme.mode,
          home: const _Root(),
        ),
      ),
    );
  }
}

/// Decides what the user sees. The order is the README's rule: you cannot reach
/// the home screen without a configured app lock, and you cannot reach it after
/// a cold start without passing that lock.
class _Root extends StatefulWidget {
  const _Root();

  @override
  State<_Root> createState() => _RootState();
}

class _RootState extends State<_Root> with WidgetsBindingObserver {
  bool _splashDone = false;
  bool _maintenance = false;
  StreamSubscription<WsEvent>? _events;
  AuthProvider? _authProvider;
  AuthStatus? _lastStatus;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _boot();

    _authProvider = context.read<AuthProvider>();
    _authProvider?.addListener(_onAuthChanged);
    _lastStatus = _authProvider?.status;

    // The admin toggling maintenance broadcasts to every socket — react without
    // waiting for a restart.
    _events = WsClient.instance.events.listen((e) {
      if (!mounted || e.name != 'maintenance') return;
      setState(() => _maintenance = e.payload['active'] == true);
    });
  }

  void _onAuthChanged() {
    if (!mounted) return;
    final status = _authProvider?.status;
    if (status == AuthStatus.unauthenticated && _lastStatus != AuthStatus.unauthenticated) {
      rootNavigatorKey.currentState?.popUntil((route) => route.isFirst);
    }
    _lastStatus = status;
  }

  Future<void> _boot() async {
    if (!mounted) return;
    await context.read<AuthProvider>().bootstrap();

    // A maintenance window outranks the auth gate.
    try {
      final config = await ApiService.appConfig();
      if (mounted && config.maintenanceActive) {
        setState(() => _maintenance = true);
      }
    } catch (_) {
      // Server unreachable — let the normal screens surface their own errors.
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    final auth = context.read<AuthProvider>();
    if (state == AppLifecycleState.paused || state == AppLifecycleState.inactive) {
      auth.onBackgrounded();
    } else if (state == AppLifecycleState.resumed) {
      auth.onResume();
    }
  }

  @override
  void dispose() {
    _authProvider?.removeListener(_onAuthChanged);
    _events?.cancel();
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (!_splashDone) {
      return SplashScreen(onDone: () => setState(() => _splashDone = true));
    }
    if (_maintenance) return const MaintenanceScreen();

    final auth = context.watch<AuthProvider>();

    return switch (auth.status) {
      AuthStatus.unknown => const _Loading(),
      AuthStatus.unauthenticated => const LoginScreen(),
      // Mandatory — the README says this step cannot be skipped.
      AuthStatus.needsLock => const LockSetupScreen(),
      AuthStatus.locked => const LockScreen(),
      AuthStatus.authenticated => const MainShell(),
    };
  }
}

class _Loading extends StatelessWidget {
  const _Loading();

  @override
  Widget build(BuildContext context) =>
      const Scaffold(body: Center(child: CircularProgressIndicator()));
}
