import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { ApiError } from './errors.js';
import { fingerprint } from './events.js';
import type { SourceEvent, VendorPayload } from './events.js';

export type DeliveryStatus = 'pending' | 'sending' | 'delivered' | 'skipped' |
  'retryable_failed' | 'permanent_failed' | 'uncertain';
export interface Delivery {
  event_id: string;
  message_id: string;
  source_hash: string;
  vendor_payload: unknown;
  status: DeliveryStatus;
  attempts: number;
  lease_token: string | null;
  last_http_status: number | null;
  error_code: string | null;
}
export interface VendorOutcome {
  status: 'delivered' | 'retryable_failed' | 'permanent_failed' | 'uncertain';
  httpStatus: number | null;
  errorCode: string | null;
}
const columns = 'd.*, e.message_id';
function persistenceFailure(): never {
  throw new ApiError(503, 'PERSISTENCE_ERROR', 'Persistence could not be confirmed.');
}

export class EventRepository {
  constructor(private readonly pool: Pool) {}

  async accept(event: SourceEvent, payload: VendorPayload | null): Promise<{ delivery: Delivery; created: boolean }> {
    const client = await this.pool.connect().catch(persistenceFailure);
    let destroy = false;
    try {
      await client.query('BEGIN');
      await client.query("SET LOCAL transaction_timeout = '5s'");
      await client.query("SET LOCAL lock_timeout = '1s'");
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO public.events
          (event_type, event_name, message_id, occurred_at, received_at, user_id, device_id, properties, context)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (message_id) DO NOTHING RETURNING id`,
        [event.type, event.event, event.messageId, event.timestamp, event.receivedAt ?? null,
          event.userId ?? null, event.deviceId, event.properties ?? null, event.context ?? null],
      );
      const id = inserted.rows[0]?.id;
      const hash = fingerprint(event);
      if (id !== undefined) {
        await client.query(
          `INSERT INTO public.event_deliveries (event_id, source_hash, vendor_payload, status)
           VALUES ($1,$2,$3,$4)`, [id, hash, payload, payload === null ? 'skipped' : 'pending'],
        );
      }
      const result = await client.query<Delivery>(
        `SELECT ${columns} FROM public.events e
         LEFT JOIN public.event_deliveries d ON d.event_id=e.id WHERE e.message_id=$1`, [event.messageId],
      );
      const delivery = result.rows[0];
      if (!delivery || !delivery.event_id) throw new ApiError(409, 'EVENT_NOT_TRACKED', 'Existing event requires reconciliation.');
      if (delivery.source_hash !== hash) throw new ApiError(409, 'MESSAGE_ID_CONFLICT', 'messageId is already used by different event content.');
      await client.query('COMMIT');
      return { delivery, created: id !== undefined };
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // A terminated/ambiguous transaction is never authorization to send.
        destroy = true;
        return persistenceFailure();
      }
      if (error instanceof ApiError) throw error;
      return persistenceFailure();
    } finally {
      client.release(destroy);
    }
  }

  async get(id: string): Promise<Delivery> {
    const { rows } = await this.pool.query<Delivery>(
      `SELECT ${columns} FROM public.event_deliveries d JOIN public.events e ON e.id=d.event_id WHERE d.event_id=$1`, [id],
    ).catch(persistenceFailure);
    if (!rows[0]) throw new ApiError(404, 'EVENT_NOT_FOUND', 'Event not found.');
    return rows[0];
  }

  async claim(id: string): Promise<Delivery | null> {
    const { rows } = await this.pool.query<Delivery>(
      `UPDATE public.event_deliveries d SET status='sending', lease_token=$2,
         lease_expires_at=clock_timestamp()+interval '60 seconds', error_code=NULL, updated_at=clock_timestamp()
       FROM public.events e WHERE d.event_id=$1 AND e.id=d.event_id AND
         (d.status IN ('pending','retryable_failed','uncertain') OR
          (d.status='sending' AND d.lease_expires_at < clock_timestamp()))
       RETURNING ${columns}`, [id, randomUUID()],
    ).catch(persistenceFailure);
    return rows[0] ?? null;
  }

  async recordAttempt(id: string, token: string): Promise<void> {
    const result = await this.pool.query(
      `UPDATE public.event_deliveries SET attempts=attempts+1,
         last_attempt_at=clock_timestamp(), updated_at=clock_timestamp()
       WHERE event_id=$1 AND lease_token=$2 AND status='sending' AND lease_expires_at>clock_timestamp()`, [id, token],
    ).catch(persistenceFailure);
    if (result.rowCount !== 1) throw new ApiError(409, 'DELIVERY_OWNERSHIP_LOST', 'Delivery ownership changed; check its saved status.');
  }

  async finish(id: string, token: string, outcome: VendorOutcome): Promise<Delivery> {
    const result = await this.pool.query(
      `UPDATE public.event_deliveries SET status=$3, last_http_status=$4, error_code=$5,
         delivered_at=CASE WHEN $3='delivered' THEN clock_timestamp() ELSE NULL END,
         lease_token=NULL, lease_expires_at=NULL, updated_at=clock_timestamp()
       WHERE event_id=$1 AND lease_token=$2 AND status='sending'`,
      [id, token, outcome.status, outcome.httpStatus, outcome.errorCode],
    ).catch(persistenceFailure);
    if (result.rowCount !== 1) throw new ApiError(409, 'DELIVERY_OWNERSHIP_LOST', 'Delivery ownership changed; check its saved status.');
    return this.get(id);
  }
}
