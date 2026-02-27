# Phase 5: Social Feed & Real-time - Context

**Gathered:** 2026-02-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Transform the activity feed into a FOMO-driven social experience with real-time friend check-ins, "Happening Now" live indicators, shared event feeds, push notifications, and performant Redis-cached feed queries. Creating/modifying check-ins, follow/unfollow, and profile features are separate phases.

</domain>

<decisions>
## Implementation Decisions

### Feed content & layout
- Balanced card design: photo and event info share equal visual weight (Untappd-style)
- Focused metadata per card: user avatar + name, event + venue, photo (if present), timestamp
- Ratings and badges are behind a tap (detail view), not on the card surface
- Badge-earned indicator is inline on the check-in card (small icon/ribbon), not a separate feed item
- Tabbed feed structure with separate tabs: Friends feed, Event feed, Happening Now

### "Happening Now" behavior
- Lives as its own dedicated tab alongside Friends and Event feeds
- Cards grouped by event: "Alice, Bob + 1 more at [Event] @ [Venue]"
- Card shows friend avatars, names, event name, venue name, plus "and N other friends" count
- Updates in real-time with live updates while the tab is active (cards appear/disappear as friends check in or events expire)

### Notification triggers & tone
- Push notification for every friend check-in (maximum FOMO)
- Time-based batching: collect notifications over a window and send summary to reduce noise on busy nights
- Badge-earned events always trigger push notification to the earner ("You earned [Badge]!")
- FOMO/energetic tone: exclamation marks, emoji, hype ("Your friend Alex just checked in at The Fillmore!")

### Real-time update UX
- "N new check-ins" banner prompt at top of feed when new items arrive — tap to load, doesn't disrupt scroll position
- Happening Now tab updates live in real-time (no pull-to-refresh needed)
- Both bottom nav badge (red dot/count on feed icon) AND tab badges (unseen count per tab) for new items
- Special highlight when a friend checks in at the same event you're at: prominent in-app notification "Alex is here too!" with distinct visual treatment

### Claude's Discretion
- "Happening Now" expiry strategy (event end time vs fixed window — pick what works with available event data)
- Exact card component layout, spacing, typography
- Batching window duration for notifications
- Feed card tap/detail view design
- Animation and transition details for live updates
- Error and loading states

</decisions>

<specifics>
## Specific Ideas

- Feed should feel like Untappd's check-in feed — balanced photo + event info, not Instagram-style photo-dominant
- "Happening Now" grouping by event is key: "Alice, Bob + 1 more" — emphasizes shared experiences
- Same-event check-in deserves special treatment ("Alex is here too!") — this is the core FOMO moment
- Notification copy should be energetic and concert-themed, not corporate/bland

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 05-social-feed-realtime*
*Context gathered: 2026-02-03*
