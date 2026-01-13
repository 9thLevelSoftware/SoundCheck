# 🚀 SoundCheck Deployment Guide

This guide covers deploying the complete SoundCheck application to production environments.

## 📋 Prerequisites

- Node.js 18.x or later
- PostgreSQL 12.x or later
- Vercel CLI (for backend deployment)
- Expo CLI (for mobile app deployment)
- Git repository access

## 🗄️ Database Setup

### 1. Create Production Database

**Option A: Railway**
```bash
# Install Railway CLI
npm install -g @railway/cli

# Login and create project
railway login
railway init
railway add postgresql

# Get database URL
railway variables
```

**Option B: Supabase**
```bash
# Create project at https://supabase.com
# Get connection string from Settings > Database
```

**Option C: AWS RDS**
```bash
# Create PostgreSQL instance via AWS Console
# Note connection details
```

### 2. Initialize Database Schema

```bash
# Connect to your production database
psql "your-production-database-url"

# Run schema creation
\i backend/database-schema.sql

# Verify tables created
\dt
```

## 🔧 Backend Deployment (Vercel)

### 1. Prepare Backend for Deployment

```bash
cd backend

# Install Vercel CLI
npm install -g vercel

# Login to Vercel
vercel login

# Initialize project
vercel init
```

### 2. Configure Environment Variables

Create `backend/vercel.json`:
```json
{
  "version": 2,
  "builds": [
    {
      "src": "dist/index.js",
      "use": "@vercel/node"
    }
  ],
  "routes": [
    {
      "src": "/(.*)",
      "dest": "dist/index.js"
    }
  ]
}
```

Set environment variables:
```bash
# Set production environment variables
vercel env add DATABASE_URL
vercel env add JWT_SECRET
vercel env add NODE_ENV production
vercel env add PORT 3000
vercel env add CORS_ORIGIN https://your-frontend-domain.com
```

### 3. Deploy Backend

```bash
# Build the project
npm run build

# Deploy to Vercel
vercel --prod

# Your API will be available at: https://your-app.vercel.app
```

### 4. Verify Backend Deployment

```bash
# Test health endpoint
curl https://your-app.vercel.app/health

# Test API endpoint
curl https://your-app.vercel.app/api/users/check-email/test@example.com
```

## 📱 Mobile App Deployment

### 1. Prepare for App Store Deployment

```bash
cd mobile/SoundCheckMobile

# Install EAS CLI
npm install -g @expo/eas-cli

# Login to Expo
eas login

# Initialize EAS
eas build:configure
```

### 2. Configure App for Production

Update `mobile/SoundCheckMobile/src/constants/index.ts`:
```typescript
export const API_CONFIG = {
  BASE_URL: 'https://your-app.vercel.app/api', // Your deployed backend URL
  TIMEOUT: 10000,
  RETRY_ATTEMPTS: 3,
};
```

Update `mobile/SoundCheckMobile/app.json`:
```json
{
  "expo": {
    "name": "SoundCheck",
    "slug": "soundcheck",
    "version": "1.0.0",
    "orientation": "portrait",
    "icon": "./assets/icon.png",
    "userInterfaceStyle": "light",
    "splash": {
      "image": "./assets/splash.png",
      "resizeMode": "contain",
      "backgroundColor": "#2196F3"
    },
    "ios": {
      "supportsTablet": true,
      "bundleIdentifier": "com.yourcompany.soundcheck"
    },
    "android": {
      "adaptiveIcon": {
        "foregroundImage": "./assets/adaptive-icon.png",
        "backgroundColor": "#2196F3"
      },
      "package": "com.yourcompany.soundcheck"
    },
    "web": {
      "favicon": "./assets/favicon.png"
    }
  }
}
```

### 3. Build for App Stores

**Android (Google Play Store):**
```bash
# Build Android APK/AAB
eas build --platform android

# Download and test the build
eas build:list
```

**iOS (Apple App Store):**
```bash
# Build iOS IPA (requires Apple Developer account)
eas build --platform ios

# Download and test the build
eas build:list
```

### 4. Submit to App Stores

**Google Play Store:**
```bash
# Submit to Google Play Store
eas submit --platform android

# Or manually upload AAB file to Google Play Console
```

**Apple App Store:**
```bash
# Submit to Apple App Store
eas submit --platform ios

# Or manually upload IPA file via Xcode/App Store Connect
```

## 🔍 Testing Deployment

### 1. Backend API Testing

```bash
# Test all major endpoints
curl -X POST https://your-app.vercel.app/api/users/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"TestPass123!","username":"testuser","firstName":"Test"}'

curl -X POST https://your-app.vercel.app/api/users/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"TestPass123!"}'

curl https://your-app.vercel.app/api/venues

curl https://your-app.vercel.app/api/bands

curl https://your-app.vercel.app/api/badges
```

### 2. Mobile App Testing

- Test on both iOS and Android devices
- Verify all API calls work with production backend
- Test authentication flow
- Test core features: venues, bands, reviews, profile
- Verify push notifications (if implemented)
- Test offline functionality (if implemented)

## 📊 Monitoring & Maintenance

### 1. Backend Monitoring

**Error Tracking with Sentry:**
```bash
npm install @sentry/node

# Add to backend/src/index.ts
import * as Sentry from "@sentry/node";

Sentry.init({
  dsn: "YOUR_SENTRY_DSN",
});
```

**Performance Monitoring:**
```bash
# Monitor API performance
# Set up alerts for:
# - Response time > 2 seconds
# - Error rate > 5%
# - Database connection issues
```

### 2. Database Monitoring

```sql
-- Monitor database performance
SELECT * FROM pg_stat_activity;

-- Check table sizes
SELECT schemaname,tablename,attname,n_distinct,correlation 
FROM pg_stats 
WHERE schemaname = 'public';

-- Monitor slow queries
SELECT query, mean_exec_time, calls 
FROM pg_stat_statements 
ORDER BY mean_exec_time DESC 
LIMIT 10;
```

### 3. Mobile App Analytics

**Install Analytics:**
```bash
cd mobile/SoundCheckMobile
expo install expo-analytics-amplitude
# or
expo install @react-native-google-analytics/google-analytics
```

## 🔄 CI/CD Pipeline

### 1. GitHub Actions for Backend

Create `.github/workflows/backend-deploy.yml`:
```yaml
name: Deploy Backend

on:
  push:
    branches: [main]
    paths: ['backend/**']

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          
      - name: Install dependencies
        working-directory: backend
        run: npm ci
        
      - name: Run tests
        working-directory: backend
        run: npm test
        
      - name: Build
        working-directory: backend
        run: npm run build
        
      - name: Deploy to Vercel
        uses: amondnet/vercel-action@v20
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.ORG_ID }}
          vercel-project-id: ${{ secrets.PROJECT_ID }}
          working-directory: backend
```

### 2. GitHub Actions for Mobile

Create `.github/workflows/mobile-build.yml`:
```yaml
name: Build Mobile App

on:
  push:
    branches: [main]
    paths: ['mobile/**']

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          
      - name: Setup Expo
        uses: expo/expo-github-action@v7
        with:
          expo-version: latest
          token: ${{ secrets.EXPO_TOKEN }}
          
      - name: Install dependencies
        working-directory: mobile/SoundCheckMobile
        run: npm ci
        
      - name: Build Android
        working-directory: mobile/SoundCheckMobile
        run: eas build --platform android --non-interactive
```

## 🔐 Security Checklist

- [ ] JWT secret is strong and unique
- [ ] Database credentials are secure
- [ ] CORS is properly configured
- [ ] Rate limiting is enabled
- [ ] Input validation is in place
- [ ] HTTPS is enforced
- [ ] Environment variables are set correctly
- [ ] No sensitive data in logs
- [ ] API endpoints are properly protected
- [ ] Mobile app uses certificate pinning (recommended)

## 📋 Production Checklist

### Backend
- [ ] Database schema deployed
- [ ] Environment variables configured
- [ ] API endpoints tested
- [ ] Error monitoring setup
- [ ] Performance monitoring setup
- [ ] Backup strategy implemented
- [ ] SSL certificate configured
- [ ] Rate limiting configured

### Mobile App
- [ ] App icons and splash screens configured
- [ ] App store metadata prepared
- [ ] Privacy policy and terms of service ready
- [ ] App tested on multiple devices
- [ ] Push notification setup (if applicable)
- [ ] Analytics configured
- [ ] Crash reporting setup
- [ ] App store accounts ready

## 🚨 Troubleshooting

### Common Backend Issues

**Database Connection Failed:**
```bash
# Check connection string format
postgresql://username:password@host:port/database

# Test connection
psql "your-connection-string"
```

**JWT Token Issues:**
```bash
# Check JWT secret is set
echo $JWT_SECRET

# Verify token format
# Should be: Bearer <token>
```

**CORS Issues:**
```bash
# Check CORS_ORIGIN environment variable
# Should match your frontend domain exactly
```

### Common Mobile App Issues

**API Connection Failed:**
```javascript
// Check API_CONFIG.BASE_URL in constants
// Should point to your deployed backend
```

**Build Failures:**
```bash
# Clear cache and reinstall
rm -rf node_modules
npm install

# Clear Expo cache
expo r -c
```

## 📞 Support

For deployment issues:
1. Check application logs
2. Verify environment variables
3. Test API endpoints manually
4. Check database connectivity
5. Review error monitoring dashboards

---

**🎉 Congratulations! Your SoundCheck application is now live in production!**