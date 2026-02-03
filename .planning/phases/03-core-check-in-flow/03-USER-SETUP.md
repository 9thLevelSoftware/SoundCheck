# Phase 3: User Setup Required

## Cloudflare R2 (Photo Storage)

The photo upload pipeline requires a Cloudflare R2 bucket for storing check-in photos. Photos are uploaded directly from the mobile app to R2 via presigned URLs (never proxied through the backend server).

### Why

Railway's filesystem is ephemeral -- files are lost on every deploy. Cloudflare R2 provides persistent, S3-compatible object storage with a generous free tier (10 GB storage, 10 million reads/month, 1 million writes/month). The presigned URL pattern means the backend only generates upload URLs; actual file transfer goes client -> R2 directly, keeping Railway bandwidth low.

### How to Set Up

#### 1. Create R2 Bucket

1. Go to https://dash.cloudflare.com/
2. Select your account
3. Navigate to **R2 Object Storage** in the left sidebar
4. Click **Create bucket**
5. Name it: `soundcheck-photos`
6. Choose a location hint closest to your users (or leave "Automatic")
7. Click **Create bucket**

#### 2. Enable Public Access

1. In the R2 dashboard, click on `soundcheck-photos` bucket
2. Go to **Settings** tab
3. Under **Public access**, click **Allow Access**
4. Choose **R2.dev subdomain** (free, easiest) or configure a custom domain
5. Copy the public URL (e.g., `https://pub-abc123def456.r2.dev`)

#### 3. Create R2 API Token

1. In the R2 dashboard, click **Manage R2 API Tokens** (top right area)
2. Click **Create API token**
3. Set permissions: **Object Read & Write**
4. Scope: Apply to specific bucket -> `soundcheck-photos`
5. Click **Create API Token**
6. **Copy immediately** -- the secret is shown only once:
   - Access Key ID
   - Secret Access Key

#### 4. Configure CORS

1. In the R2 dashboard, click on `soundcheck-photos` bucket
2. Go to **Settings** tab
3. Under **CORS policy**, click **Add CORS policy**
4. Configure:
   ```json
   [
     {
       "AllowedOrigins": ["*"],
       "AllowedMethods": ["PUT", "GET"],
       "AllowedHeaders": ["Content-Type"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```
5. Save the policy

#### 5. Get Account ID

1. In the Cloudflare dashboard, go to **R2 Object Storage** -> **Overview**
2. Your **Account ID** is displayed in the top-right area (or in the URL)

### Environment Variables

Add to your `.env` file in the `backend/` directory:

```
CLOUDFLARE_ACCOUNT_ID=your_account_id_here
R2_ACCESS_KEY_ID=your_access_key_id_here
R2_SECRET_ACCESS_KEY=your_secret_access_key_here
R2_BUCKET_NAME=soundcheck-photos
R2_PUBLIC_URL=https://pub-abc123def456.r2.dev
```

For Railway deployment, add these as environment variables in the Railway dashboard.

### Verification

The backend starts normally without R2 credentials -- it logs a warning:
```
R2Service: Missing R2 credentials, photo uploads disabled
```

With credentials configured, photo upload will work end-to-end:
1. Mobile app requests presigned URL via `POST /api/checkins/:id/photos`
2. Backend returns presigned PUT URL
3. Mobile app PUTs compressed photo directly to R2
4. Mobile app confirms via `PATCH /api/checkins/:id/photos`
5. Photo visible at public URL

### Cost

Cloudflare R2 free tier (no credit card required for small usage):
- **Storage:** 10 GB/month free
- **Class A operations (writes):** 1 million/month free
- **Class B operations (reads):** 10 million/month free
- **Egress:** Free (no bandwidth charges -- this is R2's main advantage over S3)

At ~500 KB per compressed photo and 4 photos/check-in max, the free tier supports approximately 5,000 check-ins with full photo sets before incurring any cost.
