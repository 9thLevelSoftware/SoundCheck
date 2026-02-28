/**
 * Satori-compatible Wrapped summary card templates.
 *
 * Returns plain element objects (type/props/children) that satori renders to SVG.
 * Uses flexbox only -- no CSS grid, no position:absolute (satori limitation).
 *
 * VoltLime brand: #D2FF00 accents on #0D0D0D background.
 *
 * Two variants:
 *   - OG (1200x630) for Open Graph link previews
 *   - Stories (1080x1920) for Instagram/Snapchat Stories sharing
 */

// ============================================
// Types
// ============================================

export interface WrappedSummaryData {
  username: string;
  year: number;
  totalShows: number;
  uniqueBands: number;
  uniqueVenues: number;
  topGenre: string;
  topArtist: string;
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

export function wrappedSummaryCardOG(data: WrappedSummaryData): SatoriElement {
  const topGenre = truncate(data.topGenre, 30);
  const topArtist = truncate(data.topArtist, 30);

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
    // Top row: branding
    el('div', {
      style: {
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: '24px',
      },
    },
      el('span', {
        style: {
          color: '#D2FF00',
          fontSize: '20px',
          letterSpacing: '0.1em',
          fontWeight: 700,
        },
      }, 'SOUNDCHECK WRAPPED'),
    ),

    // Year
    el('div', {
      style: {
        color: '#D2FF00',
        fontSize: '72px',
        fontWeight: 700,
        lineHeight: '1.1',
        marginBottom: '24px',
        display: 'flex',
      },
    }, String(data.year)),

    // Stats row
    el('div', {
      style: {
        display: 'flex',
        flexDirection: 'column',
        marginBottom: '24px',
      },
    },
      el('div', {
        style: {
          color: '#FFFFFF',
          fontSize: '48px',
          fontWeight: 700,
          lineHeight: '1.2',
          marginBottom: '8px',
          display: 'flex',
        },
      }, `${data.totalShows} shows`),

      el('div', {
        style: {
          color: '#9CA3AF',
          fontSize: '24px',
          display: 'flex',
        },
      }, `${data.uniqueBands} bands \u2022 ${data.uniqueVenues} venues`),
    ),

    // Top genre and top artist
    el('div', {
      style: {
        display: 'flex',
        flexDirection: 'column',
        marginBottom: '16px',
      },
    },
      el('div', {
        style: {
          color: '#D2FF00',
          fontSize: '22px',
          marginBottom: '8px',
          display: 'flex',
        },
      }, `#1 genre: ${topGenre}`),

      el('div', {
        style: {
          color: '#FFFFFF',
          fontSize: '22px',
          display: 'flex',
        },
      }, `#1 artist: ${topArtist}`),
    ),

    // Bottom: username
    el('div', {
      style: {
        display: 'flex',
        flex: '1',
        alignItems: 'flex-end',
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

export function wrappedSummaryCardStories(data: WrappedSummaryData): SatoriElement {
  const topGenre = truncate(data.topGenre, 30);
  const topArtist = truncate(data.topArtist, 30);

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
    // Branding
    el('div', {
      style: {
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: '64px',
      },
    },
      el('span', {
        style: {
          color: '#D2FF00',
          fontSize: '24px',
          letterSpacing: '0.1em',
          fontWeight: 700,
        },
      }, 'SOUNDCHECK WRAPPED'),
    ),

    // Year
    el('div', {
      style: {
        color: '#D2FF00',
        fontSize: '96px',
        fontWeight: 700,
        lineHeight: '1.1',
        textAlign: 'center',
        marginBottom: '64px',
        display: 'flex',
      },
    }, String(data.year)),

    // Total shows
    el('div', {
      style: {
        color: '#FFFFFF',
        fontSize: '64px',
        fontWeight: 700,
        textAlign: 'center',
        lineHeight: '1.2',
        marginBottom: '16px',
        display: 'flex',
      },
    }, `${data.totalShows} shows`),

    // Bands and venues
    el('div', {
      style: {
        color: '#9CA3AF',
        fontSize: '28px',
        textAlign: 'center',
        marginBottom: '64px',
        display: 'flex',
      },
    }, `${data.uniqueBands} bands \u2022 ${data.uniqueVenues} venues`),

    // Top genre
    el('div', {
      style: {
        color: '#D2FF00',
        fontSize: '28px',
        textAlign: 'center',
        marginBottom: '16px',
        display: 'flex',
      },
    }, `#1 genre: ${topGenre}`),

    // Top artist
    el('div', {
      style: {
        color: '#FFFFFF',
        fontSize: '28px',
        textAlign: 'center',
        marginBottom: '80px',
        display: 'flex',
      },
    }, `#1 artist: ${topArtist}`),

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
