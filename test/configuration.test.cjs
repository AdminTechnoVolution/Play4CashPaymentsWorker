const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateEnvironment, createHealthHandler } = require('../dist/configuration.js');
const base = () => ({ FINANCE_V2_ENABLED: 'true', MONGO_URI: 'mongodb://localhost/test',
  NOWPAYMENTS_BASE_URL: 'https://api-sandbox.nowpayments.io/v1',
  PAYMENTS_DEPOSITS_ENABLED: 'false', PAYMENTS_WITHDRAWALS_ENABLED: 'false' });
test('disabled sandbox starts without payout secrets; worker flag is internal', () => {
  const env = base(); validateEnvironment(env); assert.equal(env.PAYMENTS_WORKER, 'true');
});
test('production provider is blocked even if deployment NODE_ENV is production', () => {
  assert.throws(() => validateEnvironment({ ...base(), NODE_ENV: 'production', NOWPAYMENTS_BASE_URL: 'https://api.nowpayments.io/v1' }), /sandbox/);
});
test('new payouts cannot start without authorization credentials', () => {
  const env = { ...base(), PAYMENTS_WITHDRAWALS_ENABLED: 'true', NOWPAYMENTS_API_KEY: 'test',
    NOWPAYMENTS_IPN_URL: 'https://gateway.example/api/payments/ipn/nowpayments'};
  assert.throws(() => validateEnvironment(env), /PAYOUT_EMAIL/);
  assert.throws(() => validateEnvironment({ ...env, NOWPAYMENTS_PAYOUT_EMAIL: 'test' }), /PAYOUT_PASSWORD/);
  assert.throws(() => validateEnvironment({ ...env, NOWPAYMENTS_PAYOUT_EMAIL: 'test', NOWPAYMENTS_PAYOUT_PASSWORD: 'test' }), /PAYOUT_TOTP_SECRET/);
});
test('health fails closed without disclosing database errors or credentials', async () => {
  const handler = createHealthHandler(async () => { throw new Error('mongodb://secret'); });
  let status, body;
  const res = { writeHead(code) { status = code; return this; }, end(data) { body = data; } };
  await handler({ method: 'GET', url: '/health' }, res);
  assert.equal(status, 503); assert.equal(body, '{"status":"unavailable"}');
});
test('health exposes no payment actions and reports readiness', async () => {
  let status, body;
  const res = { writeHead(code) { status = code; return this; }, end(data) { body = data; } };
  const handler = createHealthHandler(async () => true);
  await handler({ method: 'POST', url: '/payout' }, res); assert.equal(status, 404);
  await handler({ method: 'GET', url: '/health' }, res); assert.equal(status, 200); assert.equal(body, '{"status":"ok"}');
});

test('sandbox deposits start without country, KYC, geo or custom network settings', () => {
  const env = { ...base(), PAYMENTS_DEPOSITS_ENABLED: 'true', NOWPAYMENTS_API_KEY: 'fixture',
    NOWPAYMENTS_IPN_URL: 'https://gateway.example/api/payments/ipn/nowpayments' };
  validateEnvironment(env);
  assert.equal(env.PAYMENTS_WORKER, 'true');
});
test('invalid sandbox scenarios fail before schedules start', () => {
  assert.throws(() => validateEnvironment({ ...base(), NOWPAYMENTS_SANDBOX_CASE: 'invalid' }), /SANDBOX_CASE/);
});
