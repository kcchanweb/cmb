\set ON_ERROR_STOP on

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SELECT pg_advisory_xact_lock(1129136720, 1);

CREATE TABLE IF NOT EXISTS public.schema_migrations (
    version text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

SELECT EXISTS (
    SELECT 1 FROM public.schema_migrations WHERE version = '001_create_events'
) AS migration_applied \gset

\if :migration_applied
    \echo Migration 001_create_events already applied.
\else
    CREATE TABLE public.events (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        event_type text NOT NULL,
        event_name text NOT NULL,
        message_id text NOT NULL,
        occurred_at timestamptz NOT NULL,
        received_at timestamptz,
        user_id text,
        device_id text NOT NULL,
        properties jsonb,
        context jsonb,

        CONSTRAINT events_message_id_key UNIQUE (message_id),
        CONSTRAINT events_type_nonblank CHECK (event_type ~ '[^[:space:]]'),
        CONSTRAINT events_name_nonblank CHECK (event_name ~ '[^[:space:]]'),
        CONSTRAINT events_message_id_nonblank CHECK (message_id ~ '[^[:space:]]'),
        CONSTRAINT events_device_id_nonblank CHECK (device_id ~ '[^[:space:]]'),
        CONSTRAINT events_user_id_nonblank CHECK (
            user_id IS NULL OR user_id ~ '[^[:space:]]'
        ),
        CONSTRAINT events_occurred_at_finite CHECK (isfinite(occurred_at)),
        CONSTRAINT events_received_at_finite CHECK (
            received_at IS NULL OR isfinite(received_at)
        ),
        CONSTRAINT events_properties_object CHECK (
            properties IS NULL OR jsonb_typeof(properties) = 'object'
        ),
        CONSTRAINT events_context_object CHECK (
            context IS NULL OR jsonb_typeof(context) = 'object'
        )
    );

    COMMENT ON COLUMN public.events.id IS
        'Internal UUID row identifier; never replaces source messageId.';
    COMMENT ON COLUMN public.events.message_id IS
        'Source messageId, unchanged; unique event identity for deduplication.';
    COMMENT ON COLUMN public.events.occurred_at IS
        'Source timestamp as an instant; never derived from receivedAt.';
    COMMENT ON COLUMN public.events.received_at IS
        'Source receivedAt when supplied; not the database insertion time.';
    COMMENT ON COLUMN public.events.context IS
        'Source metadata may contain advertising identifiers; do not log or forward raw context.';

    INSERT INTO public.schema_migrations (version) VALUES ('001_create_events');
\endif

COMMIT;
