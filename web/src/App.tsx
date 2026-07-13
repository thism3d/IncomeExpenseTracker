import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Toaster } from 'sonner';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { ThemeProvider, useTheme } from '@/context/ThemeContext';
import { AppShell } from '@/components/AppShell';
import { AdminShell } from '@/components/AdminShell';
import { MaintenanceGate } from '@/components/MaintenanceGate';

import Landing from '@/pages/Landing';
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import ForgotPassword from '@/pages/ForgotPassword';
import LockSetup from '@/pages/LockSetup';
import Dashboard from '@/pages/Dashboard';
import Transactions from '@/pages/Transactions';
import CalendarPage from '@/pages/Calendar';
import Drive from '@/pages/Drive';
import Reports from '@/pages/Reports';
import Budgets from '@/pages/Budgets';
import Settings from '@/pages/Settings';

import AdminLogin from '@/pages/admin/AdminLogin';
import AdminDashboard from '@/pages/admin/AdminDashboard';
import AdminUsers from '@/pages/admin/AdminUsers';
import AdminBroadcast from '@/pages/admin/AdminBroadcast';
import AdminApp from '@/pages/admin/AdminApp';
import AdminSettings from '@/pages/admin/AdminSettings';

const FullPageSpinner = () => (
    <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
);

import { useState } from 'react';
import LockScreen from '@/pages/LockScreen';

const UserRoute = ({ children }: { children: React.ReactNode }) => {
    const { isAuthenticated, isAdmin, user, loading } = useAuth();
    const [unlocked, setUnlocked] = useState(() => {
        if (!user) return false;
        return sessionStorage.getItem(`sb_device_unlocked_${user.id}`) === 'true';
    });

    if (loading) return <FullPageSpinner />;
    if (!isAuthenticated) return <Navigate to="/login" replace />;
    // The admin account has no tracker data of its own — send it where it belongs.
    if (isAdmin) return <Navigate to="/admin" replace />;

    // 1. If server says lock is not configured, go to Setup
    if (user && !user.lockConfigured) return <LockSetup />;

    // 2. If this local browser has no lock configured (first login on this device), force LockSetup
    const localLockType = user ? localStorage.getItem(`sb_lock_type_${user.id}`) : null;
    if (user && !localLockType) {
        return <LockSetup />;
    }

    // 3. If local lock is configured but not unlocked this session, show LockScreen
    if (user && !unlocked) {
        return (
            <LockScreen
                onUnlock={() => {
                    sessionStorage.setItem(`sb_device_unlocked_${user.id}`, 'true');
                    setUnlocked(true);
                }}
            />
        );
    }

    return <AppShell>{children}</AppShell>;
};

const AdminRoute = ({ children }: { children: React.ReactNode }) => {
    const { isAuthenticated, isAdmin, loading } = useAuth();
    if (loading) return <FullPageSpinner />;
    if (!isAuthenticated || !isAdmin) return <Navigate to="/admin/login" replace />;
    return <AdminShell>{children}</AdminShell>;
};

/** Auth pages: bounce a signed-in user to where they belong. */
const PublicRoute = ({ children }: { children: React.ReactNode }) => {
    const { isAuthenticated, isAdmin, loading } = useAuth();
    if (loading) return <FullPageSpinner />;
    if (isAuthenticated) return <Navigate to={isAdmin ? '/admin' : '/app'} replace />;
    return <>{children}</>;
};

/** The marketing page. A signed-in user gets their dashboard instead. */
const LandingRoute = () => {
    const { isAuthenticated, isAdmin, loading } = useAuth();
    if (loading) return <FullPageSpinner />;
    if (isAuthenticated) return <Navigate to={isAdmin ? '/admin' : '/app'} replace />;
    return <Landing />;
};

const Shell = () => {
    const { mode } = useTheme();
    return (
        <>
            <MaintenanceGate />
            <Toaster
                position="top-right"
                theme={mode}
                richColors
                closeButton
                toastOptions={{ style: { borderRadius: '0.75rem' } }}
            />
            <Routes>
                {/* public */}
                <Route path="/" element={<LandingRoute />} />
                <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
                <Route path="/register" element={<PublicRoute><Register /></PublicRoute>} />
                <Route path="/forgot-password" element={<PublicRoute><ForgotPassword /></PublicRoute>} />

                {/* the portal */}
                <Route path="/app" element={<UserRoute><Dashboard /></UserRoute>} />
                <Route path="/transactions" element={<UserRoute><Transactions /></UserRoute>} />
                <Route path="/calendar" element={<UserRoute><CalendarPage /></UserRoute>} />
                <Route path="/drive" element={<UserRoute><Drive /></UserRoute>} />
                <Route path="/reports" element={<UserRoute><Reports /></UserRoute>} />
                <Route path="/budgets" element={<UserRoute><Budgets /></UserRoute>} />
                <Route path="/settings" element={<UserRoute><Settings /></UserRoute>} />

                {/* admin */}
                <Route path="/admin/login" element={<PublicRoute><AdminLogin /></PublicRoute>} />
                <Route path="/admin" element={<AdminRoute><AdminDashboard /></AdminRoute>} />
                <Route path="/admin/users" element={<AdminRoute><AdminUsers /></AdminRoute>} />
                <Route path="/admin/broadcast" element={<AdminRoute><AdminBroadcast /></AdminRoute>} />
                <Route path="/admin/app" element={<AdminRoute><AdminApp /></AdminRoute>} />
                <Route path="/admin/settings" element={<AdminRoute><AdminSettings /></AdminRoute>} />

                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
        </>
    );
};

export default function App() {
    return (
        <ThemeProvider>
            <BrowserRouter>
                <AuthProvider>
                    <Shell />
                </AuthProvider>
            </BrowserRouter>
        </ThemeProvider>
    );
}
