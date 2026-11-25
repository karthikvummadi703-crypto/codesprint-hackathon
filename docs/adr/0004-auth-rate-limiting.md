# ADR 0004: Auth and rate limiting

## Status

Accepted.

## Context

The API accepts both Firebase ID tokens and explicit development tokens in development. Rate limits must be attributable to a real user and must not trust spoofable forwarding headers.

## Decision

Authentication middleware verifies Firebase tokens through Firebase Admin and accepts `dev:` tokens only outside production. The verified uid is attached to request state and is the sole key for per-user rate-limit buckets. Production disables dev tokens, drops loopback CORS origins, and uses explicit hosted origins.

## Consequences

Anonymous requests receive a stable low-limit bucket; authenticated requests get user-scoped limits. Rotating or spoofing client headers cannot reset a bucket. Token verification failures remain 401 responses and are distinct from rate-limit 429 responses.
