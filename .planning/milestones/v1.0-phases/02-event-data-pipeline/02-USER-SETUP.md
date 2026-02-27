# Phase 2: User Setup Required

## Ticketmaster API Key

The event data pipeline requires a Ticketmaster Discovery API key to fetch concert and event data.

### Why
Ticketmaster is the primary source for event data in the ingestion pipeline. The TicketmasterAdapter uses this key for all API requests (event search by location, single event lookup, pagination).

### How to Get a Key

1. Go to https://developer.ticketmaster.com/
2. Click "Get API Key" (or sign up for a developer account)
3. The free tier provides **5,000 API calls per day** -- sufficient for SoundCheck's sync pipeline
4. Copy the "Consumer Key" (this is your API key)

### Environment Variable

Add to your `.env` file in the `backend/` directory:

```
TICKETMASTER_API_KEY=your_api_key_here
```

For Railway deployment, add this as an environment variable in the Railway dashboard.

### Verification

The TicketmasterAdapter will throw a clear error on startup if the key is missing:
```
Error: TICKETMASTER_API_KEY environment variable is required.
```

The sync pipeline (02-02) will not start without this key, but the rest of the application functions normally.

### Rate Limits

- **Daily quota:** 5,000 calls (free tier)
- **Per-second:** 5 requests
- **SoundCheck usage:** ~300-1200 calls/day depending on number of sync regions
- **Headroom:** ~2000-3000 calls reserved for on-demand lookups

The adapter automatically tracks daily usage and refuses calls at 4,900 to preserve capacity for on-demand lookups.
