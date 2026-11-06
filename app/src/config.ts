export interface Config {
  port: number;
  database: {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
  };
  vendorBaseUrl: string;
  profilesPath: string;
  vendorTimeoutMs: number;
  vendorMaxAttempts: number;
  requestTimeoutMs: number;
}

function required(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key];
  if (!value?.trim()) throw new Error(`Missing configuration: ${key}`);
  return value;
}

function port(value: string, key: string): number {
  if (!/^\d+$/.test(value)) throw new Error(`Invalid configuration: ${key}`);
  const result = Number(value);
  if (!Number.isInteger(result) || result < 1 || result > 65535) {
    throw new Error(`Invalid configuration: ${key}`);
  }
  return result;
}

function integer(env: NodeJS.ProcessEnv, key: string, fallback: number, min: number, max: number): number {
  const raw = env[key] ?? String(fallback);
  const value = Number(raw);
  if (!/^\d+$/.test(raw) || !Number.isInteger(value) || value < min || value > max) {
    throw new Error(`Invalid configuration: ${key}`);
  }
  return value;
}

export function loadConfig(env: NodeJS.ProcessEnv): Config {
  const rawVendorUrl = required(env, 'VENDOR_BASE_URL');
  let vendor: URL;
  try {
    vendor = new URL(rawVendorUrl);
  } catch {
    throw new Error('Invalid configuration: VENDOR_BASE_URL');
  }
  if (!['http:', 'https:'].includes(vendor.protocol) || vendor.username ||
      vendor.password || vendor.search || vendor.hash || vendor.pathname !== '/') {
    throw new Error('Invalid configuration: VENDOR_BASE_URL');
  }
  return {
    port: port(env['PORT'] ?? '3000', 'PORT'),
    database: {
      host: required(env, 'PGHOST'),
      port: port(env['PGPORT'] ?? '5432', 'PGPORT'),
      database: required(env, 'PGDATABASE'),
      user: required(env, 'PGUSER'),
      password: required(env, 'PGPASSWORD'),
    },
    vendorBaseUrl: vendor.origin,
    profilesPath: env['PROFILES_PATH'] ?? '/app/data/profiles.json',
    vendorTimeoutMs: integer(env, 'VENDOR_TIMEOUT_MS', 2000, 20, 5000),
    vendorMaxAttempts: integer(env, 'VENDOR_MAX_ATTEMPTS', 3, 1, 5),
    requestTimeoutMs: integer(env, 'REQUEST_TIMEOUT_MS', 15000, 1000, 20000),
  };
}
