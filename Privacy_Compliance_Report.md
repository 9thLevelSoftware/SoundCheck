# SoundCheck Privacy & Data Protection Review

## Executive Summary
- GDPR Readiness: 45%
- CCPA Readiness: 55%
- Data Protection Score: 52/100

## Privacy Issues

### Issue 1: Account deletion is a soft deactivate only
- Category: Data Retention / Erasure
- Severity: High
- Description: Account deletion sets `is_active = false` but does not purge or anonymize user data, conflicting with the policy claim of deletion within 30 days.
- Impact: GDPR right-to-erasure non-compliance; retention of PII beyond stated limits.
- Remediation: Implement hard-delete/anonymization workflows and backup purge procedures; track deletion requests and enforce retention timers.
- Evidence: `backend/src/services/UserService.ts:227`, `PRIVACY_POLICY.md`

### Issue 2: Data export/portability not implemented
- Category: User Rights / Portability
- Severity: Medium
- Description: No API endpoint exists for data export or user data portability; only `/api/users/me` returns limited profile data.
- Impact: GDPR Article 20 non-compliance and reduced trust for users requesting exports.
- Remediation: Add a data export endpoint (profile, reviews/checkins, social graph) with audit logging and access controls.
- Evidence: `backend/src/routes/userRoutes.ts`

### Issue 3: Consent records are not persisted
- Category: Consent Management
- Severity: Medium
- Description: There is no consent capture or storage in the schema; OS-level permission prompts do not provide auditable consent records.
- Impact: Inability to prove consent for location/analytics processing.
- Remediation: Store consent decisions with timestamps and purpose, and expose a revoke flow.
- Evidence: `backend/database-schema.sql`, `mobile/lib/src/shared/services/location_service.dart`

### Issue 4: Third-party data sharing not fully disclosed
- Category: Third-Party Sharing
- Severity: Medium
- Description: External data providers (Foursquare, setlist.fm, MusicBrainz) are used in code but not explicitly listed in the policy.
- Impact: Transparency gaps and possible compliance exposure under GDPR/CCPA disclosure requirements.
- Remediation: Update the privacy policy to list all third-party processors and data shared.
- Evidence: `backend/src/services/FoursquareService.ts:38`, `backend/src/services/SetlistFmService.ts:76`, `backend/src/services/MusicBrainzService.ts:33`

### Issue 5: Retention and purge enforcement missing
- Category: Data Retention
- Severity: Medium
- Description: No automated purge jobs or retention enforcement are present despite policy commitments.
- Impact: Data retained beyond stated periods and increased breach surface.
- Remediation: Add scheduled retention jobs for deleted accounts and audit logs for purge status.
- Evidence: `PRIVACY_POLICY.md`, `backend/database-schema.sql`

## Data Flow Diagram
```
[Mobile App] --(Auth, Profile, Check-ins, Media)--> [API Server]
     |                                             |
     |--(Secure Storage: tokens)                   |--(SQL)--> [PostgreSQL]
     |                                             |
     |--(WebSocket auth token)-------------------->[WebSocket Server]
     |
     |--(Venue/Band lookup)-----------------------> [Foursquare / setlist.fm / MusicBrainz]
```

## Privacy Metrics
- Data types collected: email, username, password hash, profile info, location (optional), usage logs, reviews/check-ins, photos.
- Third-party sharing: Yes (Foursquare, setlist.fm, MusicBrainz, hosting providers).
- User rights implemented: ~40% (profile access/update; deletion is deactivation; no export).
- Breach procedures: Documented in policy, not implemented in code.
