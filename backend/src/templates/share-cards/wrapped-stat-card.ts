/**
 * Satori-compatible per-stat Wrapped card templates.
 *
 * Returns plain element objects (type/props/children) that satori renders to SVG.
 * Uses flexbox only -- no CSS grid, no position:absolute (satori limitation).
 *
 * VoltLime brand: #D2FF00 accents on #0D0D0D background.
 * Visually distinct from summary card — focuses on a single stat highlight.
 *
 * Two variants:
 *   - OG (1200x630) for Open Graph link previews
 *   - Stories (1080x1920) for Instagram/Snapchat Stories sharing
 */

// ============================================
// Types
// ============================================

export interface WrappedStatData {
  username: string;
  year: number;
  statType: 'top-artist' | 'top-venue' | 'top-genre';
  statLabel: string;   // e.g., "#1 Artist", "#1 Venue", "#1 Genre"
  statValue: string;   // e.g., band name, venue name, genre name
  statDetail: string;  // e.g., "Seen 8 times", "Visited 5 times", "68% of your shows"
}

// Satori element type (React.createElement output format)
interface SatoriElement {
  type: string;
  props: Record<string, any>;
}

// ============================================
// Helpers
// ============================================

function el(type: string, props: Record<string, any>, ...children: (string | SatoriElement)[]): SatoriElement {
  return {
    type,
    props: {
      ...props,
      children: children.length === 1 ? children[0] : children.length > 0 ? children : undefined,
    },
  };
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 1) + '\u2026';
}

// ============================================
// OG Card (1200x630)
// ============================================

export function wrappedStatCardOG(data: WrappedStatData): SatoriElement {
  const statValue = truncate(data.statValue, 25);

  return el('div', {
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
    // Top row: branding with year
    el('div', {
      style: {
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: '48px',
      },
    },
      el('span', {
        style: {
          color: '#D2FF00',
          fontSize: '20px',
          letterSpacing: '0.1em',
          fontWeight: 700,
        },
      }, `SOUNDCHECK WRAPPED ${data.year}`),
    ),

    // Main content area
    el('div', {
      style: {
        display: 'flex',
        flexDirection: 'column',
        flex: '1',
        justifyContent: 'center',
      },
    },
      // Stat label
      el('div', {
        style: {
          color: '#9CA3AF',
          fontSize: '24px',
          marginBottom: '16px',
          display: 'flex',
        },
      }, data.statLabel),

      // Stat value (large)
      el('div', {
        style: {
          color: '#FFFFFF',
          fontSize: '64px',
          fontWeight: 700,
          lineHeight: '1.1',
          marginBottom: '16px',
          overflow: 'hidden',
          display: 'flex',
        },
      }, statValue),

      // Stat detail
      el('div', {
        style: {
          color: '#D2FF00',
          fontSize: '28px',
          display: 'flex',
        },
      }, data.statDetail),
    ),

    // Bottom: username
    el('div', {
      style: {
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
      },
    },
      el('span', {
        style: {
          color: '#6B7280',
          fontSize: '18px',
        },
      }, `@${data.username}`),
    ),
  );
}

// ============================================
// Stories Card (1080x1920)
// ============================================

export function wrappedStatCardStories(data: WrappedStatData): SatoriElement {
  const statValue = truncate(data.statValue, 25);

  return el('div', {
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
    // Branding with year
    el('div', {
      style: {
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: '120px',
      },
    },
      el('span', {
        style: {
          color: '#D2FF00',
          fontSize: '24px',
          letterSpacing: '0.1em',
          fontWeight: 700,
        },
      }, `SOUNDCHECK WRAPPED ${data.year}`),
    ),

    // Stat label
    el('div', {
      style: {
        color: '#9CA3AF',
        fontSize: '28px',
        textAlign: 'center',
        marginBottom: '24px',
        display: 'flex',
      },
    }, data.statLabel),

    // Stat value (huge)
    el('div', {
      style: {
        color: '#FFFFFF',
        fontSize: '80px',
        fontWeight: 700,
        lineHeight: '1.1',
        textAlign: 'center',
        marginBottom: '24px',
        overflow: 'hidden',
        display: 'flex',
      },
    }, statValue),

    // Stat detail
    el('div', {
      style: {
        color: '#D2FF00',
        fontSize: '36px',
        textAlign: 'center',
        marginBottom: '120px',
        display: 'flex',
      },
    }, data.statDetail),

    // Username
    el('div', {
      style: {
        color: '#6B7280',
        fontSize: '22px',
        display: 'flex',
      },
    }, `@${data.username}`),
  );
}
