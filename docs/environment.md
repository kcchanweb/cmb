# Environment variable reference

Selected execution model: API and PostgreSQL containers on one Compose bridge network; vendor.py remains a host process. API-to-database traffic uses db:5432; host-vendor routing and the loopback-listener caveat are documented in [infrastructure.md](infrastructure.md). Variable names, exact ports/budgets, image pins, and secrets wiring remain for setup; do not infer working configuration from this topology. Plain HTTP is limited to this local fixture scope.

Document every application environment variable here. All environment values arrive as strings; the type column defines the required parsing and validation. Validate required values at startup. Keep real secrets in the approved secret store or an ignored local environment file.

| Variable | Type | Required | Default / safe example | Description | Secret? | Environments |
| --- | --- | --- | --- | --- | --- | --- |
| TBD_VARIABLE_NAME | TBD: string / integer / boolean / URL / enum | TBD | TBD: nonsecret value only | TBD | TBD | TBD: local / staging / production |

## Configuration procedure

1. Replace the placeholder with the variables required by the selected stack.
2. Specify allowed values, parsing, and validation constraints in each description.
3. Add secret-free examples to app/.env.example once the application configuration format is selected. Keep local application environment files under app/ too.
4. Ensure local secret files are ignored by version control before creating them.
5. Document how each deployment target receives configuration in tech-stack.md.
