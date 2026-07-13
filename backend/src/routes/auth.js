const express = require('express');
const { authenticate } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { wrap } = require('../utils/respond');
const c = require('../controllers/authController');
const s = require('../utils/schemas');

const router = express.Router();

// Registration: send OTP -> verify OTP -> set password.
router.post('/register/send-otp',     validate(s.sendOtpSchema),      wrap(c.registerSendOtp));
router.post('/register/verify-otp',   validate(s.verifyOtpSchema),    wrap(c.registerVerifyOtp));
router.post('/register/set-password', validate(s.setPasswordSchema),  wrap(c.registerSetPassword));

router.post('/login',           validate(s.loginSchema),          wrap(c.login));
router.post('/forgot-password', validate(s.forgotPasswordSchema),  wrap(c.forgotPassword));
router.post('/reset-password',  validate(s.resetPasswordSchema),   wrap(c.resetPassword));

// App lock (biometric / PIN) — mandatory setup after first login.
router.post('/lock/setup',      authenticate, validate(s.setupLockSchema),  wrap(c.setupLock));
router.post('/lock/verify-pin', authenticate, validate(s.verifyPinSchema),  wrap(c.verifyPin));
router.put('/lock',             authenticate, validate(s.updateLockSchema), wrap(c.updateLock));

router.get('/me',        authenticate, wrap(c.me));
router.put('/me',        authenticate, validate(s.updateProfileSchema),  wrap(c.updateProfile));
router.put('/password',  authenticate, validate(s.changePasswordSchema), wrap(c.changePassword));

module.exports = router;
