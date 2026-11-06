import { createHash } from 'node:crypto';
import { invalid } from './errors.js';

export type Json = null | boolean | number | string | Json[] | JsonObject;
export interface JsonObject { [key: string]: Json }
export interface SourceEvent {
  type: string;
  event: string;
  messageId: string;
  deviceId: string;
  timestamp: string;
  receivedAt?: string;
  userId?: string;
  properties?: JsonObject;
  context?: JsonObject;
}
export interface VendorPayload {
  event_name: string;
  event_time: number;
  messageId: string;
  device_id: string;
  customer_user_id?: string;
  event_value?: JsonObject;
  app_version?: string;
  platform?: string;
}

export const ELIGIBLE_EVENTS = new Set([
  'purchase', 'complete_registration', 'subscription_started', 'credits_spent',
  'match_created', 'message_sent', 'push_opened',
]);
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function json(value: unknown, depth = 0): Json {
  if (depth > 20) return invalid('JSON nesting exceeds the supported limit.');
  if (typeof value === 'string') {
    if (value.includes('\0') || /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value)) {
      return invalid('JSON strings must be valid Unicode without null bytes.');
    }
    return value;
  }
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.map(item => json(item, depth + 1));
  if (isObject(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => {
      json(key, depth + 1);
      return [key, json(item, depth + 1)];
    }));
  }
  return invalid('JSON contains an unsupported value.');
}

function object(value: unknown, field: string): JsonObject {
  if (!isObject(value)) return invalid(`${field} must be an object when supplied.`);
  const result = json(value);
  if (!isObject(result)) return invalid(`${field} must be an object.`);
  return result;
}

function text(value: unknown, field: string, max = 256): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) {
    return invalid(`${field} must be a nonblank string of at most ${max} characters.`);
  }
  return value;
}

function instant(value: unknown, field: string, vendorRange: boolean): string {
  if (typeof value !== 'string') return invalid(`${field} must be an ISO8601 instant.`);
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match) return invalid(`${field} must include a valid timezone and at most six fractional digits.`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1] ?? 0;
  const zone = match[8] ?? '';
  const offsetHours = zone === 'Z' ? 0 : Number(zone.slice(1, 3));
  const offsetMinutes = zone === 'Z' ? 0 : Number(zone.slice(4, 6));
  const milliseconds = Date.parse(value);
  if (year < 1 || day < 1 || day > days || Number(match[4]) > 23 ||
      Number(match[5]) > 59 || Number(match[6]) > 59 || offsetHours > 14 ||
      offsetMinutes > 59 || (offsetHours === 14 && offsetMinutes !== 0) ||
      !Number.isFinite(milliseconds) ||
      new Date(milliseconds).getUTCFullYear() < 1 || new Date(milliseconds).getUTCFullYear() > 9999 ||
      (vendorRange && !(milliseconds > 1e12 && milliseconds < 1e13))) {
    return invalid(`${field} is outside the supported timestamp range.`);
  }
  // Date preserves milliseconds; append the remaining microseconds for SQL and
  // canonical identity. The vendor still receives integer epoch milliseconds.
  const remainder = (match[7] ?? '').padEnd(6, '0').slice(3);
  return new Date(milliseconds).toISOString().replace('Z', `${remainder}Z`);
}

export function parseSourceEvent(input: unknown): SourceEvent {
  if (!isObject(input)) return invalid('Supply one source event object.');
  const allowed = new Set(['type', 'event', 'messageId', 'timestamp', 'receivedAt', 'userId', 'deviceId', 'properties', 'context', 'traits']);
  if (Object.keys(input).some(key => !allowed.has(key))) return invalid('Unknown top-level event field.');
  // Validate every supplied branch, including traits that are then discarded.
  json(input);
  if (input['traits'] !== undefined) object(input['traits'], 'traits');
  const result: SourceEvent = {
    type: text(input['type'], 'type', 128),
    event: text(input['event'], 'event', 128),
    messageId: text(input['messageId'], 'messageId'),
    deviceId: text(input['deviceId'], 'deviceId'),
    timestamp: instant(input['timestamp'], 'timestamp', true),
  };
  if (input['receivedAt'] !== undefined) result.receivedAt = instant(input['receivedAt'], 'receivedAt', false);
  if (input['userId'] !== undefined) {
    result.userId = text(input['userId'], 'userId');
    if (!/^\d+$/.test(result.userId) && !UUID.test(result.userId)) return invalid('userId must be a numeric ID or UUID string.');
  }
  if (input['properties'] !== undefined) result.properties = object(input['properties'], 'properties');
  if (input['context'] !== undefined) {
    result.context = object(input['context'], 'context');
    for (const [key, members] of [
      ['app', ['version']], ['device', ['type', 'advertisingId']], ['os', ['name', 'version']],
    ] as const) {
      const branch = result.context[key ?? ''];
      if (branch !== undefined) {
        if (!isObject(branch)) return invalid('App/device metadata must be objects.');
        for (const member of members) {
          const value = branch[member];
          if (value !== undefined) text(value, 'App/device/OS metadata');
        }
      }
    }
    if (result.context['locale'] !== undefined) text(result.context['locale'], 'context.locale');
  }
  return result;
}

function canonical(value: Json): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (isObject(value)) {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key] ?? null)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function fingerprint(event: SourceEvent): string {
  return createHash('sha256').update(canonical(json(event))).digest('hex');
}

export function normalize(event: SourceEvent, profiles: ReadonlyMap<string, string>): VendorPayload | null {
  if (!ELIGIBLE_EVENTS.has(event.event)) return null;
  const payload: VendorPayload = {
    event_name: event.event,
    event_time: Date.parse(event.timestamp),
    messageId: event.messageId,
    device_id: event.deviceId,
  };
  const customer = event.userId === undefined ? undefined :
    /^\d+$/.test(event.userId) ? event.userId : profiles.get(event.userId.toLowerCase());
  if (customer !== undefined) payload.customer_user_id = customer;
  if (event.properties !== undefined) payload.event_value = event.properties;
  const app = event.context?.['app'];
  const device = event.context?.['device'];
  if (isObject(app) && typeof app['version'] === 'string') payload.app_version = app['version'];
  if (isObject(device) && typeof device['type'] === 'string') payload.platform = device['type'];
  return payload;
}

export function parseProfiles(value: unknown): Map<string, string> {
  if (!isObject(value)) throw new Error('Invalid profile source');
  const profiles = new Map<string, string>();
  for (const [key, profile] of Object.entries(value)) {
    if (!UUID.test(key) || typeof profile !== 'string' || !/^\d+$/.test(profile) || profile.length > 256) throw new Error('Invalid profile source');
    profiles.set(key.toLowerCase(), profile);
  }
  return profiles;
}

export function validSnapshot(value: unknown, messageId: string): value is VendorPayload {
  if (!isObject(value) || typeof value['event_name'] !== 'string' || !ELIGIBLE_EVENTS.has(value['event_name']) ||
      value['messageId'] !== messageId || typeof value['device_id'] !== 'string' || !value['device_id'].trim() ||
      typeof value['event_time'] !== 'number' || !Number.isInteger(value['event_time']) ||
      !(value['event_time'] > 1e12 && value['event_time'] < 1e13)) return false;
  const keys = new Set(['event_name', 'event_time', 'messageId', 'device_id', 'customer_user_id', 'event_value', 'app_version', 'platform']);
  if (Object.keys(value).some(key => !keys.has(key))) return false;
  if (value['customer_user_id'] !== undefined && (typeof value['customer_user_id'] !== 'string' || !/^\d+$/.test(value['customer_user_id']))) return false;
  if (value['event_value'] !== undefined && !isObject(value['event_value'])) return false;
  try { json(value); } catch { return false; } // Invalid persisted JSON is never forwarded.
  return ['app_version', 'platform'].every(key => value[key] === undefined || typeof value[key] === 'string');
}
