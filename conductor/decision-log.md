# Decision Log

Technical and business decisions made during development.

## Format

### DECISION-XXX: [Title]
- **Date**: YYYY-MM-DD
- **Track**: track-id
- **Decision**: What was decided
- **Rationale**: Why this decision was made
- **Alternatives**: What else was considered
- **Impact**: Effects on architecture/product/business

---

### DECISION-001: Keep In-Memory Rate Limiter Fallback

- **Date**: 2026-02-26
- **Track**: v1-launch-readiness
- **Decision**: Retain the in-memory rate limiter as a fallback when Redis is unavailable, rather than requiring Redis for all rate limiting.
- **Rationale**: Graceful degradation is preferred over hard failures. If Redis becomes temporarily unavailable (network partition, restart, etc.), the application should continue to function with basic rate limiting protection rather than either:
  1. Failing all requests that need rate limiting, or
  2. Allowing unlimited requests (no rate limiting)

  The in-memory fallback provides per-instance protection which is sufficient for single-instance deployments and provides some protection even in multi-instance scenarios.
- **Alternatives**:
  1. **Redis-only**: Require Redis for all rate limiting, fail requests if Redis unavailable. Rejected due to reduced resilience.
  2. **No fallback + circuit breaker**: Disable rate limiting entirely when Redis fails. Rejected as it removes protection during outages.
  3. **Sticky sessions + in-memory**: Route users to same instance for consistent in-memory limiting. Adds operational complexity.
- **Impact**:
  - Architecture: Dual rate limiter implementation (Redis primary, in-memory fallback)
  - Operations: System remains functional during Redis outages
  - Security: Some rate limiting always active, though distributed accuracy may be reduced during Redis unavailability
