import { setTimeout as delay } from 'node:timers/promises';
import { randomUUID } from 'node:crypto';
import { isObject } from './events.js';
import type { VendorPayload } from './events.js';
import type { VendorOutcome } from './repository.js';

export interface VendorOptions { timeoutMs: number; maxAttempts: number; retryBaseMs: number }

async function body(response: Response): Promise<unknown> {
  if (!response.body) return null;
  const reader = response.body.getReader();
  const parts: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    length += chunk.value.byteLength;
    if (length > 8192) { await reader.cancel(); return null; }
    parts.push(chunk.value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) { bytes.set(part, offset); offset += part.byteLength; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); }
  catch { return null; } // Explicitly classified as an invalid acknowledgement.
}

export class VendorClient {
  constructor(
    private readonly baseUrl: string,
    private readonly options: VendorOptions,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async send(payload: VendorPayload, signal: AbortSignal, beforeAttempt: () => Promise<void>, requestId: string = randomUUID()): Promise<VendorOutcome> {
    let outcome: VendorOutcome = { status: 'retryable_failed', httpStatus: null, errorCode: 'request_deadline' };
    for (let attempt = 0; attempt < this.options.maxAttempts; attempt += 1) {
      if (signal.aborted) return outcome;
      await beforeAttempt();
      if (signal.aborted) return outcome;
      let retryAfter = 0;
      try {
        const response = await this.fetcher(new URL('/events', this.baseUrl), {
          method: 'POST', redirect: 'error',
          headers: { 'Content-Type': 'application/json', 'X-Request-ID': requestId },
          body: JSON.stringify(payload),
          signal: AbortSignal.any([signal, AbortSignal.timeout(this.options.timeoutMs)]),
        });
        const parsed = await body(response);
        if (response.ok) {
          if (isObject(parsed) && parsed['accepted'] === 1) return { status: 'delivered', httpStatus: response.status, errorCode: null };
          return { status: 'uncertain', httpStatus: response.status, errorCode: 'invalid_vendor_response' };
        }
        if (![429, 500, 502, 503, 504].includes(response.status)) {
          return { status: 'permanent_failed', httpStatus: response.status, errorCode: 'vendor_rejected' };
        }
        outcome = { status: 'retryable_failed', httpStatus: response.status, errorCode: response.status === 429 ? 'vendor_rate_limited' : 'vendor_unavailable' };
        if (response.status === 429) {
          const raw = response.headers.get('Retry-After');
          const value = raw === null && isObject(parsed) ? parsed['retry_after'] : raw;
          if ((typeof value === 'number' || typeof value === 'string') && Number.isFinite(Number(value)) && Number(value) >= 0) {
            retryAfter = Number(value) * 1000;
          }
        }
      } catch {
        // The request might have been accepted even when its response was lost.
        outcome = { status: 'uncertain', httpStatus: null, errorCode: 'vendor_network_or_timeout' };
      }
      if (attempt + 1 === this.options.maxAttempts || signal.aborted) return outcome;
      const backoff = Math.min(1000, this.options.retryBaseMs * 2 ** attempt) * (0.5 + Math.random() * 0.5);
      // Long rate-limit delays are retained for explicit recovery, not slept out.
      if (retryAfter > 5000) return outcome;
      try { await delay(Math.max(retryAfter, backoff), undefined, { signal }); }
      catch { return outcome; }
    }
    return outcome;
  }
}
