# 🚂 Railway Deployment - Step by Step

## Prerequisites ✅
- [x] GitHub account
- [x] Backend code ready (in this repo)
- [x] 10-15 minutes of time

---

## 📝 Step-by-Step Instructions

### **Step 1: Sign Up for Railway**

1. Go to **https://railway.app**
2. Click **"Login"** in the top right
3. Choose **"Login with GitHub"**
4. Authorize Railway to access your GitHub account

✅ **You now have a Railway account with $5 free credit!**

---

### **Step 2: Create New Project**

1. On Railway dashboard, click **"New Project"**
2. Select **"Deploy from GitHub repo"**
3. If prompted, click **"Configure GitHub App"**
4. Select your **SoundCheck** repository
5. Click **"Install & Authorize"**

---

### **Step 3: Configure Backend Service**

1. Railway will show your repository
2. Click **"Add variables"** (we'll add these in Step 5)
3. Click **"Settings"** tab
4. Under **"Root Directory"**, set it to: **`backend`**
5. Under **"Build Command"**, it should show: `npm install && npm run build`
6. Under **"Start Command"**, it should show: `npm start`

✅ **Backend service configured!**

---

### **Step 4: Add PostgreSQL Database**

1. In your project view, click **"New"** button (top right)
2. Select **"Database"**
3. Choose **"Add PostgreSQL"**
4. Wait 30 seconds for database to provision

✅ **Database created! Railway automatically sets DATABASE_URL**

---

### **Step 5: Set Environment Variables**

**IMPORTANT:** You need a strong JWT secret!

**Your Generated JWT Secret:**
```
[I'll generate this in the next step - copy it when you see it!]
```

1. Click on your **backend service** (the one with your code)
2. Click **"Variables"** tab
3. Click **"New Variable"** and add each of these:

**Add these variables one by one:**

| Variable Name | Value |
|---------------|-------|
| `NODE_ENV` | `production` |
| `JWT_SECRET` | `[YOUR_GENERATED_SECRET_FROM_BELOW]` |
| `JWT_EXPIRES_IN` | `7d` |
| `CORS_ORIGIN` | `*` |
| `PORT` | `3000` |

**Don't add DATABASE_URL** - Railway sets this automatically when you added PostgreSQL!

✅ **Environment variables configured!**

---

### **Step 6: Deploy!**

Railway automatically deploys when you:
- Add variables
- Push to GitHub

**To trigger deployment now:**
1. Click on your backend service
2. Click **"Deployments"** tab
3. If not deploying, click **"Deploy"** button

**Watch the logs:**
- Click on the deployment
- Watch the build logs (2-3 minutes)
- Look for: ✅ "Build successful"
- Look for: ✅ "Deployment successful"

---

### **Step 7: Get Your API URL**

1. Click on your backend service
2. Click **"Settings"** tab
3. Scroll to **"Domains"** section
4. Click **"Generate Domain"**
5. Railway creates a URL like: `https://soundcheck-backend-production.up.railway.app`

**Copy this URL!** You'll need it for:
- Testing the API
- Updating your Android app

✅ **Your API is now live!**

---

### **Step 8: Initialize Database Schema**

Now we need to create the database tables.

**Option A: Using Railway's PostgreSQL Client (Easiest)**

1. Click on your **PostgreSQL** service
2. Click **"Data"** tab
3. Click **"Query"** button
4. Copy the contents of `backend/database-schema.sql`
5. Paste into the query editor
6. Click **"Run Query"**
7. You should see "Successfully executed" messages

**Option B: Using psql (Command Line)**

1. Click on your **PostgreSQL** service
2. Click **"Connect"** tab
3. Copy the **PostgreSQL Connection URL**
4. In your terminal:

```bash
# Connect to Railway database
psql "postgresql://postgres:PASSWORD@HOST:PORT/railway"

# Run the schema
\i backend/database-schema.sql

# Verify tables were created
\dt

# You should see:
# - users
# - venues
# - bands
# - reviews
# - badges
# - user_badges
# - user_followers
# - review_helpfulness

# Exit
\q
```

✅ **Database schema initialized!**

---

### **Step 9: Test Your API**

**Test the health endpoint:**

```bash
# Replace with YOUR Railway URL
curl https://your-app.up.railway.app/health
```

**Expected response:**
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "timestamp": "2025-10-21T...",
    "version": "1.0.0",
    "database": "connected"
  }
}
```

**If you see "database": "connected"** - Success! 🎉

---

### **Step 10: Test User Registration**

```bash
# Replace with YOUR Railway URL
curl -X POST https://your-app.up.railway.app/api/users/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "TestPass123!",
    "username": "testuser",
    "firstName": "Test"
  }'
```

**Expected response:**
```json
{
  "success": true,
  "message": "User registered successfully",
  "data": {
    "id": "...",
    "email": "test@example.com",
    "username": "testuser",
    ...
  }
}
```

---

### **Step 11: Test Login**

```bash
curl -X POST https://your-app.up.railway.app/api/users/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "TestPass123!"
  }'
```

**Expected response:**
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "user": {...},
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

**Save that token!** You'll use it for authenticated requests.

---

### **Step 12: Test Protected Endpoint**

```bash
# Use the token from login
curl https://your-app.up.railway.app/api/users/me \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

✅ **All tests passing? Your backend is fully operational!**

---

## 🔧 **Troubleshooting**

### **Deployment Failed**

**Check build logs:**
1. Click on failed deployment
2. Look for error messages
3. Common issues:
   - TypeScript errors: Fix in code, push to GitHub
   - Missing dependencies: Check package.json
   - Build command wrong: Check Settings → Build Command

### **Database Connection Failed**

**Verify DATABASE_URL is set:**
1. Click backend service → Variables
2. Look for `DATABASE_URL` (should be there automatically)
3. If missing, Railway didn't link the database
4. Solution: Click "New" → "Database" → "Add PostgreSQL" again

### **"Cannot connect to database"**

**Database might not be initialized:**
1. Go back to Step 8
2. Run the database-schema.sql
3. Verify tables exist

### **API returns 502 Bad Gateway**

**Service might not be starting:**
1. Check deployment logs
2. Look for: "SoundCheck API Server running on port 3000"
3. If not starting, check:
   - `npm start` command in package.json
   - dist/index.js exists after build

### **CORS errors from Android app**

**Verify CORS_ORIGIN:**
1. Backend service → Variables
2. Make sure `CORS_ORIGIN = *`
3. Redeploy if you changed it

---

## 📱 **Update Android App**

Once your API is working, update your Android app:

### **Update API URL**

Edit: `app/src/main/java/com/example/soundcheckandroid/data/network/ApiConfig.kt`

```kotlin
object ApiConfig {
    // Production API URL - Update with your Railway URL
    private const val PROD_BASE_URL = "https://your-app.up.railway.app/api/"
    
    // Keep emulator URL for development
    private const val DEV_EMULATOR_URL = "http://10.0.2.2:3000/api/"
    
    val BASE_URL: String
        get() = if (isDebugBuild()) {
            DEV_EMULATOR_URL
        } else {
            PROD_BASE_URL
        }
    
    private fun isDebugBuild(): Boolean = true // Set to false for release
    
    const val CONNECT_TIMEOUT = 30L
    const val READ_TIMEOUT = 30L
    const val WRITE_TIMEOUT = 30L
}
```

### **Build and Test**

```bash
# Build debug APK
./gradlew assembleDebug

# Install on device
adb install app/build/outputs/apk/debug/app-debug.apk

# Test the app:
# - Register a user
# - Login
# - View venues
# - View bands
```

---

## 📊 **Monitor Your App**

### **Railway Dashboard**

**Metrics to watch:**
1. **Deployments** - Successful/failed deploys
2. **Metrics** - CPU, Memory, Network usage
3. **Logs** - Real-time application logs
4. **Database** - Storage used, queries

### **Usage & Billing**

1. Click your profile (top right)
2. Click **"Usage"**
3. See your $5 credit status
4. Estimate: $5 = ~1-2 months of beta testing

---

## ✅ **Success Checklist**

Before moving to Android app:

- [ ] Railway account created
- [ ] Project created from GitHub
- [ ] PostgreSQL database added
- [ ] Environment variables set (especially JWT_SECRET)
- [ ] Backend deployed successfully
- [ ] Database schema initialized
- [ ] Health endpoint returns "connected"
- [ ] User registration works
- [ ] User login works
- [ ] Protected endpoints work with token
- [ ] Railway URL copied

---

## 🎉 **You're Done!**

Your backend is now live at: `https://your-app.up.railway.app`

**Next steps:**
1. Update Android app with Railway URL
2. Test app with real backend
3. Continue with beta release preparation

**Need help?**
- Railway Docs: https://docs.railway.app
- Railway Discord: https://discord.gg/railway
- Check deployment logs in Railway dashboard

---

## 💰 **Cost Tracking**

**Your $5 Credit:**
- Check usage: Railway Dashboard → Usage
- Typical beta usage: $2-3/month
- Credit lasts: ~2 months
- After credit: ~$5/month (pay-as-you-go)

**To stop billing:**
- Delete project in Railway (if needed)
- Data will be lost!

---

## 🔄 **Auto-Deployment**

**Great news!** Railway automatically redeploys when you push to GitHub.

**To deploy changes:**
```bash
git add .
git commit -m "Update backend"
git push origin main

# Railway automatically deploys!
# Check Deployments tab in Railway
```

---

**Happy deploying! 🚀**
