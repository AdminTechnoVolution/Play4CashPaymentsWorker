import { DEFAULT_USDT_NETWORKS } from './shared/modules/payments/payments-policy.service';
import type { IncomingMessage, ServerResponse } from 'node:http';

export class ConfigurationError extends Error {}

/** Validate before Nest starts timers or creates a database connection. */
export function validateEnvironment(env: NodeJS.ProcessEnv): void {
  if (env.FINANCE_V2_ENABLED !== 'true') throw new ConfigurationError('FINANCE_V2_ENABLED debe ser true');
  if (!env.MONGO_URI) throw new ConfigurationError('Falta MONGO_URI: copiar conexión MongoDB de la API');
  if (env.NOWPAYMENTS_BASE_URL !== 'https://api-sandbox.nowpayments.io/v1') {
    throw new ConfigurationError('Esta versión solo permite NOWPayments sandbox');
  }
  for (const flag of ['PAYMENTS_DEPOSITS_ENABLED', 'PAYMENTS_WITHDRAWALS_ENABLED']) {
    if (!['true', 'false'].includes(env[flag] ?? '')) throw new ConfigurationError(`${flag} debe ser true o false`);
  }
  const enabled = env.PAYMENTS_DEPOSITS_ENABLED === 'true' || env.PAYMENTS_WITHDRAWALS_ENABLED === 'true';
  if (enabled) {
    for (const key of ['NOWPAYMENTS_API_KEY', 'NOWPAYMENTS_IPN_URL']) {
      if (!env[key]) throw new ConfigurationError(`Falta ${key} para habilitar pagos sandbox`);
    }
    let url: URL;
    try { url = new URL(env.NOWPAYMENTS_IPN_URL!); } catch { throw new ConfigurationError('NOWPAYMENTS_IPN_URL debe ser una URL HTTPS'); }
    if (url.protocol !== 'https:' || url.username || url.password) throw new ConfigurationError('IPN requiere URL HTTPS pública');
    let networks: Record<string, unknown>;
    try { networks = JSON.parse(JSON.stringify(DEFAULT_USDT_NETWORKS)); } catch { throw new ConfigurationError('DEFAULT_USDT_NETWORKS debe ser JSON válido'); }
    if (!networks || Array.isArray(networks) || typeof networks !== 'object' || Object.keys(networks).length === 0) {
      throw new ConfigurationError('Configurar al menos una red USDT verificada');
    }
  }
  if (env.PAYMENTS_WITHDRAWALS_ENABLED === 'true') {
    for (const key of ['NOWPAYMENTS_PAYOUT_EMAIL', 'NOWPAYMENTS_PAYOUT_PASSWORD', 'NOWPAYMENTS_PAYOUT_TOTP_SECRET']) {
      if (!env[key]) throw new ConfigurationError(`Falta ${key} para habilitar retiros sandbox`);
    }
  }
  if (!['success', 'common', 'failed', 'partially_paid'].includes(env.NOWPAYMENTS_SANDBOX_CASE || 'success')) {
    throw new ConfigurationError('NOWPAYMENTS_SANDBOX_CASE debe ser success, common, failed o partially_paid');
  }
  // Internal implementation flag, deliberately not another setting for the operator.
  env.PAYMENTS_WORKER = 'true';
}

export function createHealthHandler(ready: () => Promise<boolean>) {
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    if (req.method !== 'GET' || !['/', '/health'].includes(req.url ?? '')) {
      res.writeHead(404).end();
      return;
    }
    let healthy = false;
    try { healthy = await ready(); } catch { /* No dependency details or secrets in public responses. */ }
    res.writeHead(healthy ? 200 : 503, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ status: healthy ? 'ok' : 'unavailable' }));
  };
}
