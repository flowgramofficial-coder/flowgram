-- Runs once on first container start, as the bootstrap superuser.
CREATE ROLE flowgram_owner LOGIN PASSWORD 'flowgram_owner' CREATEROLE;
CREATE ROLE flowgram_app   LOGIN PASSWORD 'flowgram_app' NOSUPERUSER NOBYPASSRLS;
CREATE DATABASE flowgram OWNER flowgram_owner;
\connect flowgram
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
GRANT CONNECT ON DATABASE flowgram TO flowgram_app;
GRANT USAGE ON SCHEMA public TO flowgram_app;
