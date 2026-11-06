#!/usr/bin/env python3
"""Exercise the real DB/HTTP pipeline in an isolated disposable database."""
from pathlib import Path
import secrets
import subprocess

APP = Path(__file__).resolve().parents[1]
COMPOSE = ['docker', 'compose', '-f', 'compose.yaml']
database = 'cmb_event_test_' + secrets.token_hex(8)
created = False

def run(*args):
    subprocess.run([*COMPOSE, *args], cwd=APP, check=True)

try:
    run('exec', '-T', 'db', 'createdb', '-U', 'postgres', '-O', 'event_relay_app', database)
    created = True
    for path in sorted((APP / 'db' / 'migrations').glob('*.sql')):
        destination = '/tmp/cmb-test-' + path.name
        run('cp', str(path.relative_to(APP)), 'db:' + destination)
        run('exec', '-T', 'db', 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'event_relay_app', '-d', database, '-f', destination)
    run('-f', 'compose.integration.yaml', 'run', '--rm', '--no-deps', '--build', '-e', 'PGDATABASE=' + database, 'api')
finally:
    if created:
        run('exec', '-T', 'db', 'dropdb', '-U', 'postgres', '--force', database)
