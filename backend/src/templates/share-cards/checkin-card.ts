/**
 * Satori-compatible check-in card templates.
 *
 * Returns plain element objects (type/props/children) that satori renders to SVG.
 * Uses flexbox only -- no CSS grid, no position:absolute (satori limitation).
 *
 * Two variants:
 *   - OG (1200x630) for Open Graph link previews
 *   - Stories (1080x1920) for Instagram/Snapchat Stories sharing
 */

// ============================================
// Types
// ============================================

export interface CheckinCardData {
  username: string;
  bandName: string;
  venueName: string;
  venueCity: string;
  eventDate: string;
  rating: number;
  bandImageUrl?: string;
}

// Satori element type (React.createElement output format)
interface SatoriElement {
  type: string;
  props: Record<string, any>;
}

// ============================================
// Helpers
// ============================================

function el(
  type: string,
  props: Record<string, any>,
  ...children: (string | SatoriElement)[]
): SatoriElement {
  return {
    type,
    props: {
      ...props,
      children: children.length === 1 ? children[0] : children.length > 0 ? children : undefined,
    },
  };
}

function renderStars(rating: number): string {
  const full = Math.floor(rating);
  const half = rating - full >= 0.5 ? 1 : 0;
  const empty = 5 - full - half;
  return '\u2605'.repeat(full) + (half ? '\u00BD' : '') + '\u2606'.repeat(empty);
}

// ============================================
// OG Card (1200x630)
// ============================================

export function checkinCardOG(data: CheckinCardData): SatoriElement {
  return el(
    'div',
    {
      style: {
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        backgroundColor: '#0D0D0D',
        padding: '48px 56px',
        fontFamily: 'Inter',
      },
    },
    // Top row: branding
    el(
      'div',
      {
        style: {
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          marginBottom: '24px',
        },
      },
      el('div', {
        style: {
          display: 'flex',
          width: '12px',
          height: '12px',
          borderRadius: '50%',
          backgroundColor: '#A855F7',
          marginRight: '10px',
        },
      }),
      el(
        'span',
        {
          style: {
            color: '#A855F7',
            fontSize: '20px',
            letterSpacing: '0.1em',
          },
        },
        'SOUNDCHECK'
      )
    ),

    // Main content area
    el(
      'div',
      {
        style: {
          display: 'flex',
          flexDirection: 'column',
          flex: '1',
          justifyContent: 'center',
        },
      },
      // Band name
      el(
        'div',
        {
          style: {
            color: '#FFFFFF',
            fontSize: '56px',
            fontWeight: 700,
            lineHeight: '1.1',
            marginBottom: '16px',
            overflow: 'hidden',
          },
        },
        data.bandName
      ),

      // Venue + City
      el(
        'div',
        {
          style: {
            color: '#9CA3AF',
            fontSize: '24px',
            marginBottom: '8px',
          },
        },
        `${data.venueName} \u2022 ${data.venueCity}`
      ),

      // Date
      el(
        'div',
        {
          style: {
            color: '#6B7280',
            fontSize: '20px',
            marginBottom: '16px',
          },
        },
        data.eventDate
      ),

      // Rating
      el(
        'div',
        {
          style: {
            color: '#FBBF24',
            fontSize: '28px',
            marginBottom: '8px',
          },
        },
        renderStars(data.rating)
      )
    ),

    // Bottom: checked in by
    el(
      'div',
      {
        style: {
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
        },
      },
      el(
        'span',
        {
          style: {
            color: '#6B7280',
            fontSize: '18px',
          },
        },
        `Checked in by @${data.username}`
      )
    )
  );
}

// ============================================
// Stories Card (1080x1920)
// ============================================

export function checkinCardStories(data: CheckinCardData): SatoriElement {
  return el(
    'div',
    {
      style: {
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        backgroundColor: '#0D0D0D',
        padding: '120px 64px',
        fontFamily: 'Inter',
        justifyContent: 'center',
        alignItems: 'center',
      },
    },
    // Branding
    el(
      'div',
      {
        style: {
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          marginBottom: '80px',
        },
      },
      el('div', {
        style: {
          display: 'flex',
          width: '16px',
          height: '16px',
          borderRadius: '50%',
          backgroundColor: '#A855F7',
          marginRight: '12px',
        },
      }),
      el(
        'span',
        {
          style: {
            color: '#A855F7',
            fontSize: '24px',
            letterSpacing: '0.1em',
          },
        },
        'SOUNDCHECK'
      )
    ),

    // Band name
    el(
      'div',
      {
        style: {
          color: '#FFFFFF',
          fontSize: '72px',
          fontWeight: 700,
          lineHeight: '1.1',
          textAlign: 'center',
          marginBottom: '32px',
          overflow: 'hidden',
          display: 'flex',
        },
      },
      data.bandName
    ),

    // Rating
    el(
      'div',
      {
        style: {
          color: '#FBBF24',
          fontSize: '40px',
          marginBottom: '48px',
          display: 'flex',
        },
      },
      renderStars(data.rating)
    ),

    // Venue + City
    el(
      'div',
      {
        style: {
          color: '#9CA3AF',
          fontSize: '28px',
          textAlign: 'center',
          marginBottom: '16px',
          display: 'flex',
        },
      },
      `${data.venueName}`
    ),

    el(
      'div',
      {
        style: {
          color: '#6B7280',
          fontSize: '24px',
          textAlign: 'center',
          marginBottom: '16px',
          display: 'flex',
        },
      },
      data.venueCity
    ),

    // Date
    el(
      'div',
      {
        style: {
          color: '#6B7280',
          fontSize: '22px',
          marginBottom: '80px',
          display: 'flex',
        },
      },
      data.eventDate
    ),

    // Checked in by
    el(
      'div',
      {
        style: {
          color: '#6B7280',
          fontSize: '22px',
          display: 'flex',
        },
      },
      `Checked in by @${data.username}`
    )
  );
}
