-- Runs only when the official image initializes a fresh data volume.
-- psql reads the password from its environment, not command-line arguments.
\getenv app_password APP_DB_PASSWORD
CREATE ROLE event_relay_app LOGIN PASSWORD :'app_password';
GRANT CONNECT ON DATABASE event_relay TO event_relay_app;
GRANT USAGE, CREATE ON SCHEMA public TO event_relay_app;
