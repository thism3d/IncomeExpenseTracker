const express = require('express');
const { authenticate, requireAdmin, requireActiveUser } = require('../middleware/auth');
const { validate, validateQuery } = require('../middleware/validate');
const { upload, apkUpload } = require('../middleware/upload');
const { wrap } = require('../utils/respond');
const s = require('../utils/schemas');

const accounts = require('../controllers/accountController');
const taxonomy = require('../controllers/taxonomyController');
const transactions = require('../controllers/transactionController');
const attachments = require('../controllers/attachmentController');
const reports = require('../controllers/reportController');
const exportCtrl = require('../controllers/exportController');
const budgets = require('../controllers/budgetController');
const notifications = require('../controllers/notificationController');
const app = require('../controllers/appController');
const admin = require('../controllers/adminController');

const router = express.Router();

// Everything past this point needs a valid token for an account that still exists
// and is not suspended.
const user = [authenticate, wrap(requireActiveUser)];

// ------------------------------------------------------------------ public
router.get('/app/config', wrap(app.getAppConfig));

// ---------------------------------------------------------------- accounts
router.get('/accounts',             user, wrap(accounts.listAccounts));
router.post('/accounts',            user, validate(s.accountSchema),        wrap(accounts.createAccount));
router.get('/accounts/:id',         user, wrap(accounts.getAccount));
router.put('/accounts/:id',         user, validate(s.accountUpdateSchema),  wrap(accounts.updateAccount));
router.delete('/accounts/:id',      user, wrap(accounts.deleteAccount));
router.post('/accounts/:id/default', user, wrap(accounts.setDefaultAccount));

// -------------------------------------------------------------- categories
router.get('/categories',        user, wrap(taxonomy.listCategories));
router.post('/categories',       user, validate(s.categorySchema),       wrap(taxonomy.createCategory));
router.put('/categories/:id',    user, validate(s.categoryUpdateSchema), wrap(taxonomy.updateCategory));
router.delete('/categories/:id', user, wrap(taxonomy.deleteCategory));

// --------------------------------------------------------- payment methods
router.get('/payment-methods',        user, wrap(taxonomy.listPaymentMethods));
router.post('/payment-methods',       user, validate(s.paymentMethodSchema),       wrap(taxonomy.createPaymentMethod));
router.put('/payment-methods/:id',    user, validate(s.paymentMethodUpdateSchema), wrap(taxonomy.updatePaymentMethod));
router.delete('/payment-methods/:id', user, wrap(taxonomy.deletePaymentMethod));

// ------------------------------------------------------------ transactions
router.get('/transactions',        user, validateQuery(s.listQuerySchema),        wrap(transactions.listTransactions));
router.post('/transactions',       user, validate(s.transactionSchema),           wrap(transactions.createTransaction));
router.get('/transactions/:id',    user, wrap(transactions.getTransaction));
router.put('/transactions/:id',    user, validate(s.transactionUpdateSchema),     wrap(transactions.updateTransaction));
router.delete('/transactions/:id', user, wrap(transactions.deleteTransaction));

// ------------------------------------------------------- files (the Drive)
// Multipart — these must be called over HTTP, not the WebSocket transport.
router.get('/files',        user, wrap(attachments.listFiles));
router.post('/files',       user, upload.array('files', 10), wrap(attachments.uploadFiles));
router.get('/files/:id',    user, wrap(attachments.getFile));
router.delete('/files/:id', user, wrap(attachments.deleteFile));

// ----------------------------------------------------------------- reports
router.get('/reports/overview',        user, wrap(reports.getOverview));
router.get('/reports/summary',         user, validateQuery(s.reportQuerySchema), wrap(reports.getSummary));
router.get('/reports/trend',           user, validateQuery(s.reportQuerySchema), wrap(reports.getTrend));
router.get('/reports/categories',      user, validateQuery(s.reportQuerySchema), wrap(reports.getCategoryBreakdown));
router.get('/reports/payment-methods', user, validateQuery(s.reportQuerySchema), wrap(reports.getPaymentMethodBreakdown));
router.get('/reports/calendar',        user, wrap(reports.getCalendar));
router.get('/reports/budget',          user, wrap(reports.getBudget));
// Streams a binary body — HTTP only.
router.get('/reports/export',          user, validateQuery(s.exportQuerySchema), wrap(exportCtrl.exportReport));

// ----------------------------------------------------------------- budgets
router.get('/budgets',        user, wrap(budgets.listBudgets));
router.put('/budgets',        user, validate(s.budgetSchema), wrap(budgets.setBudget));
router.delete('/budgets/:id', user, wrap(budgets.deleteBudget));

// ----------------------------------------------------------- notifications
router.get('/notifications',           user, wrap(notifications.listNotifications));
router.put('/notifications/read-all',  user, wrap(notifications.markAllRead));
router.put('/notifications/:id/read',  user, wrap(notifications.markRead));
router.delete('/notifications/:id',    user, wrap(notifications.deleteNotification));
// Web Push: one subscription per browser the user allows notifications in.
router.post('/notifications/subscribe',   user, wrap(notifications.subscribe));
router.post('/notifications/unsubscribe', user, wrap(notifications.unsubscribe));

// ------------------------------------------------------------------- admin
const adminOnly = [authenticate, requireAdmin];

router.get('/admin/stats',  adminOnly, wrap(admin.getStats));
router.get('/admin/users',  adminOnly, wrap(admin.listUsers));
router.get('/admin/users/:id', adminOnly, wrap(admin.getUser));
router.put('/admin/users/:id/status',   adminOnly, validate(s.setUserStatusSchema),   wrap(admin.setUserStatus));
router.put('/admin/users/:id/password', adminOnly, validate(s.setUserPasswordSchema), wrap(admin.setUserPassword));
router.delete('/admin/users/:id',       adminOnly, wrap(admin.deleteUser));

router.get('/admin/maintenance', adminOnly, wrap(admin.getMaintenanceState));
router.put('/admin/maintenance', adminOnly, validate(s.maintenanceSchema), wrap(admin.setMaintenance));

router.get('/admin/broadcast/preview', adminOnly, wrap(admin.previewBroadcast));
router.post('/admin/broadcast',        adminOnly, validate(s.broadcastSchema), wrap(admin.sendBroadcast));

router.get('/admin/app/versions',            adminOnly, wrap(admin.listAppVersions));
router.post('/admin/app/version',            adminOnly, apkUpload.single('apk'), wrap(admin.createAppVersion));
router.put('/admin/app/versions/:id/active', adminOnly, wrap(admin.setAppVersionActive));
router.delete('/admin/app/versions/:id',     adminOnly, wrap(admin.deleteAppVersion));

router.get('/admin/audit',    adminOnly, wrap(admin.listAuditLog));
router.get('/admin/settings', adminOnly, wrap(admin.getSettings));
router.put('/admin/settings', adminOnly, wrap(admin.updateSetting));

module.exports = router;
