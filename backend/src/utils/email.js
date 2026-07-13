const nodemailer = require('nodemailer');

const BRAND = '#0E7C66';
const BRAND_DARK = '#0A5C4C';

const createTransporter = () => {
    const port = parseInt(process.env.SMTP_PORT, 10) || 465;
    return nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port,
        secure: port === 465,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
};

/**
 * @param {Array} [attachments] nodemailer attachments — used to hang the monthly
 *                              statement PDF off the summary email.
 */
const sendEmail = async (to, subject, html, attachments = null) => {
    if (!process.env.SMTP_HOST) {
        console.error('Email not configured: SMTP_HOST missing');
        return false;
    }
    try {
        const transporter = createTransporter();
        await transporter.sendMail({
            from: `"${process.env.SMTP_FROM_NAME || 'SISIRBINDU TRACKERAPP'}" <${process.env.SMTP_USER}>`,
            to,
            subject,
            html,
            ...(attachments && attachments.length ? { attachments } : {}),
        });
        return true;
    } catch (err) {
        console.error('Email send failed:', err.message);
        return false;
    }
};

const shell = (title, body) => `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;background:#f4f6f8;padding:32px 16px;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(16,24,40,.08);">
    <div style="background:linear-gradient(135deg,${BRAND},${BRAND_DARK});padding:28px 32px;">
      <h1 style="margin:0;color:#fff;font-size:20px;letter-spacing:.5px;">SISIRBINDU TRACKERAPP</h1>
      <p style="margin:6px 0 0;color:rgba(255,255,255,.75);font-size:13px;">Income &amp; Expense Tracker</p>
    </div>
    <div style="padding:32px;">
      <h2 style="margin:0 0 16px;font-size:18px;color:#101828;">${title}</h2>
      ${body}
    </div>
    <div style="padding:20px 32px;background:#f9fafb;border-top:1px solid #eaecf0;">
      <p style="margin:0;font-size:12px;color:#98a2b3;">This is an automated message — please do not reply.</p>
    </div>
  </div>
</div>`;

const otpBlock = (code) => `
  <div style="margin:24px 0;padding:20px;background:#f0fdf9;border:1px dashed ${BRAND};border-radius:12px;text-align:center;">
    <div style="font-size:34px;font-weight:700;letter-spacing:10px;color:${BRAND_DARK};font-family:monospace;">${code}</div>
  </div>
  <p style="margin:0;font-size:13px;color:#667085;line-height:1.6;">
    This code expires in <strong>15 minutes</strong>. If you did not request it, you can safely ignore this email — but do not share the code with anyone.
  </p>`;

const sendOtpEmail = (to, code, purpose = 'verify your account') =>
    sendEmail(
        to,
        `${code} is your SisirBindu verification code`,
        shell(
            'Verify it\'s you',
            `<p style="margin:0 0 8px;font-size:14px;color:#475467;line-height:1.6;">Use the code below to ${purpose}.</p>${otpBlock(code)}`
        )
    );

const sendPasswordResetOtpEmail = (to, code) =>
    sendEmail(
        to,
        `${code} is your SisirBindu password reset code`,
        shell(
            'Reset your password',
            `<p style="margin:0 0 8px;font-size:14px;color:#475467;line-height:1.6;">Enter this code in the app to set a new password.</p>${otpBlock(code)}`
        )
    );

const sendWelcomeEmail = (to, name) =>
    sendEmail(
        to,
        'Welcome to SISIRBINDU TRACKERAPP',
        shell(
            `Welcome, ${name}`,
            `<p style="margin:0 0 12px;font-size:14px;color:#475467;line-height:1.6;">
                Your account is ready. Track your income and expenses, attach bills, receipts, and voice notes,
                and generate income-tax-ready reports as PDF or Excel whenever you need them.
             </p>
             <p style="margin:0;font-size:14px;color:#475467;line-height:1.6;">
                A default <strong>Personal</strong> account has been created for you — add more accounts any time from the home screen.
             </p>`
        )
    );

module.exports = { sendEmail, sendOtpEmail, sendPasswordResetOtpEmail, sendWelcomeEmail };
