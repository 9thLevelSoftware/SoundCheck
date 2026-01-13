# 🔒 Backend Security Setup Guide

## Critical Security Issues to Fix

### 1. Generate Strong JWT Secret

**Current Issue:** JWT_SECRET uses a placeholder value

**Fix:**
```bash
# Generate a cryptographically secure secret
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

Copy the output and update your `.env` file:
```env
JWT_SECRET=<paste-the-generated-secret-here>
```

### 2. Remove .env from Git

**Current Issue:** `.env` is tracked by git with sensitive credentials

**Fix:**
```bash
# Stop tracking .env
git rm --cached backend/.env

# Add to .gitignore (already done)
echo "backend/.env" >> .gitignore

# Commit the change
git add .gitignore
git commit -m "Remove .env from version control"
```

### 3. Update CORS Configuration

**Current Issue:** CORS is set to `http://localhost:3000` which blocks mobile app

**Fix for Production:**

Update `backend/src/index.ts`:

```typescript
// CORS configuration for mobile apps
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps)
    if (!origin) return callback(null, true);
    
    // In production, you might want to whitelist specific origins
    // For now, allow all for mobile development
    if (process.env.NODE_ENV === 'production') {
      // Add your production domains here
      const allowedOrigins = [
        'https://your-web-app.com',
        'https://www.your-web-app.com'
      ];
      if (allowedOrigins.indexOf(origin) === -1) {
        // For mobile apps, we allow any origin (they don't send origin header)
        return callback(null, true);
      }
    }
    callback(null, true);
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
};
```

Or simpler for mobile-first apps:
```typescript
const corsOptions = {
  origin: '*', // Allow all origins for mobile apps
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: false, // Must be false when origin is '*'
};
```

### 4. Rate Limiting Improvements

**Current Issue:** In-memory rate limiting doesn't persist across server restarts

**Recommendation:** For production, use Redis-based rate limiting

Install redis rate limiter:
```bash
npm install express-rate-limit rate-limit-redis ioredis
```

Update middleware (optional for now, can be done later):
```typescript
import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL);

const limiter = rateLimit({
  store: new RedisStore({
    client: redis,
    prefix: 'rate-limit:',
  }),
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
});

app.use('/api', limiter);
```

## Production Environment Variables

### Required Environment Variables

Create these in your production environment (Vercel, Railway, etc.):

```env
# Database - Use production PostgreSQL URL
DATABASE_URL=postgresql://user:password@production-host:5432/soundcheck
DB_HOST=production-host
DB_PORT=5432
DB_NAME=soundcheck
DB_USER=production_user
DB_PASSWORD=strong_password_here

# JWT - Use strong generated secret
JWT_SECRET=<your-64-char-hex-secret>
JWT_EXPIRES_IN=7d

# Server
PORT=3000
NODE_ENV=production

# CORS - Allow mobile apps
CORS_ORIGIN=*
```

### Database Security

**Use managed PostgreSQL service:**
- Railway PostgreSQL
- Supabase
- AWS RDS
- Google Cloud SQL
- Azure Database for PostgreSQL

**Benefits:**
- Automatic backups
- SSL/TLS encryption
- High availability
- Monitoring and alerts

### SSL/TLS Configuration

**For Vercel/Railway:** SSL is automatic ✅

**For custom hosting:**
- Use Let's Encrypt for free SSL certificates
- Configure HTTPS in your web server
- Redirect HTTP to HTTPS

## Security Checklist

Before deploying to production:

- [ ] JWT_SECRET is strong and unique (64+ characters)
- [ ] `.env` file is NOT in git repository
- [ ] Database uses strong passwords
- [ ] Database connection uses SSL/TLS
- [ ] CORS configured for mobile apps
- [ ] Rate limiting enabled on all routes
- [ ] Helmet middleware enabled (already done ✅)
- [ ] Input validation on all endpoints (already done ✅)
- [ ] SQL injection prevention (using parameterized queries ✅)
- [ ] Password hashing with bcrypt (already done ✅)
- [ ] Error messages don't expose sensitive info
- [ ] Production logs don't contain passwords/tokens
- [ ] HTTPS enforced in production
- [ ] Database backups configured
- [ ] Monitoring/alerting set up

## Testing Security

### Test JWT Secret
```bash
# Verify JWT secret is set
curl https://your-api.com/health

# Try to access protected route without token
curl https://your-api.com/api/users/me
# Should return 401 Unauthorized

# Login and test with token
curl -X POST https://your-api.com/api/users/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"TestPass123!"}'

# Use returned token
curl https://your-api.com/api/users/me \
  -H "Authorization: Bearer <token-from-login>"
```

### Test CORS
```bash
# Test from mobile app - should work
curl -X OPTIONS https://your-api.com/api/venues \
  -H "Origin: null" \
  -H "Access-Control-Request-Method: GET"
```

### Test Rate Limiting
```bash
# Send 100+ requests quickly
for i in {1..101}; do
  curl https://your-api.com/api/venues
done
# Should get 429 Too Many Requests after 100
```

## Monitoring and Logging

### Recommended Tools

**Error Tracking:**
- Sentry (free tier available)
- Rollbar
- Bugsnag

**Application Monitoring:**
- New Relic
- Datadog
- Application Insights (Azure)

**Log Management:**
- Papertrail
- Loggly
- CloudWatch (AWS)

### Setup Sentry (Optional)

```bash
npm install @sentry/node
```

```typescript
import * as Sentry from "@sentry/node";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
});

app.use(Sentry.Handlers.errorHandler());
```

## Regular Security Maintenance

### Weekly
- [ ] Review error logs for security issues
- [ ] Check for failed authentication attempts
- [ ] Monitor API usage patterns

### Monthly
- [ ] Update npm dependencies (`npm audit fix`)
- [ ] Review user access patterns
- [ ] Check database backup integrity
- [ ] Review rate limit effectiveness

### Quarterly
- [ ] Security audit
- [ ] Penetration testing (if budget allows)
- [ ] Review and update security policies
- [ ] Rotate JWT secrets (if compromised)

## Incident Response Plan

If you detect a security breach:

1. **Immediate Actions:**
   - Disable affected API endpoints
   - Rotate JWT secrets
   - Force password reset for affected users
   - Document the incident

2. **Investigation:**
   - Review logs for unauthorized access
   - Identify compromised data
   - Determine attack vector

3. **Remediation:**
   - Fix vulnerabilities
   - Deploy security patches
   - Monitor for recurrence

4. **Communication:**
   - Notify affected users
   - Report to authorities if required
   - Update security documentation

## Additional Resources

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)
- [Express Security Best Practices](https://expressjs.com/en/advanced/best-practice-security.html)
