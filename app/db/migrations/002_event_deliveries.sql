\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SELECT pg_advisory_xact_lock(1129136720, 1);

SELECT EXISTS (
    SELECT 1 FROM public.schema_migrations WHERE version = '002_event_deliveries'
) AS migration_applied \gset
\if :migration_applied
    \echo Migration 002_event_deliveries already applied.
\else
    CREATE TABLE public.event_deliveries (
        event_id uuid PRIMARY KEY REFERENCES public.events(id) ON DELETE RESTRICT,
        source_hash text NOT NULL CHECK (source_hash ~ '^[0-9a-f]{64}$'),
        vendor_payload jsonb,
        status text NOT NULL CHECK (status IN (
            'pending', 'sending', 'delivered', 'skipped',
            'retryable_failed', 'permanent_failed', 'uncertain'
        )),
        attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
        lease_token uuid,
        lease_expires_at timestamptz,
        last_http_status smallint CHECK (last_http_status BETWEEN 100 AND 599),
        error_code text,
        last_attempt_at timestamptz,
        delivered_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT delivery_snapshot CHECK (
            (status = 'skipped' AND vendor_payload IS NULL) OR
            (status <> 'skipped' AND vendor_payload IS NOT NULL AND jsonb_typeof(vendor_payload) = 'object')
        ),
        CONSTRAINT delivery_claim CHECK (
            (status = 'sending' AND lease_token IS NOT NULL AND lease_expires_at IS NOT NULL) OR
            (status <> 'sending' AND lease_token IS NULL AND lease_expires_at IS NULL)
        ),
        CONSTRAINT delivery_confirmation CHECK (
            (status = 'delivered' AND delivered_at IS NOT NULL) OR
            (status <> 'delivered' AND delivered_at IS NULL)
        )
    );
    INSERT INTO public.schema_migrations (version) VALUES ('002_event_deliveries');
\endif
COMMIT;
