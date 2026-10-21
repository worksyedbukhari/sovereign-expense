'use strict';
const DEVELOPMENT_ORIGINS = ['http://localhost:3000','http://127.0.0.1:3000'];
function configuredOrigins(env = process.env) {
  const origins = (env.CORS_ORIGINS || '').split(',').map(v => v.trim()).filter(Boolean);
  if (env.NODE_ENV !== 'production') origins.push(...DEVELOPMENT_ORIGINS);
  return new Set(origins);
}
function permittedOrigin(origin, host, origins = configuredOrigins()) {
  if (!origin) return true; // Native API clients do not send an Origin header.
  if (origins.has(origin)) return true;
  if (typeof host !== 'string' || !host) return false;
  try {
    const parsed = new URL(origin);
    return (parsed.protocol === 'https:' || parsed.protocol === 'http:') && parsed.host === host;
  } catch (_) {
    return false;
  }
}
module.exports = { configuredOrigins, permittedOrigin };
