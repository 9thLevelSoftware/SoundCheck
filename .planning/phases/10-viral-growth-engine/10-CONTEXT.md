# Phase 10: Viral Growth Engine - Context

**Gathered:** 2026-02-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Convert new users through an onboarding flow with genre selection and personalized recommendations. Enable social sharing of branded check-in and badge cards to Instagram Stories, X, and TikTok. Provide a web landing page for non-users clicking shared links. Add RSVP ("I'm Going") to upcoming events with friend attendance visibility.

Onboarding content, share card design, celebration UX, and RSVP mechanics are all in scope. New social features (commenting, DMs, following enhancements) are separate phases.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion

User has granted full discretion across all implementation areas. Researcher and planner should make best-practice decisions guided by the success criteria and existing codebase patterns.

**Onboarding flow:**
- Carousel content, length, and visual style
- Genre picker interaction pattern (chips, grid, swipe, etc.)
- How personalized recommendations surface after genre selection
- Whether to include skip options or require completion

**Celebration & share UX:**
- Post-check-in celebration screen layout and animations
- Badge progress display format
- One-tap share flow mechanics
- Which social platforms to prioritize and how to handle platform-specific formats (e.g., Stories aspect ratio)

**Share card design:**
- Visual branding of check-in cards vs badge unlock cards
- Information density on cards (what metadata to show)
- Web landing page layout for non-users (card preview + app store links)
- OG/meta tag strategy for link previews

**RSVP & friend signals:**
- "I'm Going" button placement and visual treatment
- Friend avatar display (count, faces, overflow indicator)
- Whether to notify friends when someone RSVPs
- How RSVP data feeds into event discovery/recommendations

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches. Researcher should look at concert/event apps (Bandsintown, Songkick, DICE) and social sharing patterns (Spotify Wrapped cards, Strava activity shares) for inspiration.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 10-viral-growth-engine*
*Context gathered: 2026-02-27*
