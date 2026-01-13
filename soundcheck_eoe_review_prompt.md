# SoundCheck Repository - Multi-Phase End-to-End Review Prompt
## For Agentic AI Code Review System

**Repository:** https://github.com/DasBluEyedDevil/SoundCheck

**Project Type:** Full-stack mobile application (Flutter + Node.js/Express backend)

**Review Objective:** Conduct four independent, comprehensive end-to-end reviews, each with specialized focus areas.

---

## PHASE 1: SECURITY REVIEW
### Focus: Application & Infrastructure Security

#### 1.1 Authentication & Authorization
- [ ] **JWT Implementation Review**
  - Validate JWT secret complexity and rotation strategy
  - Check token expiration and refresh token mechanisms
  - Verify token payload doesn't leak sensitive information
  - Audit token storage in mobile app (secure storage verification)
  - Check for JWT algorithm hardening (HS256 vs RS256)
  - Verify token revocation/blacklist mechanisms

- [ ] **Password Security**
  - Verify bcrypt usage with appropriate salt rounds (minimum 10)
  - Check password hashing in user registration endpoints
  - Validate password complexity requirements
  - Check for password reset vulnerability (token expiration, one-time use)
  - Audit password change endpoints for proper validation

- [ ] **Session Management**
  - Verify session timeout configurations
  - Check for concurrent session handling
  - Validate session fixation protections
  - Audit idle timeout implementations

- [ ] **Authorization Layers**
  - Review role-based access control (RBAC) implementation
  - Verify permission checks on all protected endpoints
  - Check for privilege escalation vulnerabilities
  - Audit user-to-user data access controls
  - Verify admin-only endpoints have proper guards

#### 1.2 Transport Security
- [ ] **HTTPS/TLS**
  - Verify HTTPS enforcement in production
  - Check for mixed content warnings
  - Audit certificate pinning implementation (if applicable)
  - Validate minimum TLS version requirements (1.2+)

- [ ] **CORS Security**
  - Audit CORS configuration in `backend/src/index.ts`
  - Verify wildcard CORS not used in production
  - Check allowed origins alignment with deployment strategy
  - Validate credential handling in CORS (credentials flag)
  - Review preflight request handling

- [ ] **Headers Security**
  - Verify Helmet.js configuration completeness
  - Check CSP (Content Security Policy) directives
  - Audit X-Frame-Options, X-Content-Type-Options
  - Verify HSTS configuration
  - Check Referrer-Policy settings

#### 1.3 API Security
- [ ] **Input Validation & Sanitization**
  - Review validation middleware in `backend/src/middleware/validate.ts`
  - Check all user inputs are validated (req.body, req.params, req.query)
  - Audit for injection vulnerabilities (SQL, NoSQL, command)
  - Verify file upload validation (MIME types, file size, extension)
  - Check for XXE (XML External Entity) attacks
  - Audit JSON parsing security

- [ ] **Rate Limiting & DDoS Protection**
  - Review per-user rate limit implementation in `perUserRateLimit.ts`
  - Check rate limit thresholds are appropriate
  - Verify rate limit headers are returned (X-RateLimit-*)
  - Audit global rate limiting (if implemented)
  - Check for rate limit bypass vulnerabilities

- [ ] **Error Handling & Information Disclosure**
  - Audit error messages for information leakage
  - Verify stack traces not exposed in production
  - Check for timing attacks in authentication
  - Audit database error message exposure
  - Review logging sensitivity (no passwords/tokens in logs)

#### 1.4 Database Security
- [ ] **SQL Injection Prevention**
  - Review all database queries for parameterization
  - Audit ORM usage (if applicable) for raw query usage
  - Check prepared statement usage
  - Verify input sanitization for database queries
  - Audit dynamic query construction

- [ ] **Data Encryption**
  - Verify sensitive data encryption at rest
  - Check password field encryption/hashing
  - Audit PII (Personally Identifiable Information) handling
  - Review encryption key management
  - Check for encryption of auth tokens in database

- [ ] **Database Access Control**
  - Verify database user least privilege principle
  - Check for hardcoded credentials
  - Audit connection pooling security
  - Review database backup security

#### 1.5 File & Upload Security
- [ ] **File Upload Validation** (middleware/upload.ts)
  - Verify file type whitelist usage
  - Check file size limits
  - Audit filename sanitization
  - Verify file storage location security (not in web root)
  - Check for path traversal vulnerabilities
  - Audit virus/malware scanning (if applicable)
  - Verify file permissions (644, not 777)

- [ ] **File Access Control**
  - Verify authentication required to access uploads
  - Check authorization for user's own files
  - Audit direct URL access to uploaded files
  - Verify filename doesn't reveal server path structure

#### 1.6 Mobile App Security
- [ ] **Secure Storage**
  - Verify flutter_secure_storage for token storage
  - Check keychain/keystore usage for Android/iOS
  - Audit app permissions in AndroidManifest.xml/Info.plist
  - Verify no credentials in SharedPreferences/UserDefaults
  - Check for cleartext traffic disabled

- [ ] **Network Security**
  - Verify certificate pinning implementation
  - Check for SSL/TLS verification
  - Audit proxy vulnerability
  - Review WebSocket security (WSS vs WS)

#### 1.7 WebSocket Security
- [ ] **WebSocket Authentication**
  - Verify authentication required before WebSocket connection
  - Check token validation on connection
  - Audit message authentication/integrity
  - Verify connection isolation per user

- [ ] **WebSocket Injection**
  - Audit message content for injection attacks
  - Check input validation on WebSocket messages
  - Verify XSS prevention in real-time messages

#### 1.8 Secrets & Configuration Management
- [ ] **Environment Variables**
  - Verify JWT_SECRET complexity (minimum 32 characters)
  - Check DATABASE_URL format security
  - Audit .env file not committed to repository
  - Verify production secrets not in code
  - Check for API key exposure

- [ ] **Dependency Vulnerabilities**
  - Review package.json for outdated/vulnerable packages
  - Audit npm audit output
  - Check for supply chain vulnerabilities
  - Review transitive dependencies

#### 1.9 Logging & Monitoring
- [ ] **Security Logging**
  - Verify failed authentication attempts are logged
  - Check for suspicious activity logging
  - Audit rate limit violation logging
  - Review file access logging
  - Verify logs don't contain sensitive data

- [ ] **Log Access Control**
  - Verify logs are protected from unauthorized access
  - Check log retention policies
  - Audit log integrity (tamper-proof)

#### 1.10 Security Compliance
- [ ] **OWASP Top 10**
  - A01: Broken Access Control ✓
  - A02: Cryptographic Failures ✓
  - A03: Injection ✓
  - A04: Insecure Design ✓
  - A05: Security Misconfiguration ✓
  - A06: Vulnerable & Outdated Components ✓
  - A07: Authentication Failures ✓
  - A08: Data Integrity Failures ✓
  - A09: Logging & Monitoring Failures ✓
  - A10: SSRF ✓

- [ ] **Common Security Patterns**
  - Check for hardcoded credentials anywhere
  - Verify no debug code in production
  - Check for TODO/FIXME security comments
  - Audit overly permissive configurations

**Deliverable:** Security vulnerabilities report with severity levels, CVSS scores, and remediation steps.

---

## PHASE 2: DATA PROTECTION & PRIVACY REVIEW
### Focus: User Data Handling, Compliance, and Privacy

#### 2.1 User Data Classification
- [ ] **Data Inventory**
  - Identify all PII collected (names, emails, locations, phone numbers)
  - Classify sensitive vs. non-sensitive data
  - Map data flows from collection to storage
  - Document third-party data sharing
  - Review data retention periods

- [ ] **Data Collection Consent**
  - Verify consent mechanisms for data collection
  - Check for explicit opt-in (not pre-checked)
  - Audit consent records storage
  - Verify ability to withdraw consent
  - Review consent documentation (PRIVACY_POLICY.md)

#### 2.2 Data Minimization
- [ ] **Collection Scope**
  - Verify only necessary data collected
  - Audit for over-collection of user information
  - Check profile data collection justification
  - Verify analytics data collection is minimal

- [ ] **Data Retention**
  - Check data retention policies are defined
  - Verify automatic deletion of old data
  - Audit user account deletion procedures (GDPR right to be forgotten)
  - Check for data purge scheduling
  - Verify deleted data doesn't persist in backups

#### 2.3 GDPR Compliance (if EU users)
- [ ] **User Rights**
  - Verify right to access (data export functionality)
  - Check right to rectification (update profile)
  - Verify right to erasure (account deletion)
  - Check right to restrict processing
  - Audit data portability implementation

- [ ] **Data Processing**
  - Verify Data Processing Agreement (DPA) with any processors
  - Check privacy by design principles
  - Audit data minimization practices
  - Verify purpose limitation

- [ ] **Breach Notification**
  - Check data breach notification procedures
  - Verify breach notification timeline (72 hours)
  - Audit breach documentation
  - Check regulatory reporting mechanism

#### 2.4 CCPA Compliance (if CA users)
- [ ] **Disclosure Requirements**
  - Verify privacy notice comprehensiveness
  - Check data sale disclosure (if applicable)
  - Audit category-specific disclosures
  - Verify opt-out mechanisms

- [ ] **Consumer Rights**
  - Check right to know implementation
  - Verify right to delete functionality
  - Audit opt-out of sale functionality
  - Check non-discrimination policies

#### 2.5 Authentication Data Protection
- [ ] **Password Storage**
  - Verify passwords hashed with bcrypt (10+ rounds)
  - Check no plaintext passwords in logs
  - Audit password history (if stored)
  - Verify password reset tokens are hashed

- [ ] **Token Storage**
  - Verify JWT tokens in secure storage (mobile)
  - Check token expiration enforcement
  - Audit token refresh procedures
  - Verify no token exposure in logs/errors

- [ ] **Session Data**
  - Check session data protection
  - Verify session tokens are hashed
  - Audit session fixation prevention
  - Check session timeout implementation

#### 2.6 User Content Protection
- [ ] **Reviews & User-Generated Content**
  - Verify user content is owned by user
  - Check user can delete their content
  - Audit content moderation practices
  - Verify user content backups are secure
  - Check for user content breach procedures

- [ ] **Profile Data**
  - Verify user can control profile visibility
  - Check private profile settings
  - Audit followers/following access controls
  - Verify profile data in search results is authorized

#### 2.7 Third-Party & External Data
- [ ] **Third-Party Integration**
  - List all third-party services (analytics, payment, etc.)
  - Verify data sharing agreements
  - Audit minimal data sharing principle
  - Check sub-processor contracts

- [ ] **API Data Sharing**
  - Verify API users agree to privacy terms
  - Check API rate limiting for data mining
  - Audit exported data security
  - Verify API logging doesn't expose user data

#### 2.8 Backup & Disaster Recovery
- [ ] **Backup Security**
  - Verify backups are encrypted
  - Check backup access controls
  - Audit backup retention policies
  - Verify backup integrity testing
  - Check backup recovery procedures for privacy

- [ ] **Backup Compliance**
  - Verify deleted data removed from backups
  - Check backup disposal procedures
  - Audit backup redundancy security

#### 2.9 Privacy by Design
- [ ] **Data Minimization Architecture**
  - Verify unnecessary data fields not in schema
  - Check database schema for privacy
  - Audit API response payloads
  - Verify frontend data handling
  - Check mobile app data storage

- [ ] **Pseudonymization & Anonymization**
  - Check if analytics are anonymized
  - Verify sensitive data masking
  - Audit internal user identifiers
  - Check for re-identification risks

#### 2.10 Privacy Incident Response
- [ ] **Incident Procedures**
  - Verify breach detection mechanisms
  - Check incident response plan
  - Audit notification procedures
  - Verify regulatory reporting
  - Check documentation & logs

#### 2.11 Privacy Policy Audit
- [ ] **Documentation Completeness**
  - Review PRIVACY_POLICY.md for completeness
  - Verify all data processing described
  - Check third-party references
  - Audit cookie/tracking disclosure
  - Verify user rights clearly explained

- [ ] **Policy Accuracy**
  - Verify policy matches actual implementation
  - Check data retention practices alignment
  - Audit third-party sharing matches policy
  - Verify user rights are actually implemented

#### 2.12 Vendor & Sub-Processor Security
- [ ] **Third-Party Vetting**
  - Verify database provider (PostgreSQL hosting) security
  - Check authentication provider security (if any)
  - Audit file storage security (if cloud-based)
  - Verify deployment platform security (Railway/Vercel)

- [ ] **Data Processing Agreements**
  - Verify DPA with all processors
  - Check sub-processor contracts
  - Audit data location restrictions
  - Verify deletion on termination

**Deliverable:** Privacy compliance report covering GDPR/CCPA readiness, data flow diagrams, and recommendations.

---

## PHASE 3: BUGS, ISSUES & STABILITY REVIEW
### Focus: Code Quality, Runtime Errors, and System Reliability

#### 3.1 Backend Code Quality
- [ ] **TypeScript Compliance**
  - Audit TypeScript strict mode usage
  - Check type coverage (target: >90%)
  - Verify any-type usage
  - Audit type safety in critical paths
  - Check for type assertion abuse

- [ ] **Express.js Best Practices**
  - Verify error handling in all routes
  - Check middleware chain correctness
  - Audit async/await error handling
  - Verify request/response cycle completion
  - Check for middleware execution order issues
  - Audit route handler signatures

- [ ] **Database Query Safety**
  - Verify all queries use parameterization
  - Check for SQL injection vulnerabilities
  - Audit connection pooling issues
  - Verify transaction handling
  - Check for N+1 query problems
  - Audit index usage for performance

- [ ] **Error Handling**
  - Verify try-catch blocks comprehensiveness
  - Check error propagation through middleware
  - Audit async error handling
  - Verify database error handling
  - Check file operation error handling
  - Audit network request error handling

- [ ] **Memory & Performance**
  - Check for memory leaks in listeners
  - Verify event listener cleanup
  - Audit database connection leaks
  - Check for unclosed file handles
  - Verify response streaming (for large payloads)
  - Audit timeout configurations

#### 3.2 Mobile App Code Quality
- [ ] **Dart/Flutter Best Practices**
  - Check Dart analysis output (flutter analyze)
  - Verify null safety (sound null safety)
  - Audit widget lifecycle management
  - Check for memory leaks in widgets
  - Verify stream subscription cleanup
  - Check for animation cleanup

- [ ] **State Management (Riverpod)**
  - Verify provider definition correctness
  - Check for unnecessary re-renders
  - Audit family parameter usage
  - Verify watch/read usage correctness
  - Check async provider error handling
  - Audit provider dependency chains

- [ ] **UI/Navigation Issues**
  - Verify GoRouter route definitions
  - Check for navigation stack issues
  - Audit deep linking implementation
  - Verify screen transitions
  - Check for UI glitches
  - Audit animation performance

- [ ] **Network Handling (Dio)**
  - Check interceptor implementations
  - Verify error handling in requests
  - Audit timeout configurations
  - Check retry logic
  - Verify request/response logging
  - Audit connection error handling

#### 3.3 Common Bugs & Issues
- [ ] **Authentication Bugs**
  - Check token refresh on expiration
  - Verify logout clears all data
  - Audit login state persistence
  - Check for race conditions in auth flow
  - Verify authentication state consistency

- [ ] **Data Consistency Issues**
  - Check for race conditions in updates
  - Verify optimistic update rollback
  - Audit concurrent request handling
  - Check for stale data issues
  - Verify cache invalidation

- [ ] **API Integration Issues**
  - Verify all endpoints implemented
  - Check error response handling
  - Audit timeout handling
  - Verify retry mechanisms
  - Check for request queuing issues
  - Audit cancellation handling

- [ ] **File Upload Issues**
  - Verify progress tracking
  - Check error handling during upload
  - Audit cleanup on failure
  - Verify retry mechanisms
  - Check for incomplete uploads
  - Audit file naming conflicts

- [ ] **Real-Time Issues (WebSocket)**
  - Check connection establishment
  - Verify reconnection logic
  - Audit message delivery
  - Check for memory leaks
  - Verify disconnection handling
  - Audit message ordering

#### 3.4 Database Issues
- [ ] **Schema Correctness**
  - Verify schema matches ORM models
  - Check for missing indexes
  - Audit constraint definitions
  - Check for NULL handling issues
  - Verify default values appropriateness
  - Audit data type selections

- [ ] **Migration Issues**
  - Verify migration script correctness
  - Check migration ordering
  - Audit rollback procedures
  - Check for schema drift
  - Verify data integrity during migrations

- [ ] **Query Performance**
  - Identify slow queries
  - Check query execution plans
  - Verify index usage
  - Audit JOIN efficiency
  - Check for subquery optimization
  - Verify aggregation efficiency

#### 3.5 API Contract Issues
- [ ] **Request/Response Validation**
  - Verify all fields in responses
  - Check type correctness
  - Audit null handling
  - Check array responses
  - Verify error response format
  - Audit pagination handling

- [ ] **Versioning & Compatibility**
  - Check API versioning strategy
  - Verify backward compatibility
  - Audit deprecation practices
  - Check for breaking changes
  - Verify deprecation notices

#### 3.6 Deployment & Environment Issues
- [ ] **Environment Configuration**
  - Verify all required env vars documented
  - Check development vs. production setup
  - Audit default values
  - Verify feature flags (if used)
  - Check logging configuration

- [ ] **Build & Deployment**
  - Check build script correctness (build.sh)
  - Verify deployment automation
  - Audit health checks
  - Verify startup procedures
  - Check graceful shutdown

#### 3.7 Logging & Monitoring
- [ ] **Log Coverage**
  - Verify error logging
  - Check warning logging
  - Audit info logging levels
  - Verify request/response logging
  - Check database query logging

- [ ] **Log Quality**
  - Verify structured logging format
  - Check timestamp accuracy
  - Audit correlation IDs
  - Verify log levels appropriateness
  - Check for excessive logging

#### 3.8 Testing Issues
- [ ] **Test Coverage**
  - Audit test coverage percentage
  - Check critical path coverage
  - Verify edge case testing
  - Audit error scenario testing
  - Check integration test coverage

- [ ] **Test Quality**
  - Verify test independence
  - Check mock usage
  - Audit flaky tests
  - Verify test data cleanup
  - Check test performance

#### 3.9 Dependencies Issues
- [ ] **Version Management**
  - Check outdated package versions
  - Verify security patches applied
  - Audit breaking changes in upgrades
  - Check dependency compatibility
  - Verify peer dependency satisfaction

- [ ] **Unused Dependencies**
  - Identify unused packages
  - Check for bloated dependencies
  - Audit transitive dependency size

#### 3.10 Edge Cases & Corner Cases
- [ ] **Boundary Conditions**
  - Check empty data handling
  - Verify large data handling
  - Audit special character handling
  - Check numeric overflow
  - Verify date/time edge cases
  - Audit timezone handling

- [ ] **Concurrency Issues**
  - Check race conditions
  - Verify atomic operations
  - Audit locking mechanisms
  - Check deadlock prevention
  - Verify consistency guarantees

**Deliverable:** Bug report with severity levels, reproduction steps, and fix recommendations; Code quality metrics and health score.

---

## PHASE 4: STUBS, INCOMPLETE FEATURES & TECHNICAL DEBT REVIEW
### Focus: Unfinished Implementation, TODOs, and Future Work

#### 4.1 Stub Identification
- [ ] **Code Stubs**
  - Search for TODO/FIXME/HACK comments throughout codebase
  - Identify placeholder implementations
  - Check for NotImplementedError or similar exceptions
  - Audit empty function bodies
  - Check for stub data/mock responses
  - Verify test skips (xit, xdescribe)

- [ ] **Location Mapping**
  ```
  Backend:
  - backend/src/controllers/*
  - backend/src/services/*
  - backend/src/routes/*
  - backend/src/middleware/*
  - backend/src/config/*
  - backend/src/utils/*
  
  Mobile:
  - mobile/lib/features/*
  - mobile/lib/providers/*
  - mobile/lib/screens/*
  - mobile/lib/models/*
  - mobile/lib/services/*
  ```

#### 4.2 Incomplete Features - Backend
- [ ] **User Management**
  - Check user profile completion features
  - Verify user preferences implementation
  - Audit user account settings
  - Check notification preferences
  - Verify privacy settings functionality
  - Audit user blocking/reporting features

- [ ] **Venue Features**
  - Verify venue search functionality
  - Check venue filtering options
  - Audit venue rating calculations
  - Verify venue images handling
  - Check venue metadata completeness
  - Audit venue update procedures

- [ ] **Band Features**
  - Verify band search implementation
  - Check band filtering
  - Audit band metadata
  - Verify band image handling
  - Check genre/style classification

- [ ] **Review System**
  - Check review creation workflow
  - Verify review editing/deletion
  - Audit review moderation
  - Check review sorting/filtering
  - Verify review media handling
  - Audit review approval workflow

- [ ] **Badge System**
  - Verify badge criteria implementation
  - Check badge awarding logic
  - Audit badge display
  - Verify badge progression
  - Check badge statistics

- [ ] **Event Management**
  - Verify event creation
  - Check event scheduling
  - Audit event discovery
  - Verify event registration
  - Check event notifications

- [ ] **Check-in System**
  - Verify check-in creation
  - Check check-in validation
  - Audit check-in statistics
  - Verify location tracking
  - Check check-in rewards

- [ ] **Notifications**
  - Verify notification delivery
  - Check notification types coverage
  - Audit notification preferences
  - Verify push notification implementation
  - Check in-app notification display

- [ ] **Feed Features**
  - Verify feed algorithm
  - Check personalization logic
  - Audit content ranking
  - Verify activity feed
  - Check recommendation engine

- [ ] **Follow System**
  - Verify follow functionality
  - Check unfollow procedures
  - Audit follower notifications
  - Verify follow suggestions

- [ ] **Wishlist**
  - Verify wishlist CRUD operations
  - Check wishlist sharing
  - Audit wishlist privacy
  - Verify wishlist recommendations

#### 4.3 Incomplete Features - Mobile
- [ ] **Authentication UI**
  - Check login screen completion
  - Verify registration flow
  - Audit password recovery
  - Check biometric authentication
  - Verify token refresh UI

- [ ] **Venue Browse**
  - Verify venue listing UI
  - Check venue detail screen
  - Audit venue search implementation
  - Verify venue filtering UI
  - Check venue recommendations

- [ ] **Band Browse**
  - Verify band listing
  - Check band detail screen
  - Audit band search
  - Verify band filtering
  - Check related bands suggestions

- [ ] **Review Creation/Viewing**
  - Verify review creation flow
  - Check review detail view
  - Audit review media upload
  - Verify review editing
  - Check review deletion

- [ ] **User Profile**
  - Verify profile editing
  - Check privacy settings UI
  - Audit notification settings
  - Verify account management
  - Check data export/deletion

- [ ] **Real-Time Features**
  - Verify WebSocket connection UI
  - Check real-time updates display
  - Audit connection status indicator
  - Verify offline handling
  - Check reconnection UI

- [ ] **Accessibility**
  - Check screen reader support
  - Verify text scaling
  - Audit color contrast
  - Check keyboard navigation
  - Verify touch targets (48x48 dp minimum)

#### 4.4 API Incompleteness
- [ ] **Endpoint Coverage**
  - Verify all documented endpoints implemented
  - Check endpoint parameter handling
  - Audit response completeness
  - Verify error response formats
  - Check pagination implementation

- [ ] **Endpoint Validation**
  - Verify required fields validation
  - Check field format validation
  - Audit business logic validation
  - Verify authorization checks
  - Check error message clarity

#### 4.5 Database Issues
- [ ] **Schema Completeness**
  - Verify all tables implemented
  - Check relationship definitions
  - Audit index creation
  - Verify constraints
  - Check default values

- [ ] **Migration Status**
  - Verify all migrations executed
  - Check migration reversibility
  - Audit migration testing
  - Verify data integrity post-migration

#### 4.6 Documentation Gaps
- [ ] **Code Documentation**
  - Identify undocumented functions
  - Check JSDoc/Dartdoc completeness
  - Audit complex logic documentation
  - Verify API documentation
  - Check README updates

- [ ] **Architecture Documentation**
  - Review architecture diagrams
  - Verify data flow documentation
  - Audit deployment procedures
  - Check troubleshooting guides
  - Verify contributing guidelines

#### 4.7 Testing Gaps
- [ ] **Unit Test Coverage**
  - Identify untested services
  - Check untested controllers
  - Audit utility function testing
  - Verify middleware testing
  - Check model validation testing

- [ ] **Integration Tests**
  - Verify API integration tests
  - Check database integration tests
  - Audit authentication flow tests
  - Verify end-to-end scenarios

- [ ] **Mobile Testing**
  - Verify widget tests
  - Check provider tests
  - Audit integration tests
  - Verify E2E tests

#### 4.8 Performance Optimization TODOs
- [ ] **Backend Optimization**
  - Identify N+1 query opportunities
  - Check caching implementation needs
  - Audit query optimization TODO items
  - Verify database indexing TODOs
  - Check API response optimization

- [ ] **Mobile Optimization**
  - Identify excessive rebuilds
  - Check image optimization TODOs
  - Audit animation performance
  - Verify memory optimization opportunities
  - Check battery optimization TODOs

#### 4.9 Technical Debt Inventory
- [ ] **Code Quality Debt**
  - Identify code smell areas
  - Check duplicate code sections
  - Audit complex functions (cognitive complexity)
  - Verify refactoring opportunities
  - Check naming improvements needed

- [ ] **Architecture Debt**
  - Identify scalability concerns
  - Check separation of concerns
  - Audit coupling issues
  - Verify design pattern misapplications
  - Check monolithic components

- [ ] **Dependency Debt**
  - Identify deprecated packages
  - Check outdated versions
  - Audit unused dependencies
  - Verify alternative package benefits

#### 4.10 Known Issues & Workarounds
- [ ] **Documentation of Workarounds**
  - Search for commented-out code
  - Identify browser/platform-specific workarounds
  - Audit temporary solutions
  - Check issue tracker references
  - Verify workaround necessity

- [ ] **Platform-Specific Issues**
  - Review Android-specific workarounds
  - Check iOS-specific issues
  - Audit Web-specific implementations
  - Verify device compatibility

#### 4.11 Completion Roadmap Assessment
- [ ] **Feature Completion**
  - Map features to requirements
  - Verify MVP features complete
  - Check stretch goal status
  - Audit future feature placeholders
  - Verify phased rollout readiness

- [ ] **Quality Metrics**
  - Check code coverage targets
  - Verify performance benchmarks
  - Audit security checklist completion
  - Check documentation completeness
  - Verify test coverage

#### 4.12 Priority Assessment
- [ ] **Critical Stubs** (blocks production)
  - Identify blocking issues
  - Check security-critical TODOs
  - Verify data integrity blockers
  - Audit compliance blockers

- [ ] **High Priority** (should complete soon)
  - Identify core feature gaps
  - Check important bug fixes
  - Audit performance issues
  - Verify usability gaps

- [ ] **Medium Priority** (nice to have)
  - Identify polish TODOs
  - Check optimization opportunities
  - Audit documentation improvements
  - Verify UX enhancements

- [ ] **Low Priority** (future work)
  - Identify aspirational features
  - Check research items
  - Audit experimental implementations
  - Verify nice-to-have optimizations

**Deliverable:** Technical debt assessment with prioritized completion roadmap; Feature completion matrix; Refactoring recommendations.

---

## CROSS-CUTTING CONCERNS

### Environment-Specific Reviews
- **Development Environment:** Verify debug features safely isolated
- **Staging Environment:** Verify production-like configuration
- **Production Environment:** Verify hardened configuration, monitoring

### Platform-Specific Issues
- **Android:** Review Android-specific code in mobile/android/
- **iOS:** Review iOS-specific code in mobile/ios/
- **Backend:** Review Node.js/Express configurations

### Phase Interdependencies
- Security issues may impact stability
- Privacy issues may require security changes
- Bugs may reveal incomplete features
- Incomplete features may have security implications

---

## REPORTING STRUCTURE

### Phase 1 Output: Security_Report.md
```
# SoundCheck Security Review Report

## Executive Summary
- Overall security posture: [Assessment]
- Critical findings: [Count]
- High findings: [Count]
- Medium findings: [Count]

## Detailed Findings
[For each finding]
- Vulnerability: [Title]
- Severity: [Critical/High/Medium/Low]
- CVSS Score: [3.9]
- Location: [File/Line]
- Description: [Detailed explanation]
- Impact: [Business/Technical impact]
- Remediation: [Step-by-step fix]
- References: [CWE/OWASP]

## Recommendations
- Immediate actions (1-2 weeks)
- Short-term improvements (1-2 months)
- Long-term enhancements (3+ months)

## Compliance Checklist
- [List security standards compliance]
```

### Phase 2 Output: Privacy_Compliance_Report.md
```
# SoundCheck Privacy & Data Protection Review

## Executive Summary
- GDPR Readiness: [%]
- CCPA Readiness: [%]
- Data Protection Score: [0-100]

## Privacy Issues
[For each issue]
- Category: [Data Protection/Consent/Retention/etc]
- Severity: [Critical/High/Medium]
- Description: [Issue details]
- Impact: [Legal/User trust/Business]
- Remediation: [Compliance fix]

## Data Flow Diagram
[Diagram showing data movement]

## Privacy Metrics
- Data types collected: [List]
- Third-party sharing: [Yes/No, which]
- User rights implemented: [%]
- Breach procedures: [Y/N]
```

### Phase 3 Output: Bug_Report.md
```
# SoundCheck Code Quality & Issues Review

## Executive Summary
- Total issues found: [Count]
- Critical bugs: [Count]
- Code coverage: [%]
- Technical debt: [High/Medium/Low]

## Issues by Category
### Backend Issues
[For each bug]
- ID: [BUG-XXX]
- Title: [Bug title]
- Severity: [Critical/High/Medium/Low]
- File: [Path:Line]
- Description: [Bug details]
- Reproduction: [Steps]
- Impact: [User/System impact]
- Fix: [Recommended solution]

### Mobile Issues
[Same structure as backend]

### Database Issues
[Same structure]

## Performance Issues
- Slow queries: [List with query times]
- Memory leaks: [Locations]
- N+1 patterns: [Occurrences]

## Code Quality Metrics
- Cyclomatic complexity: [Average]
- Type coverage: [%]
- Test coverage: [%]
- Dependency health: [Score]
```

### Phase 4 Output: Technical_Debt_Assessment.md
```
# SoundCheck - Stubs & Technical Debt Review

## Executive Summary
- Total stubs/TODOs: [Count]
- Feature completion: [%]
- Technical debt score: [0-100]

## Incomplete Features
### Critical (Blocks production)
- Feature: [Name]
  - Location: [File/Module]
  - Status: [% complete]
  - Blocker: [Why]
  - ETA: [Estimate]

### High Priority (Important)
[Same structure]

### Medium Priority (Nice to have)
[Same structure]

### Low Priority (Future work)
[Same structure]

## TODO/FIXME Inventory
```
Location: File:Line
Type: [TODO/FIXME/HACK/XXX/BUG]
Description: [Comment text]
Priority: [Critical/High/Medium/Low]
Owner: [If assignable]
```

## Recommendations
- Quick wins: [Items doable in <1 week]
- Sprint items: [1-2 week tasks]
- Epic items: [Multi-sprint tasks]
```

---

## INSTRUCTIONS FOR AGENTIC SYSTEM

### Phase Execution
1. **Independence:** Each phase should be executed as a separate, complete analysis
2. **Context Awareness:** Provide each phase with full repository context
3. **Output Format:** Generate structured reports with specific metrics and findings
4. **Severity Classification:** Use consistent severity levels across all phases

### Integration Points
- Phase 1 (Security) findings should inform Phase 2 (Privacy) review
- Phase 3 (Bugs) may identify root causes for Phase 1/2 issues
- Phase 4 (Incomplete) context helps understand Phase 1/2/3 issues

### Required Capabilities
- Code static analysis (identifying patterns, vulnerabilities)
- Configuration review (environment, deployment)
- Documentation evaluation
- Architecture assessment
- Risk scoring and prioritization
- Report generation with remediation steps

### Success Criteria
- All identified issues have clear severity levels
- All recommendations have estimated effort
- No findings are duplicated across phases
- Each report is actionable and specific
- Cross-phase dependencies are noted

---

## CONTEXT PROVIDED

**Repository:** https://github.com/DasBluEyedDevil/SoundCheck
**Technology Stack:**
- Backend: Express.js + TypeScript + PostgreSQL
- Mobile: Flutter (Material 3) + Riverpod + GoRouter + Dio
- Deployment: Railway/Vercel
- Real-time: WebSocket support

**Key Components:**
- User authentication & authorization
- Venue & band discovery
- Review system with ratings
- Badge/gamification system
- Social features (follow, feed)
- Real-time notifications
- File upload handling
- Event management
- Check-in system

**Project Maturity:** Production application with multiple phase completions documented
