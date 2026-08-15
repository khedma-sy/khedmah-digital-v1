# Khedmah Digital V1 Bootstrap Guide

## Purpose

This document describes how to rebuild Khedmah Digital V1 from the repository source of truth.

## Source of Truth

GitHub repository contains:

- Application code
- Database migrations
- Seed data
- Infrastructure configuration

Runtime environments contain:

- Database records
- Runtime secrets
- Deployed services

## Database Setup Order

Run migrations in order:

001 → 017

The migrations create the canonical database schema.

## Seed Data

After migrations run:

Execute:

backend/seeds/001_initial_categories.sql

This creates the initial canonical categories.

## Required Environment Variables

Backend requires:

- DATABASE_URL
- CLOUD_SQL_INSTANCE_CONNECTION_NAME

## Deployment Components

Backend:
- Cloud Run service

Frontend:
- Cloud Run service

Database:
- PostgreSQL / Cloud SQL

## Verification

Verify:

GET /api/v1/health

Expected:

{
  "status": "ok"
}

## Notes

Do not commit:

- secrets
- runtime credentials
- user data
- production database exports
