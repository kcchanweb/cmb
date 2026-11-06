# Testing strategy and actual evidence

Use Node's built-in test runner and the existing pg dependency. No frontend/browser suite applies to this API-only POC. Run from the project root; underlying commands execute in app/.

| Command | Scope | Actual result |
| --- | --- | --- |
| make test | All selected suites below | Individual suites verified; top-level wrapper dry-run verified |
| make test-backend / npm test from app/ | Strict TS build and unit/HTTP/config boundaries |17 tests passed; pinned Node build/integration also passed |
| make test-db | Real PostgreSQL source-schema constraints; synthetic inserts rolled back |24 checks passed after delivery migration |
| make test-integration | New isolated DB, both migrations, temporary test HTTP vendor |10 scenarios /11 node:test entries passed; isolated DB dropped in finally |
| make vendor-check | Read-only strict host-vendor reachability |Passed from api container |
| make config | Quiet Compose validation |Passed; no credential output |

make test includes unit, schema and isolated integration targets. Schema tests require migrations, which their Make dependency applies. The integration wrapper creates only a randomly named app-owned verification database and removes that database on exit; SQL fault injection never runs in user data. Root make up invokes DB readiness and migrations before API startup. No test suite resets the main vendor's controls.

Unit/HTTP coverage: seven-name eligibility, numeric/mapped/unmapped/anonymous IDs, occurrence-time and microsecond handling, canonical source hashing, ignored traits, safe vendor projection, invalid calendar/Unicode/null/JSON/depth/body inputs, conflict-related identity, permanent/transient classification, retries/rate delays, oversized/invalid acknowledgements, admission overload, safe errors and configuration.

Real DB/HTTP scenarios: eight concurrent copies produce one row/one vendor call; status lookup and409 changed-content conflict; identity mapping; skipped events; terminal422 without retry; retained500 plus explicit retry using frozen payload;429/timeout outcomes; failed COMMIT with zero vendor sends; accepted vendor followed by failed outcome write without duplicate intake resend; pending/expired claim recovery and stale token fencing; protected legacy rows.

Schema checks: generated UUID PK, distinct UUIDs, text message IDs, unique IDs, nonblank/not-null constraints, numeric/UUID/anonymous users, nullable fields, JSONB/timestamp round trips, invalid object shapes and infinite timestamps. Migration reapplication is a versioned no-op.

A separate unchanged strict vendor.py instance verified six concurrent real source requests resulted in one committed row, one vendor acceptance, zero duplicate deliveries and zero schema rejections. Its synthetic delivered row was retained. Main API failure retention and saved attempts across restart were also verified. After a user reported500s, the main stub was restored from forced500 mode to normal; explicit retry delivered the same saved event on attempt4.

No blocking core-flow tests remain. Extended/performance/platform checks not executed are explicitly listed in [poc.md](../poc.md). Do not equate tests against an injected HTTP failure with full production packet-loss/kill testing. Production auth, retention/deletion, deployment and SLOs are outside this POC.
