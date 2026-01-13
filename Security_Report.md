# SoundCheck Security Review Report

## Executive Summary
- Overall security posture: High risk (secrets committed to repo; unauthenticated real-time access possible).
- Critical findings: 2
- High findings: 1
- Medium findings: 3
- Low findings: 1

## Detailed Findings

### Finding 1: Committed production secrets in repository
- Vulnerability: Secrets committed to source control
- Severity: Critical
- CVSS Score: 9.8
- Location: `backend/.env`
- Description: A tracked environment file contains live database credentials and JWT secrets.
- Impact: Full database compromise and token forgery if repository access is leaked.
- Remediation: Remove `backend/.env` from the repo, rotate DB credentials and JWT secret immediately, and use secret manager injection for runtime configuration.
- References: CWE-798, OWASP A05:2021 Security Misconfiguration

### Finding 2: Release keystore passwords stored in plaintext
- Vulnerability: Signing key material exposure
- Severity: Critical
- CVSS Score: 9.1
- Location: `mobile/KEYSTORE_BACKUP_INFO.txt`
- Description: Android keystore passwords are stored in plaintext, enabling signing key compromise if exfiltrated.
- Impact: Attackers can ship malicious app updates signed with the legitimate key.
- Remediation: Delete the file, rotate the upload key (Play App Signing), store secrets in a password manager/secret vault, and audit repo history for exposure.
- References: CWE-312, OWASP A04:2021 Insecure Design

### Finding 3: WebSocket rooms can be joined before authentication
- Vulnerability: Missing authorization gate for WebSocket room membership
- Severity: High
- CVSS Score: 8.2
- Location: `backend/src/utils/websocket.ts:127`
- Description: Clients can join rooms without completing authentication, enabling real-time data exposure.
- Impact: Unauthorized users may receive activity updates or notifications intended for authenticated users.
- Remediation: Require successful auth before handling `join_room`/`leave_room`, enforce user existence/active status, and reject all non-auth messages until authenticated.
- References: CWE-285, OWASP A01:2021 Broken Access Control

### Finding 4: Database TLS verification disabled by default
- Vulnerability: TLS certificate verification bypass
- Severity: Medium
- CVSS Score: 5.9
- Location: `backend/src/config/database.ts:17`
- Description: Default DB_SSL mode is `no-verify`, allowing MITM against database connections over untrusted networks.
- Impact: Credential leakage or data tampering when DB traffic is intercepted.
- Remediation: Default to `DB_SSL=true` with certificate validation and fail closed when verification is unavailable.
- References: CWE-295, OWASP A02:2021 Cryptographic Failures

### Finding 5: Uploaded files are publicly accessible without auth
- Vulnerability: Unauthenticated access to user-uploaded content
- Severity: Medium
- CVSS Score: 5.3
- Location: `backend/src/index.ts:120`
- Description: Static serving of `/uploads` allows direct access to user profile images without authorization checks.
- Impact: User content can be enumerated or scraped, violating privacy expectations.
- Remediation: Serve uploads via signed URLs or authenticated routes; store files in private object storage.
- References: CWE-200, OWASP A01:2021 Broken Access Control

### Finding 6: Third-party API keys can leak into logs
- Vulnerability: Sensitive header logging
- Severity: Medium
- CVSS Score: 6.1
- Location: `backend/src/services/FoursquareService.ts:105`
- Description: Error logging includes request headers which contain the Foursquare API key.
- Impact: API key leakage in logs enables unauthorized third-party API usage.
- Remediation: Redact Authorization headers before logging; centralize logging to enforce redaction.
- References: CWE-532, OWASP A09:2021 Logging and Monitoring Failures

### Finding 7: No JWT refresh or revocation strategy
- Vulnerability: Long-lived tokens without revocation
- Severity: Low
- CVSS Score: 4.0
- Location: `backend/src/utils/auth.ts:36`
- Description: Tokens are issued with fixed lifetime and there is no refresh or server-side revocation capability.
- Impact: Stolen tokens remain valid until expiration; account recovery is delayed.
- Remediation: Add refresh tokens, rotation, and server-side revocation (blacklist or token versioning).
- References: CWE-613, OWASP A07:2021 Identification and Authentication Failures

## Recommendations
- Immediate actions (1-2 weeks): Remove committed secrets, rotate keys, and lock down WebSocket room access.
- Short-term improvements (1-2 months): Enforce TLS verification for DB connections and protect uploaded content with auth or signed URLs.
- Long-term enhancements (3+ months): Implement token refresh/revocation and centralized secret redaction for logs.

## Compliance Checklist
- OWASP Top 10 coverage: A01, A02, A05, A07, A09 identified in findings.
- Secrets management: Failing (committed secrets and keystore passwords).
- Transport security: Partial (TLS enabled but verification disabled by default).
