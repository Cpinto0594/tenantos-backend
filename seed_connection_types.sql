-- seed_connection_types.sql
-- Sample records for the connection_types table

INSERT INTO connection_types (id, name, type, provider, schema, created_at)
VALUES
    (
        gen_random_uuid(),
        'Slack',
        'slack',
        'slack',
        '{
            "type": "object",
            "required": ["access_token", "workspace_id"],
            "properties": {
                "access_token": { "type": "string", "description": "OAuth access token" },
                "workspace_id": { "type": "string", "description": "Slack workspace ID" },
                "channel": { "type": "string", "description": "Default channel to post to" }
            }
        }'::jsonb,
        CURRENT_TIMESTAMP
    ),
    (
        gen_random_uuid(),
        'HTTP Webhook',
        'http_webhook',
        'generic',
        '{
            "type": "object",
            "required": ["url"],
            "properties": {
                "url": { "type": "string", "format": "uri", "description": "Target webhook URL" },
                "method": {
                    "type": "options",
                    "options": [
                        { "key": "GET", "value": "GET" },
                        { "key": "POST", "value": "POST" },
                        { "key": "PUT", "value": "PUT" },
                        { "key": "PATCH", "value": "PATCH" }
                    ],
                    "default": "POST"
                },
                "headers": { "type": "object", "additionalProperties": { "type": "string" } }
            }
        }'::jsonb,
        CURRENT_TIMESTAMP
    ),
    (
        gen_random_uuid(),
        'HTTP Request',
        'http',
        'generic',
        '{
            "type": "object",
            "required": ["base_url"],
            "properties": {
                "base_url": { "type": "string", "format": "uri", "description": "Base URL of the API" },
                "auth_type": {
                    "type": "options",
                    "options": [
                        { "key": "none", "value": "None" },
                        { "key": "basic", "value": "Basic Auth" },
                        { "key": "bearer", "value": "Bearer Token" },
                        { "key": "api_key", "value": "API Key" }
                    ],
                    "default": "none"
                },
                "username": { "type": "string" },
                "password": { "type": "string" },
                "token": { "type": "string" },
                "api_key_header": { "type": "string" },
                "api_key": { "type": "string" }
            }
        }'::jsonb,
        CURRENT_TIMESTAMP
    ),
    (
        gen_random_uuid(),
        'Cron Schedule',
        'cron',
        'generic',
        '{
            "type": "object",
            "required": ["expression"],
            "properties": {
                "expression": { "type": "string", "description": "Cron expression, e.g. \"0 * * * *\"" },
                "timezone": { "type": "string", "default": "UTC" }
            }
        }'::jsonb,
        CURRENT_TIMESTAMP
    ),
    (
        gen_random_uuid(),
        'SFTP',
        'sftp',
        'generic',
        '{
            "type": "object",
            "required": ["host", "username"],
            "properties": {
                "host": { "type": "string" },
                "port": { "type": "integer", "default": 22 },
                "username": { "type": "string" },
                "password": { "type": "string" },
                "private_key": { "type": "string", "description": "PEM-encoded private key" },
                "passphrase": { "type": "string" },
                "root_path": { "type": "string", "default": "/" }
            }
        }'::jsonb,
        CURRENT_TIMESTAMP
    ),
    (
        gen_random_uuid(),
        'GitHub',
        'github',
        'github',
        '{
            "type": "object",
            "required": ["access_token"],
            "properties": {
                "access_token": { "type": "string", "description": "Personal access token or OAuth token" },
                "owner": { "type": "string", "description": "Default repository owner/org" },
                "repo": { "type": "string", "description": "Default repository name" }
            }
        }'::jsonb,
        CURRENT_TIMESTAMP
    ),
    (
        gen_random_uuid(),
        'PostgreSQL',
        'postgres',
        'postgres',
        '{
            "type": "object",
            "required": ["host", "database", "username", "password"],
            "properties": {
                "host": { "type": "string" },
                "port": { "type": "integer", "default": 5432 },
                "database": { "type": "string" },
                "username": { "type": "string" },
                "password": { "type": "string" },
                "ssl": { "type": "boolean", "default": false }
            }
        }'::jsonb,
        CURRENT_TIMESTAMP
    ),
    (
        gen_random_uuid(),
        'SMTP Email',
        'smtp',
        'email',
        '{
            "type": "object",
            "required": ["host", "port", "username", "password"],
            "properties": {
                "host": { "type": "string" },
                "port": { "type": "integer", "default": 587 },
                "username": { "type": "string" },
                "password": { "type": "string" },
                "from_address": { "type": "string", "format": "email" },
                "secure": { "type": "boolean", "default": true }
            }
        }'::jsonb,
        CURRENT_TIMESTAMP
    ),
    (
        gen_random_uuid(),
        'Database',
        'database',
        'generic',
        '{
            "type": "object",
            "required": ["type", "host", "database", "username", "password"],
            "properties": {
                "type": {
                    "type": "options",
                    "description": "Database engine",
                    "options": [
                        { "key": "mysql", "value": "MySQL" },
                        { "key": "postgres", "value": "PostgreSQL" },
                        { "key": "mssql", "value": "SQL Server" },
                        { "key": "oracle", "value": "Oracle" },
                        { "key": "sqlite", "value": "SQLite" }
                    ],
                    "default": "postgres"
                },
                "host": { "type": "string" },
                "port": { "type": "integer" },
                "database": { "type": "string" },
                "username": { "type": "string" },
                "password": { "type": "string" },
                "ssl": { "type": "boolean", "default": false }
            }
        }'::jsonb,
        CURRENT_TIMESTAMP
    ),
    (
        gen_random_uuid(),
        'Redis',
        'redis',
        'redis',
        '{
            "type": "object",
            "required": ["host"],
            "properties": {
                "host": { "type": "string" },
                "port": { "type": "integer", "default": 6379 },
                "password": { "type": "string" },
                "database": { "type": "integer", "default": 0 },
                "tls": { "type": "boolean", "description": "Connect using TLS", "default": false }
            }
        }'::jsonb,
        CURRENT_TIMESTAMP
    )
ON CONFLICT (type) DO NOTHING;
