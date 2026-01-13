# 🚀 Backend Deployment Guide

This guide covers deploying the SoundCheck backend API to production.

## Table of Contents
1. [Choose a Hosting Platform](#hosting-platforms)
2. [Set Up Database](#database-setup)
3. [Deploy Backend](#deploy-backend)
4. [Configure Environment Variables](#environment-variables)
5. [Test Deployment](#testing)
6. [Update Mobile App](#update-mobile-app)

---

## Hosting Platforms

### Option 1: Vercel (Recommended - Easiest)

**Pros:** Free tier, automatic deployments, built-in SSL, serverless

**Pricing:** Free for small apps, $20/month Pro if needed

**Steps:**

1. **Install Vercel CLI:**
```bash
npm install -g vercel
```

2. **Login to Vercel:**
```bash
vercel login
```

3. **Deploy:**
```bash
cd backend
npm run build
vercel --prod
```

4. **Set environment variables** (in Vercel dashboard or CLI):
```bash
vercel env add DATABASE_URL
vercel env add JWT_SECRET
vercel env add NODE_ENV production
```

### Option 2: Railway (Recommended - Best for Beginners)

**Pros:** Free $5/month credit, includes PostgreSQL, simple setup

**Pricing:** Pay-as-you-go after free credit

**Steps:**

1. **Create account at [railway.app](https://railway.app)**

2. **Create new project:**
   - Click "New Project"
   - Select "Deploy from GitHub repo"
   - Connect your repository
   - Select the backend folder

3. **Add PostgreSQL:**
   - Click "New" → "Database" → "Add PostgreSQL"
   - Railway will automatically set DATABASE_URL

4. **Set environment variables:**
   - Go to your service → Variables
   - Add JWT_SECRET, NODE_ENV, etc.

5. **Deploy:**
   - Push to GitHub, Railway auto-deploys

### Option 3: Render

**Pros:** Free tier, easy database integration

**Pricing:** Free for basic apps, $7/month for better performance

**Steps:**

1. **Create account at [render.com](https://render.com)**

2. **Create PostgreSQL database:**
   - Dashboard → New → PostgreSQL
   - Note the connection string

3. **Create Web Service:**
   - Dashboard → New → Web Service
   - Connect GitHub repo
   - Select backend directory
   - Build command: `npm install && npm run build`
   - Start command: `npm start`

4. **Set environment variables**

### Option 4: Heroku

**Pros:** Well-established, many addons

**Pricing:** No longer has free tier, starts at $7/month

**Steps:**

1. **Install Heroku CLI**

2. **Create app:**
```bash
cd backend
heroku create soundcheck-api
```

3. **Add PostgreSQL:**
```bash
heroku addons:create heroku-postgresql:mini
```

4. **Deploy:**
```bash
git push heroku main
```

---

## Database Setup

### Option 1: Railway PostgreSQL (Easiest)

1. In Railway, click "New" → "Database" → "PostgreSQL"
2. Railway automatically sets DATABASE_URL environment variable
3. Connect to run schema:
```bash
# Get connection string from Railway dashboard
psql "postgresql://user:pass@host:port/railway"
\i database-schema.sql
```

### Option 2: Supabase (Free Tier)

1. Create account at [supabase.com](https://supabase.com)
2. Create new project
3. Go to Settings → Database
4. Copy connection string
5. Run schema in SQL Editor or via psql

### Option 3: Neon (Serverless PostgreSQL)

1. Create account at [neon.tech](https://neon.tech)
2. Create project
3. Copy connection string
4. Run schema via psql or Neon console

### Initialize Database Schema

```bash
# Connect to your production database
psql "your-production-database-url"

# Run the schema
\i database-schema.sql

# Verify tables created
\dt

# Exit
\q
```

---

## Deploy Backend

### Vercel Deployment

```bash
cd backend

# Build the project
npm run build

# Deploy to production
vercel --prod

# Your API will be at: https://soundcheck-api.vercel.app
```

### Railway Deployment

```bash
# Railway deploys automatically on git push
git add .
git commit -m "Deploy to production"
git push origin main

# Railway will auto-deploy
```

### Manual Deployment Steps

If using a VPS or traditional server:

```bash
# On your server
git clone your-repo
cd backend
npm install
npm run build

# Set environment variables
export DATABASE_URL="your-db-url"
export JWT_SECRET="your-secret"
export NODE_ENV="production"

# Run with PM2 (process manager)
npm install -g pm2
pm2 start dist/index.js --name soundcheck-api

# Setup PM2 to restart on reboot
pm2 startup
pm2 save
```

---

## Environment Variables

Set these in your hosting platform:

### Required Variables

```env
# Database
DATABASE_URL=postgresql://user:password@host:port/database

# JWT (generate with: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")
JWT_SECRET=your-64-character-hex-string

# Server
NODE_ENV=production
PORT=3000

# CORS (allow mobile apps)
CORS_ORIGIN=*
```

### Optional Variables

```env
# JWT token expiration
JWT_EXPIRES_IN=7d

# Separate database credentials (if not using DATABASE_URL)
DB_HOST=your-host
DB_PORT=5432
DB_NAME=soundcheck
DB_USER=your-user
DB_PASSWORD=your-password
```

---

## Testing Deployment

### 1. Test Health Endpoint

```bash
curl https://your-api-url.com/health
```

Expected response:
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "timestamp": "2024-01-01T00:00:00.000Z",
    "version": "1.0.0",
    "database": "connected"
  }
}
```

### 2. Test User Registration

```bash
curl -X POST https://your-api-url.com/api/users/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "TestPass123!",
    "username": "testuser",
    "firstName": "Test"
  }'
```

### 3. Test Login

```bash
curl -X POST https://your-api-url.com/api/users/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "TestPass123!"
  }'
```

Save the token from the response!

### 4. Test Protected Endpoint

```bash
curl https://your-api-url.com/api/users/me \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

### 5. Test Venues

```bash
curl https://your-api-url.com/api/venues
```

### 6. Test Bands

```bash
curl https://your-api-url.com/api/bands
```

---

## Update Mobile App

Once backend is deployed, update the Android app:

1. **Update API URL in ApiConfig.kt:**
```kotlin
object ApiConfig {
    private const val PROD_BASE_URL = "https://your-api-url.com/api/"
    // ... rest of the code
}
```

2. **Test with mobile app:**
   - Build debug APK
   - Test all features
   - Verify API calls work

3. **Build release version:**
```bash
./gradlew assembleRelease
```

---

## Monitoring and Maintenance

### Set Up Monitoring

1. **Uptime Monitoring:**
   - UptimeRobot (free)
   - Pingdom
   - StatusCake

2. **Error Tracking:**
   - Sentry (free tier)
   - Rollbar

3. **Logs:**
   - Vercel: Built-in logs
   - Railway: Built-in logs
   - Other: Papertrail, Loggly

### Regular Maintenance

**Weekly:**
- [ ] Check error logs
- [ ] Monitor API response times
- [ ] Review database size

**Monthly:**
- [ ] Update npm dependencies: `npm audit fix`
- [ ] Check database backups
- [ ] Review API usage stats

**As Needed:**
- [ ] Scale database if needed
- [ ] Optimize slow queries
- [ ] Update Node.js version

---

## Troubleshooting

### "Cannot connect to database"

**Check:**
1. DATABASE_URL is set correctly
2. Database is running and accessible
3. Firewall allows connections
4. SSL mode if required

**Fix:**
```bash
# Test database connection
psql "your-database-url"

# Check environment variables
vercel env ls  # for Vercel
# or check your platform's dashboard
```

### "CORS error from mobile app"

**Check:**
1. CORS_ORIGIN is set to `*` or includes your domains
2. Backend is receiving OPTIONS requests

**Fix:**
Update CORS_ORIGIN environment variable to `*`

### "API returns 502 Bad Gateway"

**Possible causes:**
1. Build failed - check build logs
2. Start command is wrong
3. Port configuration issue

**Fix:**
- Check logs in your hosting platform
- Verify `npm start` works locally
- Ensure PORT environment variable is set

### "Authentication always fails"

**Check:**
1. JWT_SECRET is set in production
2. Token format is correct (Bearer token)
3. Token hasn't expired

---

## Rollback Plan

If deployment fails:

### Vercel
```bash
# List deployments
vercel ls

# Rollback to previous
vercel rollback [deployment-url]
```

### Railway
- Go to deployments tab
- Click on previous successful deployment
- Click "Redeploy"

### Manual
```bash
# Revert git commit
git revert HEAD
git push

# Or checkout previous commit
git checkout <previous-commit-hash>
```

---

## Security Checklist

Before going live:

- [ ] JWT_SECRET is strong and unique
- [ ] Database password is strong
- [ ] SSL/HTTPS is enabled
- [ ] CORS is configured correctly
- [ ] Rate limiting is enabled
- [ ] Error messages don't expose sensitive data
- [ ] Database backups are configured
- [ ] Monitoring is set up
- [ ] `.env` file is not in git
- [ ] Environment variables are set in production

---

## Cost Estimates

### Free Tier (Good for beta testing):
- **Railway:** $5/month credit (enough for beta)
- **Vercel:** Free for small projects
- **Database:** Supabase or Neon free tier
- **Total:** $0-5/month

### Paid Tier (For production):
- **Railway:** ~$10-20/month
- **Vercel Pro:** $20/month (if needed)
- **Database:** ~$10-25/month
- **Total:** ~$20-65/month

---

## Next Steps

After successful deployment:

1. ✅ Test all endpoints thoroughly
2. ✅ Update mobile app with production API URL
3. ✅ Set up monitoring and alerts
4. ✅ Configure database backups
5. ✅ Document API URL for team
6. ✅ Test mobile app with production backend
7. ✅ Create test user accounts
8. ✅ Prepare for beta testing

---

**Your API is now live! 🎉**

Production URL: `https://your-api-url.com`  
Health Check: `https://your-api-url.com/health`  
API Base: `https://your-api-url.com/api/`
