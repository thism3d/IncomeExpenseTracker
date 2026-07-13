// BulkSMSBD gateway. Numbers must already be canonical (8801XXXXXXXXX).

const sendSMS = async (number, message) => {
    const apiKey = process.env.BULKSMSBD_API_KEY;
    const senderId = process.env.BULKSMSBD_SENDER_ID;
    const url = process.env.BULKSMSBD_URL || 'http://bulksmsbd.net/api/smsapi';

    if (!apiKey || !senderId) {
        console.error('SMS not configured: BULKSMSBD_API_KEY or BULKSMSBD_SENDER_ID missing');
        return false;
    }

    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ api_key: apiKey, senderid: senderId, number, message }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.response_code === 202) return true;
        console.error('SMS send failed:', JSON.stringify(data));
        return false;
    } catch (err) {
        console.error('SMS send error:', err.message);
        return false;
    }
};

const sendOtpSMS = (number, code) =>
    sendSMS(number, `Your SISIRBINDU TRACKERAPP verification code is ${code}. It expires in 15 minutes. Do not share it with anyone.`);

module.exports = { sendSMS, sendOtpSMS };
