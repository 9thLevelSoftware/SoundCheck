# Feature Landscape

**Domain:** Social concert check-in app ("Untappd for live music")
**Researched:** 2026-02-02
**Overall Confidence:** HIGH (multi-source competitor analysis, verified against existing codebase)

---

## Competitor Landscape Summary

Before mapping features, here is what each competitor does and does NOT do. This informs where SoundCheck's opportunity lies.

| App | Primary Function | Check-In | Ratings | Badges/Gamification | Social Feed | Discovery | Year-in-Review | Scale |
|-----|-----------------|----------|---------|---------------------|-------------|-----------|----------------|-------|
| **Untappd** (model) | Beer check-in + social | Core mechanic | 0.25-5 stars | Deep system (100+ badge types) | Real-time friend feed | Personalized recs | Recappd (annual) | 12M users |
| **Bandsintown** | Concert discovery + tickets | Post past shows (minimal) | Read-only reviews | None | Fan feed (artist updates) | AI-powered recs | None | 95M fans |
| **Songkick** | Concert alerts + tracking | RSVP/tracking | None | None | Minimal (share plans) | Artist-based alerts | None | 15M users |
| **Setlist.fm** | Setlist archive + wiki | "I Was There" button | Basic show ratings | None | Community edits | Setlist browsing | Personal stats page | 9.6M setlists |
| **Concert Archives** | Concert diary + social | Full diary logging | Favorite marking | None | Friend feed + flashbacks | Upcoming concerts | Anniversary notifications | Smaller community |
| **LiveRate** | Critic review aggregator | None | Critic-aggregated scores | "Real Live Certified" badge | None | Artist discovery | None | Niche |
| **RateGigs** | Concert/venue rating | Rate past/present shows | Multi-dimensional ratings | None | Share reviews | Concert discovery | None | Small/early stage |

**The critical gap no competitor fills:** None of these apps combine real-time check-in + gamification + dual ratings + social feed in the way Untappd does for beer. Bandsintown and Songkick are discovery/ticketing platforms, not social check-in apps. Setlist.fm and Concert Archives are retrospective logging tools, not live-moment apps. RateGigs and LiveRate focus purely on ratings without social mechanics or gamification. SoundCheck's opportunity is to be the first app that nails the Untappd formula for concerts.

---

## Untappd Mechanic Translation Map

How each core Untappd mechanic maps to the concert domain, with notes on what changes and what stays the same.

### 1. Check-In

| Untappd | SoundCheck | Translation Notes |
|---------|------------|-------------------|
| Check in a beer (scan/search/tap) | Check in at a show (find event, tap) | **Simpler trigger:** concerts are scheduled events at known venues, so check-in can auto-suggest based on location + time. No scanning needed. |
| Optional: location, photo, rating, comment | Optional: rate bands, rate venue, photo, tag friends | **Richer optional enrichment:** concerts have multiple bands, so per-set ratings add depth Untappd doesn't have. |
| Any time (no time constraint) | Live-only (must be near venue during event) | **Key design decision:** SoundCheck's PROJECT.md explicitly scopes to live check-in only. This creates urgency and authenticity. |
| One beer = one check-in | One event = one check-in (with optional per-set detail) | **Multi-entity:** An event can have 3-5 bands. The check-in is to the event, but enrichment can drill into individual performances. |

**Complexity:** MEDIUM -- The event-matching logic (suggesting the right show based on GPS + time) is the hard part. The check-in tap itself is trivial.

### 2. Ratings

| Untappd | SoundCheck | Translation Notes |
|---------|------------|-------------------|
| Single 0.25-5 star rating per beer | Dual rating: band performance + venue experience | **This is the biggest differentiator.** No competitor does dual ratings. Untappd conflates "did I like this beer" into one score. SoundCheck separates "was the band good live" from "was the venue a good experience." |
| Global aggregate per beer | Aggregate per band (live performance score) + per venue (experience score) | Creates two distinct leaderboards: best live performers and best venues. |
| Precise ratings (0.25 increments, Insiders) | Half-star increments (0.5) for simplicity | Full-star is too coarse for meaningful differentiation. Quarter-star is overkill for a quick tap. Half-star is the sweet spot. |

**Complexity:** LOW for basic implementation, MEDIUM for per-set ratings within multi-band events.

### 3. Badges / Gamification

| Untappd Badge Category | SoundCheck Equivalent | Translation Notes |
|------------------------|-----------------------|-------------------|
| Beer style badges (try N IPAs, stouts, etc.) | **Genre Explorer** (see N shows in metal, jazz, indie, etc.) | Direct translation. Genre taxonomy matters -- need a clean, finite list (not MusicBrainz's 800+ genres). |
| Venue badges (check in at N breweries) | **Venue Collector** (check in at N unique venues) | Direct translation. Could tier: 5, 10, 25, 50, 100 venues. |
| Loyalty badges (same beer N times) | **Superfan** (see the same band N times) | Direct translation but rarer -- most people don't see the same band 5+ times. Thresholds should be lower (2, 3, 5, 10). |
| Festival/event badges | **Festival Warrior** (check in to N shows in one day/weekend) | Concert-specific. Could also have festival-specific badges tied to major events. |
| Streak badges (check in N days in a row) | **Concert Streak** (attend shows N weeks/months in a row) | Must adapt cadence: nobody attends concerts daily. Weekly or monthly streaks make sense. |
| Milestone badges (100, 500, 1000 check-ins) | **Milestone badges** (10, 25, 50, 100, 250, 500 shows) | Same mechanic, adjusted thresholds for concert frequency. |
| Location badges (check in across N countries/states) | **Road Warrior** (check in across N cities/states/countries) | Direct translation. Music tourism is a real behavior. |
| Seasonal/holiday badges | **Seasonal** (summer festival season, NYE show, holiday concerts) | Concerts are seasonal (summer festival season is real). |
| Promotional/partner badges | **Venue/festival partner badges** | B2B potential: venues and festivals could sponsor badges. Defer to post-v1. |

**Complexity:** MEDIUM for the badge engine, LOW for individual badge definitions. The badge evaluation engine (check conditions after every check-in) is the architectural challenge.

### 4. Social Feed

| Untappd | SoundCheck | Translation Notes |
|---------|------------|-------------------|
| Chronological friend check-in feed | **FOMO Feed**: real-time friend check-ins at shows | Must feel live. "Your friend Alex just checked in at Radiohead @ Madison Square Garden" creates urgency. |
| Toast (like) reactions | **Toast** reactions on check-ins | Keep the metaphor -- "toast" works for concerts too (raising a toast to the experience). Or consider a concert-specific reaction (e.g., "Encore!" or keep toast for brand consistency with the Untappd model). |
| Comments on check-ins | Comments on check-ins | Direct translation. Keep lightweight. |
| "Nearby" feed (see check-ins near you) | **"Happening Now"** feed (shows with active check-ins near you) | More powerful for concerts: shows are time-bounded events, so "happening now" has built-in urgency that beer check-ins don't. |
| Activity notifications | **Friend activity alerts** ("Alex is at a show near you") | FOMO-inducing. This is the social hook. |

**Complexity:** LOW for basic feed, MEDIUM for real-time "happening now" with WebSocket push.

### 5. Discovery

| Untappd | SoundCheck | Translation Notes |
|---------|------------|-------------------|
| "Top Rated" beers near you | **Trending Shows** near you (most check-ins) | The live concert equivalent of "popular right now." |
| Personalized beer recommendations | **Personalized show recommendations** based on genre history, past check-ins | Requires enough check-in data to build a profile. Cold start problem for new users -- solve with genre preference onboarding. |
| Nearby venues with tap lists | **Upcoming shows** at venues near you | Powered by event API data (Bandsintown, Songkick, Ticketmaster). This is table stakes -- Bandsintown and Songkick already do this well. |
| Beer style exploration | **Genre exploration** (browse shows by genre) | Users should be able to say "show me jazz shows near me this week." |
| Brewery pages | **Band pages** (aggregate live rating, upcoming shows, fan count) + **Venue pages** (aggregate experience rating, upcoming events, capacity, vibe) | Two entity pages instead of one. Band pages answer "is this artist good live?" Venue pages answer "is this a good place to see a show?" |

**Complexity:** MEDIUM for recommendation engine, LOW for basic upcoming show listing.

### 6. Profiles / Stats

| Untappd | SoundCheck | Translation Notes |
|---------|------------|-------------------|
| Total unique beers | **Total shows attended** | Core stat. |
| Total check-ins | **Total check-ins** (same show can be checked into once) | Unlike beer (can check in same beer many times), concerts are unique events. Total shows = total check-ins in most cases. |
| Unique breweries | **Unique venues** | Direct. |
| Badge collection | **Badge showcase** | Direct. Display earned badges prominently. |
| Top rated beers | **Top rated shows** (personal favorites) | Shows the user rated highest. |
| Beer style breakdown | **Genre breakdown** (pie chart or bar chart of genres attended) | "You've been to 40% rock, 25% indie, 15% jazz, 10% electronic, 10% other." |
| Recent activity | **Recent check-ins** | Direct. |
| N/A | **Unique bands seen** | Concert-specific stat that doesn't have a direct Untappd equivalent. |
| N/A | **Concert cred score** (composite) | Optional: a single number that captures your overall concert-going depth. Could be controversial -- keep it fun, not competitive. |

**Complexity:** LOW for basic stats, MEDIUM for rich aggregation and visualization.

### 7. Year-in-Review

| Untappd | SoundCheck | Translation Notes |
|---------|------------|-------------------|
| "Year in Beer" / Recappd | **Year in Shows** / "SoundCheck Wrapped" | Massive engagement driver. Spotify Wrapped proved this format is extremely shareable. No concert app does this well. |
| Top rated beers of the year | Top rated shows, favorite bands, favorite venues | |
| Total unique beers | Total shows, unique bands, unique venues | |
| Style breakdown | Genre breakdown | |
| Map of check-in locations | **Concert map** (where you saw shows) | Visual map of venues visited is compelling for music tourists. |
| Shareable cards | **Shareable cards** for social media | Critical for viral growth. Must be Instagram/TikTok ready. |

**Complexity:** MEDIUM (data aggregation is straightforward; the shareable visual design is the hard part).

---

## Table Stakes

Features users expect. Missing any of these = product feels incomplete or broken.

| # | Feature | Why Expected | Complexity | Existing? | Notes |
|---|---------|--------------|------------|-----------|-------|
| T1 | **Event check-in** (find show, tap, done) | Core mechanic. Without this, there is no app. | MEDIUM | Partial (basic check-in exists, not event-centric) | Must support auto-suggest from GPS + time. Target: 10 seconds from app open to checked in. |
| T2 | **Event data from APIs** (Bandsintown, Songkick, Ticketmaster) | Users need shows to check into. Can't rely solely on user-created events. | MEDIUM | No (Foursquare venues exist, but no event pipeline) | Critical dependency for T1. Without event data, check-in requires users to manually create events. |
| T3 | **Band performance rating** (how good were they live?) | This is the Untappd rating equivalent. Core value proposition. | LOW | Partial (single-dimension rating exists) | Needs to be per-band within multi-band events. |
| T4 | **Venue experience rating** (how was the venue?) | Dual rating is the key differentiator vs competitors. | LOW | No (venue ratings exist but not as independent check-in dimension) | Sound quality, sightlines, vibe, accessibility. |
| T5 | **User profile with concert stats** | Users need a "concert resume" to show off. Identity is the hook. | MEDIUM | Partial (basic profile exists) | Total shows, unique bands, unique venues, genre breakdown. |
| T6 | **Social feed of friend check-ins** | Without social, it's a diary app (Concert Archives already exists). Social creates FOMO. | MEDIUM | Partial (activity feed exists) | Must show real-time friend check-ins with show context. |
| T7 | **Follow/unfollow users** | Social graph is prerequisite for social feed. | LOW | Yes (exists) | Already built. |
| T8 | **Toast/react to check-ins** | Lightweight social interaction. Like button equivalent. | LOW | Yes (exists) | Already built. |
| T9 | **Comments on check-ins** | Users want to discuss shows. | LOW | Yes (exists) | Already built. |
| T10 | **Band pages** (aggregate rating, upcoming shows) | Users ask "is this band good live?" Band page answers this. | MEDIUM | Partial (band discovery exists, not event-enriched) | Need aggregate live performance rating across all check-ins. |
| T11 | **Venue pages** (aggregate rating, upcoming events) | Users ask "is this venue worth going to?" Venue page answers this. | MEDIUM | Partial (venue details exist, not event-enriched) | Need aggregate venue experience rating + event calendar. |
| T12 | **Push notifications** (friend check-ins, badges earned) | Users need re-engagement triggers. | LOW | Yes (WebSocket exists) | Already built. Need to add badge-earned and friend-at-nearby-show triggers. |
| T13 | **Search** (bands, venues, events, users) | Users need to find things. | LOW | Yes (exists) | May need event search added. |
| T14 | **Location awareness** (GPS for nearby venues/events) | Check-in verification and discovery both need location. | LOW | Yes (geolocator package exists) | Already available. |

**Total table stakes count:** 14 features. 5 already fully built, 5 partially built, 4 need new work.

---

## Differentiators

Features that set SoundCheck apart from Setlist.fm, Songkick, Bandsintown, and Concert Archives. Not expected, but these are what make users choose SoundCheck over alternatives.

| # | Feature | Value Proposition | Complexity | Notes |
|---|---------|-------------------|------------|-------|
| D1 | **Badge system (genre, venue, superfan, festival, milestone, road warrior)** | Gamification is what makes Untappd addictive. No concert app has a badge system. This is the primary retention mechanic. | MEDIUM | Badge engine exists but needs concert-specific badge types. See badge translation table above. |
| D2 | **Dual independent ratings (band performance + venue experience)** | Nobody does this. RateGigs rates artists on multiple dimensions but doesn't separate band vs venue. This creates two distinct value surfaces. | LOW | This is the single most differentiated feature. |
| D3 | **Per-set ratings in multi-band events** | A show has an opener and a headliner. Users want to rate them independently. No app supports this. | MEDIUM | Depends on events-as-first-class-entities data model. |
| D4 | **FOMO feed with "Happening Now"** | Real-time awareness that friends are at shows right now. Creates urgency and social pressure. Bandsintown shows who's *planning* to go; SoundCheck shows who's *there right now*. | MEDIUM | WebSocket infrastructure exists. Need real-time check-in broadcasting. |
| D5 | **"Year in Shows" / SoundCheck Wrapped** | Shareable annual recap. Spotify Wrapped generates massive organic social sharing. No concert app offers a proper Wrapped experience. Concerts Wrapped (concertswrapped.com) exists but requires manual data entry. | MEDIUM | Must produce Instagram-ready shareable cards. Defer to post-launch of core features but plan for data collection from day one. |
| D6 | **Concert cred profile** (composite score, concert resume) | Turn concert-going into an identity. "I've seen 200 shows across 15 genres at 50 venues." This is bragging rights as a feature. | LOW | Data aggregation from check-ins. Visualize attractively. |
| D7 | **Badge rarity indicators** (% of users who earned it) | "Only 3% of users have the Jazz Explorer badge." Creates aspiration and social proof for the badge system. | LOW | Requires computing badge distribution across user base. |
| D8 | **Location verification for check-ins** | Ensures check-ins are authentic ("you were actually there"). Prevents fake check-ins. Builds trust in ratings. | LOW | GPS proximity check. Already have geolocator. |
| D9 | **User-created events** (for DIY shows, house venues, small gigs) | API data covers major shows but misses DIY/underground scene. User-created events fill this gap. Concert Archives does this well. | LOW | Important for underground/indie scene credibility. |
| D10 | **Photo attachment on check-ins** | Visual proof and memory. Makes the feed more engaging than text-only check-ins. | LOW | Multer upload infrastructure exists on backend. Need mobile camera integration. |
| D11 | **Personalized show recommendations** | "Based on your check-in history, you might like this show." Goes beyond Bandsintown's "artists you follow" to "genres and experiences you enjoy." | HIGH | Requires sufficient check-in history. Cold start problem. Solve with genre preference onboarding. |
| D12 | **Shared experience discovery** ("Who else was there?") | After a show, see other SoundCheck users who checked in at the same event. Creates community around shared experiences. | LOW | Query: all check-ins for event X. Social feature on event detail page. |
| D13 | **Friend activity alerts** ("Alex just checked in at a show near you!") | Real-time FOMO notification. Drives spontaneous attendance and re-engagement. | MEDIUM | Requires location-aware notification logic. |
| D14 | **Concert streak tracking** (weekly/monthly attendance streaks) | Streak mechanics are proven retention drivers (Duolingo, Snapchat, Untappd). Adapted for concert frequency. | LOW | Count check-ins per week/month, track consecutive periods. |

---

## Anti-Features

Things to deliberately NOT build. Common mistakes in this domain.

| # | Anti-Feature | Why Avoid | What to Do Instead |
|---|--------------|-----------|-------------------|
| A1 | **Ticket sales/purchasing** | Bandsintown (95M users) and Songkick (15M users) own this space. Adding ticketing creates massive scope creep, business complexity (seller agreements, payment processing, refunds), and distracts from the social check-in core. | Link out to ticket sellers. Deep link to Bandsintown/Songkick/Ticketmaster for ticket purchase. Stay in your lane. |
| A2 | **Setlist tracking/wiki** | Setlist.fm has 9.6M setlists with an active community of editors. Building a setlist wiki is reinventing the wheel. The crowdsourcing effort required is immense. | Integrate with Setlist.fm API (already in the codebase). Display setlist data on event pages. Let Setlist.fm do the hard work. |
| A3 | **Retroactive/backdated concert logging** | PROJECT.md explicitly excludes this. Allowing backdated check-ins dilutes the "I'm here now" social signal. Concert Archives already serves the diary use case. Live-only creates authenticity and urgency. | Stay live-only. The constraint is the feature. If a user missed checking in, that's FOMO working as intended. Consider this for premium tier only (like Untappd Insiders). |
| A4 | **Direct messaging/chat** | Chat is a product in itself (moderation, abuse, spam). The social interaction model is check-ins + toasts + comments, not conversations. GroupMe and iMessage already solve concert-friend coordination. | Keep social interaction lightweight: toasts, comments, friend activity notifications. |
| A5 | **Web frontend/profiles** | Mobile is the platform. Concerts happen IRL, and the check-in moment is mobile. Web adds maintenance burden and splits focus. | Mobile only for v1. Consider web profiles (read-only) later if profile sharing demands it. |
| A6 | **Artist/venue management dashboard (B2B)** | B2B is a completely different product with different users, different sales cycles, and different success metrics. Building it alongside the consumer app fragments focus. | Consumer app only for v1. B2B venue/promoter tools are a separate future product (like Untappd for Business was separate from Untappd). |
| A7 | **Live streaming or audio features** | "Being there" is the core value. Streaming removes the need to be there. Also: licensing, bandwidth, CDN costs, rights management. | SoundCheck is about presence, not broadcast. The check-in proves you were there. |
| A8 | **Complex social graphs (groups, circles, teams)** | Follow/unfollow is sufficient. Groups add complexity (permissions, administration, discovery) without proportional value for a check-in app. | Simple follow/unfollow social graph. Friends = people you follow who follow you back. |
| A9 | **Critic/professional reviews** | LiveRate already aggregates critic reviews. SoundCheck's value is crowd-sourced peer ratings, not professional criticism. Mixing them creates confusion about whose opinion you're reading. | All ratings are from users who checked in. This makes every rating verified (you were actually there). |
| A10 | **Concert buddy matching** | Beatmatch and Showmate do this. It's a dating-app-adjacent feature with moderation nightmares, safety concerns, and a totally different user psychology. | Show "who else was there" (shared experience), not "who should you meet." Community, not matchmaking. |
| A11 | **Overly granular rating dimensions** | RateGigs asks users to rate Talent, Set List, Crowd Engagement, Production, and Overall. That's 5 ratings per artist. At a 3-band show, that's 15 ratings + venue. Nobody will do this at a show. | Two ratings total: band performance (one star rating) + venue experience (one star rating). Optional per-set breakdown for multi-band shows. Simplicity wins at the check-in moment. |
| A12 | **Leaderboards / competitive rankings** | Competitive mechanics ("top rater in your city") attract power users who game the system and alienate casual users. Creates incentive for fake check-ins. | Badges reward personal milestones, not competitive ranking. "You've been to 50 shows" not "You're ranked #12 in Chicago." |

---

## Feature Dependencies

Features that must be built before others can function.

```
EVENT DATA PIPELINE (T2)
  |
  +---> Event Check-In (T1) --- depends on having events to check into
  |       |
  |       +---> Band Performance Rating (T3)
  |       +---> Venue Experience Rating (T4)
  |       +---> Per-Set Ratings (D3)
  |       +---> Photo Attachment (D10)
  |       +---> Location Verification (D8)
  |       |
  |       +---> Social Feed (T6) --- needs check-ins to display
  |       |       |
  |       |       +---> FOMO Feed / Happening Now (D4)
  |       |       +---> Friend Activity Alerts (D13)
  |       |
  |       +---> Badge Engine (D1) --- evaluates after each check-in
  |       |       |
  |       |       +---> Badge Rarity (D7) --- needs badge distribution data
  |       |       +---> Concert Streak (D14) --- needs check-in history
  |       |
  |       +---> Profile Stats (T5) --- aggregates check-in data
  |       |       |
  |       |       +---> Concert Cred (D6) --- needs aggregated stats
  |       |       +---> Year in Shows (D5) --- needs a year of data
  |       |
  |       +---> Shared Experience (D12) --- needs check-ins at same event
  |
  +---> Band Pages (T10) --- needs events linked to bands
  +---> Venue Pages (T11) --- needs events linked to venues
  +---> Recommendations (D11) --- needs check-in history + event data
  +---> User-Created Events (D9) --- supplements API data

SOCIAL GRAPH (T7 - exists)
  |
  +---> Social Feed (T6)
  +---> Friend Activity Alerts (D13)
  +---> FOMO Feed (D4)
```

**Critical path:** Event Data Pipeline (T2) --> Event Check-In (T1) --> Everything else.

The event data pipeline is the single biggest unlock. Without events in the database, check-in cannot work, ratings have no targets, badges cannot trigger, profiles have no data, and the feed is empty.

---

## MVP Recommendation

For MVP, prioritize table stakes plus the highest-impact differentiators:

### Must Ship (MVP)

1. **Event data pipeline** (T2) -- The foundation. Seed from Bandsintown/Songkick/Ticketmaster APIs.
2. **Event check-in flow** (T1) -- The core action. Quick tap, auto-suggest from GPS + time.
3. **Dual ratings** (T3, T4) -- Band performance + venue experience. The unique value proposition.
4. **Per-set ratings** (D3) -- Multi-band lineup support. What makes SoundCheck concert-native.
5. **Profile stats** (T5) -- Total shows, unique bands, unique venues, genre breakdown. Identity hook.
6. **Social feed** (T6) -- Friend check-ins. Without this, it's a diary app.
7. **Badge system** (D1) -- Genre explorer, venue collector, superfan, festival warrior, milestones. Retention mechanic.
8. **Band and venue pages** (T10, T11) -- Aggregate ratings, upcoming shows. Answer "is X worth seeing/going to?"
9. **Location verification** (D8) -- Authenticity signal. "You were actually there."
10. **Photo attachment** (D10) -- Visual feed. Makes check-ins compelling.

### Defer to Post-MVP

- **Year in Shows / SoundCheck Wrapped** (D5): Needs a full year of data. But design the data model to support it from day one.
- **Personalized recommendations** (D11): Needs sufficient check-in history. Cold start problem. Start with genre-based onboarding, implement ML recommendations after accumulating data.
- **FOMO feed / "Happening Now"** (D4): Important but requires a critical mass of users checking in simultaneously. Ship basic friend feed first, add real-time layer when user density supports it.
- **Friend activity alerts** (D13): Same critical mass requirement as D4.
- **Concert cred composite score** (D6): Fun but not essential. Ship raw stats first, add composite scoring later.
- **Badge rarity indicators** (D7): Needs scale to be meaningful. Add once badge distribution data is statistically interesting.
- **User-created events** (D9): Important for underground scene but adds moderation burden. Start with API-seeded events only, add user creation after moderation tools exist.
- **Concert streaks** (D14): Nice retention mechanic but not differentiated enough for MVP. Add in gamification v2.
- **Shared experience discovery** (D12): Low complexity but needs concurrent users at events. Enable after user base grows.

---

## Competitor Feature Gap Analysis

What each competitor does well and where SoundCheck wins.

### vs. Bandsintown (95M fans -- the discovery giant)
- **Bandsintown wins on:** Discovery engine, artist following, ticket links, YouTube/Spotify integration, massive event database, artist-to-fan messaging.
- **SoundCheck wins on:** Check-in mechanic (Bandsintown has no real-time check-in), gamification (Bandsintown has zero badges), dual ratings (Bandsintown has no structured rating system), social feed (Bandsintown's feed is artist updates, not friend activity).
- **Coexistence strategy:** SoundCheck and Bandsintown are complementary. Bandsintown helps you FIND shows. SoundCheck is what you use WHEN YOU'RE THERE. Deep link to Bandsintown for discovery/tickets.

### vs. Songkick (15M users -- the alert system)
- **Songkick wins on:** Artist tracking alerts, Spotify library sync, notification reliability for tour announcements.
- **SoundCheck wins on:** Everything post-discovery. Songkick has no check-in, no ratings, no badges, no social feed, no gamification. It ends when you buy the ticket. SoundCheck begins when you arrive.
- **Coexistence strategy:** Same as Bandsintown. Songkick alerts you. SoundCheck is the show companion.

### vs. Setlist.fm (9.6M setlists -- the archive)
- **Setlist.fm wins on:** Setlist data (unbeatable crowdsourced archive), song statistics, comprehensive coverage of historical shows.
- **SoundCheck wins on:** Live experience (Setlist.fm is retrospective), gamification (none), social mechanics (minimal), ratings (basic), identity/profile (weak).
- **Coexistence strategy:** Integrate Setlist.fm API for setlist display (already done). Don't try to be a setlist wiki.

### vs. Concert Archives (the diary app)
- **Concert Archives wins on:** Retrospective logging (50-year concert histories), photo/video upload to past shows, flashback notifications, import from Setlist.fm.
- **SoundCheck wins on:** Live check-in (Concert Archives is retrospective), gamification (none), dual ratings (none), badge system (none), polished UX (Concert Archives is functional but not slick).
- **Differentiation:** SoundCheck is "I'm here now." Concert Archives is "I was there then." Different use cases, minimal overlap.

### vs. RateGigs/LiveRate/Rate My Set (the rating apps)
- **Rating apps win on:** Nothing significant. These are small, niche apps with limited traction.
- **SoundCheck wins on:** Everything. Full social platform vs. single-purpose rating tool.
- **Strategy:** Subsume their value (concert ratings) into a richer experience.

---

## Feature Prioritization Matrix

| Feature | Impact | Complexity | Priority | Phase |
|---------|--------|------------|----------|-------|
| Event data pipeline (T2) | CRITICAL | MEDIUM | P0 | Phase 1 |
| Event check-in (T1) | CRITICAL | MEDIUM | P0 | Phase 1 |
| Dual ratings (T3, T4) | HIGH | LOW | P0 | Phase 1 |
| Events as first-class entities (data model) | CRITICAL | HIGH | P0 | Phase 1 |
| Profile stats (T5) | HIGH | MEDIUM | P1 | Phase 2 |
| Badge system (D1) | HIGH | MEDIUM | P1 | Phase 2 |
| Per-set ratings (D3) | MEDIUM | MEDIUM | P1 | Phase 2 |
| Social feed update (T6) | HIGH | MEDIUM | P1 | Phase 2 |
| Band pages enriched (T10) | MEDIUM | MEDIUM | P2 | Phase 2 |
| Venue pages enriched (T11) | MEDIUM | MEDIUM | P2 | Phase 2 |
| Location verification (D8) | MEDIUM | LOW | P1 | Phase 1 |
| Photo attachment (D10) | MEDIUM | LOW | P2 | Phase 2 |
| User-created events (D9) | MEDIUM | LOW | P2 | Phase 3 |
| FOMO feed / Happening Now (D4) | HIGH | MEDIUM | P2 | Phase 3 |
| Friend activity alerts (D13) | MEDIUM | MEDIUM | P2 | Phase 3 |
| Badge rarity (D7) | LOW | LOW | P3 | Phase 3 |
| Concert streaks (D14) | LOW | LOW | P3 | Phase 3 |
| Shared experience (D12) | MEDIUM | LOW | P2 | Phase 3 |
| Concert cred score (D6) | LOW | LOW | P3 | Phase 3 |
| Year in Shows (D5) | HIGH | MEDIUM | P3 | Phase 4 |
| Recommendations (D11) | MEDIUM | HIGH | P3 | Phase 4 |

---

## Sources

### Competitor Apps (Primary Research)
- [Untappd - Wikipedia](https://en.wikipedia.org/wiki/Untappd)
- [Untappd on Google Play](https://play.google.com/store/apps/details?id=com.untappdllc.app&hl=en_US)
- [Untappd Recappd 2025](https://untappd.com/blog/untappd-recappd-2025-is-here/1868)
- [Untappd Insiders](https://insiders.untappd.com/)
- [Bandsintown](https://www.bandsintown.com/)
- [Bandsintown 2025 Trends - Music Ally](https://musically.com/2025/12/17/bandsintown-reveals-its-2025-trends-for-music-concerts/)
- [Bandsintown as Social Network 2026 - Hypebot](https://www.hypebot.com/hypebot/2026/02/music-marketingin-2026-using-bandsintown-as-a-social-network.html)
- [Songkick](https://www.songkick.com/)
- [Songkick Review - AppPicker](https://www.apppicker.com/music/songkick-concerts)
- [Setlist.fm](https://www.setlist.fm/)
- [Setlist Concert App - App Store](https://apps.apple.com/us/app/setlist-concert-for-setlist-fm/id1164020210)
- [Concert Archives](https://www.concertarchives.org/)
- [Concert Archives - App Store](https://apps.apple.com/us/app/concert-archives/id1531993239)

### Rating Apps
- [LiveRate](https://www.liverate.com/)
- [LiveRate FAQ](https://www.liverate.com/faq)
- [RateGigs - EDM.com](https://edm.com/news/new-app-aims-to-improve-live-music-for-concert-goers-everywhere)
- [Rate My Set - Google Play](https://play.google.com/store/apps/details?id=com.ratemyset.rate_my_set&hl=en)

### Gamification Research
- [Longitudinal Analysis of Gamification in Untappd - arXiv](https://arxiv.org/html/2601.04841v1)
- [Untappd Gamification in Customer Engagement - SlideShare](https://www.slideshare.net/manumelwin/untappd-gamification-in-customer-engagement-manu-melwin-joy)
- [Badges in Gamification Examples - Trophy](https://trophy.so/blog/badges-feature-gamification-examples)

### Social Music / Wrapped
- [Concerts Wrapped](https://www.concertswrapped.com/)
- [Best Live Music Discovery Platforms 2026](https://resources.onestowatch.com/best-live-music-discovery-platforms/)
- [Beatmatch](https://www.beatmatch.app/)

---

*Feature landscape research: 2026-02-02*
