#!/usr/bin/env node
/**
 * Generate a VAPID key pair for Web Push.
 *
 *   node backend/scripts/generate-vapid.js
 *
 * Paste the output into:
 *   backend/.env          VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY
 *   web/.env.production   VITE_VAPID_PUBLIC_KEY   (the PUBLIC one only)
 *
 * The two public keys must match, or browsers will reject the subscription.
 * Generate once and keep them: changing the pair invalidates every existing
 * subscription, and users have to re-grant permission.
 */
const webpush = require('web-push');

const keys = webpush.generateVAPIDKeys();

console.log('');
console.log('  Add to backend/.env:');
console.log('');
console.log(`  VAPID_PUBLIC_KEY=${keys.publicKey}`);
console.log(`  VAPID_PRIVATE_KEY=${keys.privateKey}`);
console.log('');
console.log('  Add to web/.env.production (public key only):');
console.log('');
console.log(`  VITE_VAPID_PUBLIC_KEY=${keys.publicKey}`);
console.log('');
console.log('  Keep the private key secret. Never commit it.');
console.log('');
