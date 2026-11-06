# Local environment and configuration

API and PostgreSQL run in separate containers on one Compose bridge network; the vendor runs on the host. Compose and app source live in app/. Run make commands from the project root; underlying commands execute from app/.

make init creates app/.env once with distinct random 64-character hexadecimal database passwords and mode 0600. make up invokes it automatically. Existing configuration is preserved. app/.env is ignored by Git and excluded from the Docker build context. app/.env.example is a sanitized template, not a credential source for shared deployment.

| Variable | Type / validation | Source / default | Secret? |
| --- | --- | --- | --- |
| POSTGRES_PASSWORD | Nonempty string | Generated app/.env; PostgreSQL bootstrap administrator only | Yes |
| APP_DB_PASSWORD | Nonempty string | Generated app/.env; initializes event_relay_app and supplies API PGPASSWORD | Yes |
| API_PORT | Host TCP port 1–65535 | app/.env; 3000; published only on 127.0.0.1 | No |
| VENDOR_BASE_URL | HTTP(S) origin; no credentials, path beyond /, query, or fragment | app/.env; http://host.docker.internal:9000 | No; must never contain credentials |
| NODE_ENV | String | Compose sets production | No |
| PORT | Integer 1–65535 | Compose sets 3000, API binds 0.0.0.0 within container | No |
| PGHOST | Nonempty string | Compose sets db | No |
| PGPORT | Integer 1–65535 | Compose sets 5432 | No |
| PGDATABASE | Nonempty string | Compose sets event_relay | No |
| PGUSER | Nonempty string | Compose sets event_relay_app (non-superuser) | No |
| PGPASSWORD | Nonempty string | Compose supplies APP_DB_PASSWORD to API | Yes |
| POSTGRES_DB | Nonempty string | Compose sets event_relay for DB initialization | No |
| POSTGRES_USER | Nonempty string | Compose sets postgres for DB bootstrap; never the API user | No |

The API validates its runtime settings before listening. The pool is bounded to 5 connections with 2-second connection timeout, 10-second idle timeout, 3-second statement timeout and 3.5-second client query timeout. The read-only vendor probe has a 3-second total timeout and does not follow redirects. These are infrastructure controls, not a product delivery policy.

## Persistence and credentials

The PostgreSQL 18 named volume mounts at /var/lib/postgresql. db/init-app-role.sql runs only when that volume is first initialized; it creates the non-superuser application role and grants database/schema access. It creates no event tables; the reviewed source-event schema is applied separately by make db-migrate. That migration is transactional and version-guarded, so it also upgrades an existing volume without recreating it. Do not remove app/.env while retaining the volume: generating new passwords does not rotate passwords in an existing database. Rotate explicitly through PostgreSQL if needed; never discard the volume as an ordinary troubleshooting step.

Use make psql to inspect the database without publishing its port. Ordinary make down preserves the named volume. Destructive volume deletion is never part of ordinary stop/start commands.

## Vendor routing

Start the fixed host process with make vendor in a separate terminal. Docker Desktop supplies host.docker.internal. The API uses http://host.docker.internal:9000; localhost inside api refers to api, not the host. See [infrastructure.md](infrastructure.md) for the loopback-binding caveat. make vendor-check performs only GET /_stats from the API container and requires strict=true; it never sends events or changes vendor controls.

For plain Linux Engine, use the optional app/compose.linux.yaml override to map the host gateway. A loopback-only host listener may still require the restricted host relay described in infrastructure.md. Override VENDOR_BASE_URL to the relay's origin only when required; document its actual binding and cleanup. Do not make vendor controls publicly reachable.

Local HTTP is intentional for the exercise. Production secrets delivery, TLS, retention, and public access are outside this bounded setup.

## Event API settings

| Variable | Default / validation | Purpose |
| --- | --- | --- |
| PROFILES_PATH | /app/data/profiles.json; readable valid lookup file, max1MiB | Compose mounts root profiles.json read-only. Loaded and validated once at startup; invalid/unavailable source fails startup rather than acting as an empty map. |
| VENDOR_TIMEOUT_MS | 2000; integer20–5000 | Timeout for each direct vendor attempt. |
| VENDOR_MAX_ATTEMPTS | 3; integer1–5 | Per-request attempt bound; durable attempts remains cumulative across explicit retries. |
| REQUEST_TIMEOUT_MS | 15000; integer1000–20000 | Processing cancellation budget; cancels vendor calls/backoff. DB operations/final outcome recording are separately bounded/awaited. |

Fixed controls:64KiB JSON body, nesting20, vendor response8KiB,16 active event routes, retry jitter base100ms/cap1000ms and rate-limit waits capped5seconds within cancellation budget,60-second claim lease. API drains up to20seconds on shutdown; Compose grace25seconds. These are POC implementation choices recorded with the user's explicit build request, not production SLO claims.

Before API startup, migrations001/002 must exist; readiness checks access to the source/delivery tables and columns. make up orchestrates DB readiness → migrations → API startup; health remains independent. Changing a local .env setting takes effect after recreating api. No application setting may be sourced from an incoming request, especially the vendor URL.
