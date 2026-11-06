import { ApiError } from './errors.js';
import { normalize, validSnapshot } from './events.js';
import type { SourceEvent } from './events.js';
import { EventRepository } from './repository.js';
import type { Delivery } from './repository.js';
import { VendorClient } from './vendor.js';

export interface EventResult {
  eventId: string;
  messageId: string;
  status: Delivery['status'];
  duplicate: boolean;
  attempts: number;
  vendorStatus: number | null;
  errorCode: string | null;
}
export interface ActionResult { httpStatus: number; result: EventResult }
export interface EventActions {
  submit(event: SourceEvent, signal: AbortSignal, requestId?: string): Promise<ActionResult>;
  status(id: string): Promise<EventResult>;
  retry(id: string, signal: AbortSignal, requestId?: string): Promise<ActionResult>;
}

function result(delivery: Delivery, duplicate: boolean): EventResult {
  return {
    eventId: delivery.event_id, messageId: delivery.message_id, status: delivery.status,
    duplicate, attempts: delivery.attempts, vendorStatus: delivery.last_http_status, errorCode: delivery.error_code,
  };
}

function response(delivery: Delivery, duplicate: boolean, created = false): ActionResult {
  const status = delivery.status;
  const httpStatus = status === 'pending' || status === 'sending' ? 202 : duplicate ? 200 :
    status === 'uncertain' ? 504 : status === 'retryable_failed' ? 503 :
    status === 'permanent_failed' ? 502 : created ? 201 : 200;
  return { httpStatus, result: result(delivery, duplicate) };
}

export class EventService implements EventActions {
  constructor(
    private readonly repository: EventRepository,
    private readonly vendor: VendorClient,
    private readonly profiles: ReadonlyMap<string, string>,
  ) {}

  async submit(event: SourceEvent, signal: AbortSignal, requestId?: string): Promise<ActionResult> {
    const stored = await this.repository.accept(event, normalize(event, this.profiles));
    if (!stored.created || stored.delivery.status === 'skipped' || signal.aborted) {
      return response(stored.delivery, !stored.created, stored.created);
    }
    return this.deliver(stored.delivery.event_id, signal, true, requestId);
  }

  async status(id: string): Promise<EventResult> { return result(await this.repository.get(id), false); }

  async retry(id: string, signal: AbortSignal, requestId?: string): Promise<ActionResult> {
    const stored = await this.repository.get(id);
    if (['delivered', 'skipped', 'permanent_failed'].includes(stored.status) || signal.aborted) return response(stored, true);
    return this.deliver(id, signal, false, requestId);
  }

  private async deliver(id: string, signal: AbortSignal, created: boolean, requestId?: string): Promise<ActionResult> {
    const claimed = await this.repository.claim(id);
    if (!claimed) return response(await this.repository.get(id), true);
    const token = claimed.lease_token;
    if (!token) throw new ApiError(503, 'PERSISTENCE_ERROR', 'Delivery claim could not be confirmed.');
    const outcome = validSnapshot(claimed.vendor_payload, claimed.message_id)
      ? await this.vendor.send(claimed.vendor_payload, signal, () => this.repository.recordAttempt(id, token), requestId)
      : { status: 'permanent_failed' as const, httpStatus: null, errorCode: 'invalid_stored_payload' };
    const saved = await this.repository.finish(id, token, outcome);
    return response(saved, false, created);
  }
}
