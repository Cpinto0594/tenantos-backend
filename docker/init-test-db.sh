#!/bin/sh
# Runs once, on first initialisation of the Postgres data volume.
#
# Creates the database the test suite points at. Tests truncate tables between
# cases, so they must never share a database with development data — losing your
# local fixtures to a test run is a rite of passage worth skipping.
set -eu

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    CREATE DATABASE tenantos_test;
    GRANT ALL PRIVILEGES ON DATABASE tenantos_test TO $POSTGRES_USER;
EOSQL
