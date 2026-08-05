# Production-Ready NestJS Backend Generator

You are a Staff/Principal Backend Engineer with extensive experience building large-scale NestJS applications for high-traffic production environments.

Your task is to create a **production-ready NestJS project** following enterprise-grade architecture and best practices.

Do not create a tutorial or simplified example. Build the project as if it will be deployed to production and maintained by a team of senior engineers.

## Technology Stack

* NestJS (latest stable)
* TypeScript (strict mode)
* Node.js LTS
* PostgreSQL
* Redis
* Prisma ORM (preferred) or TypeORM (if justified)
* JWT Authentication
* Passport
* Socket.io WebSockets
* Docker
* Docker Compose
* OpenAPI / Swagger
* Zod for runtime validation
* Pino (or Winston if justified) for structured logging

---

# Project Goals

The architecture must support:

* High traffic
* Horizontal scaling
* Maintainability
* Clean Architecture
* Domain Driven Design principles where appropriate
* SOLID
* Dependency Injection
* Testability
* Observability

Avoid monolithic "god modules".

Everything should be modular.

---

# Folder Structure

Design a scalable folder structure similar to:

```
src/
    app/
    modules/
        auth/
        users/
        websocket/
        cache/
        database/
        common/
        config/
        health/
    shared/
    infrastructure/
    domain/
    application/
    main.ts
```

Explain why each folder exists.

---

# Configuration

Implement centralized configuration.

Use:

* @nestjs/config
* Zod validation

Validate:

* required variables
* URLs
* integers
* booleans
* enums
* secrets

Application should fail fast if configuration is invalid.

Support:

```
.env
.env.development
.env.test
.env.production
```

Expose a strongly typed ConfigService.

No magic strings.

---

# Database

Use PostgreSQL.

Implement:

* migrations
* connection pooling
* transactions
* repository pattern (if applicable)
* indexes
* pagination
* optimistic locking where appropriate

Demonstrate:

* one-to-many
* many-to-many

Provide guidance for large datasets.

---

# Caching

Implement Redis.
Support:

* cache manager
* cache invalidation
* TTL
* cache keys
* decorators
* response caching

Demonstrate when NOT to cache.

---

# Authentication

Implement:

JWT Access Token
Refresh Token
Password hashing (Argon2 preferred)
Passport strategies
Custom decorators
Guards
Public routes
Authenticated routes
Admin routes
Refresh token rotation
Logout
Secure cookie option
Token revocation strategy

---

# Security

Include:
CORS
Input validation
DTO validation
SQL Injection protection
Secure headers

---

# Validation

Use:

class-validator AND Zod (recommend the best approach)

Transform DTOs
Custom validators
Global Validation Pipe
Error formatting

---

# Error Handling

Create:
Global Exception Filter
Business exceptions
Infrastructure exceptions
HTTP exceptions
Validation exceptions
Logging
Consistent error response format.

Example:

```
{
  "success": false,
  "message": "...",
  "errorCode": "...",
  "traceId": "...",
  "timestamp": "..."
}
```

---

# Logging

Implement structured logging.

Use Pino.

Include:

request id

correlation id

execution time

user id

IP

errors

warnings

debug

Support:

development logging

production logging

JSON logs

---

# Observability

Include:
Health checks
Readiness endpoint
Liveness endpoint
Metrics endpoint

---

# WebSockets

Implement:
Just Library
---


# API

REST-first architecture.

Include:
Swagger
OpenAPI
Pagination
Filtering
Sorting
Searching
Consistent response format
Idempotency discussion

---

# Performance

Implement:
Compression
Connection pooling
Redis caching
Lazy loading where appropriate
Avoid N+1 queries
Streaming
Memory optimization
Graceful shutdown

---

# Docker
Provide:
Dockerfile
Docker Compose
Development environment
Production environment
Multi-stage build
Non-root user
Health checks
Volumes
Environment variables

---

# Testing

Configure:
Jest
Unit tests
Mocking
Coverage configuration

---

# Code Quality

Configure:
ESLint
Prettier
Husky
TypeScript strict mode
Import aliases
Path mapping

---

# CI/CD

Provide a GitHub Actions workflow that:

* installs dependencies
* lints
* tests
* builds
* generates migrations
* checks formatting
* uploads coverage

---

# Authentication Architecture

Explain:
Access token lifecycle
Refresh token lifecycle
Revocation
Storage strategy
Cookie vs Local Storage
Security tradeoffs

---

# Health Module

Create endpoints:

```
GET /health
GET /health/live
GET /health/ready
```

Check:

Database
Redis
---

# Common Utilities
Include reusable:
Pagination
Response wrapper
Custom decorators
Base entities
Constants
Enums
Utilities
Date helpers
UUID helpers
Interceptors
Pipes
Guards
Filters
Middleware

---

# Graceful Shutdown

Properly close:
Database
Redis
WebSockets
HTTP server

---

# Environment Awareness

Different behavior for:
Development
Testing
Production

---

# Documentation

Generate:

README

Architecture explanation

How to run

How to test

Deployment guide

Environment variables reference

---

# Example Module

Build a complete Users module demonstrating:

Controller

Service

Repository

DTOs

Validation

Authentication

Authorization

Caching

Logging

Database

Swagger

Tests

---

# Final Deliverable

Generate a complete project including:

* all configuration files
* source code
* Docker configuration
* testing setup
* recommended dependencies
* explanation of architectural decisions
* production best practices
* scalability considerations
* security considerations
* tradeoffs made and why

The generated project should be something that could realistically be used as the foundation for a production SaaS application serving millions of requests.
