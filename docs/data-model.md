# Data model and persistence

Owning phase: design-data. Design status and provenance: TBD. Ask for the user's proposed schema and develop it interactively; record supplied design, established schema, delegated choices, proposals, and open questions distinctly. Product scaffolding does not fill this model. For no persistence, record the user's reason and mark this phase not_applicable. This phase plans migrations; it does not generate or apply them.

## Storage and schema authority

- Persistence requirements and database/storage choice: PostgreSQL selected by the user, containerized on the API network. Persist accepted event identity and outcomes before direct vendor delivery; database-enforced messageId deduplication and concurrent ownership are required invariants. Schema and migration decisions remain unstarted; see [infrastructure.md](infrastructure.md).
- Authoritative schema or migration location under app/: TBD
- Data access and migration approach: TBD
- First-slice scope and deferred entities: TBD

If an existing schema is authoritative, reference it and explain the relevant design rather than maintaining a conflicting duplicate.

## Entities and relationships

| Entity / collection | Purpose and ownership | Identifier | Relationships and cardinality |
| --- | --- | --- | --- |
| TBD | TBD | TBD | TBD |

## Fields and integrity

| Entity | Field / type | Required / nullable / default | Validation, uniqueness, and other constraints |
| --- | --- | --- | --- |
| TBD | TBD | TBD | TBD |

- Access patterns and supporting indexes: TBD
- Transaction / consistency boundaries and concurrent updates: TBD
- Delete, cascade, retention, and sensitive-data rules: TBD
- Migration, test fixtures, and rollback considerations: TBD

Resolve the first-slice model before implementing tables, migrations, or repositories. Match exposed data to [api-contracts.md](api-contracts.md); database rows are not automatically API payloads. Cover important constraints and failure cases in [testing.md](testing.md).
