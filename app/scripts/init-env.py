#!/usr/bin/env python3
"""Create ignored local credentials once; never print or overwrite them."""
from pathlib import Path
import os
import secrets

destination = Path(__file__).resolve().parents[1] / '.env'
content = (
    f'POSTGRES_PASSWORD={secrets.token_hex(32)}\n'
    f'APP_DB_PASSWORD={secrets.token_hex(32)}\n'
    'API_PORT=3000\n'
    'VENDOR_BASE_URL=http://host.docker.internal:9000\n'
)
try:
    descriptor = os.open(destination, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
except FileExistsError:
    print('app/.env already exists; preserved existing configuration.')
else:
    with os.fdopen(descriptor, 'w') as handle:
        handle.write(content)
    print('Created app/.env with random local credentials (mode 0600).')
