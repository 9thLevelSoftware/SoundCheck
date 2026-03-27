/**
 * Satori-compatible badge unlock card templates.
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

export interface BadgeCardData {
  username: string;
  badgeName: string;
  badgeDescription: string;
  badgeCategory: string;
  unlockedAt: string;
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

/** Map badge categories to accent colors */
function categoryColor(category: string): string {
  const colors: Record<string, string> = {
    checkin_count: '#FBBF24', // amber
    genre_explorer: '#34D399', // emerald
    unique_venues: '#60A5FA', // blue
    superfan: '#F472B6', // pink
    festival_warrior: '#FB923C', // orange
    road_warrior: '#A78BFA', // violet
  };
  return colors[category] || '#A855F7';
}

/** Human-readable category label */
function categoryLabel(category: string): string {
  const labels: Record<string, string> = {
    checkin_count: 'Check-in Milestone',
    genre_explorer: 'Genre Explorer',
    unique_venues: 'Venue Explorer',
    superfan: 'Superfan',
    festival_warrior: 'Festival Warrior',
    road_warrior: 'Road Warrior',
  };
  return labels[category] || 'Achievement';
}

// ============================================
// OG Card (1200x630)
// ============================================

export function badgeCardOG(data: BadgeCardData): SatoriElement {
  const accent = categoryColor(data.badgeCategory);

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

    // Main content
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
      // Category label
      el(
        'div',
        {
          style: {
            color: accent,
            fontSize: '18px',
            letterSpacing: '0.08em',
            marginBottom: '12px',
          },
        },
        categoryLabel(data.badgeCategory).toUpperCase()
      ),

      // Badge icon placeholder (colored circle)
      el(
        'div',
        {
          style: {
            display: 'flex',
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            backgroundColor: accent,
            marginBottom: '20px',
            alignItems: 'center',
            justifyContent: 'center',
          },
        },
        el(
          'span',
          {
            style: {
              fontSize: '32px',
            },
          },
          '\uD83C\uDFC6'
        ) // trophy emoji
      ),

      // Badge name
      el(
        'div',
        {
          style: {
            color: '#FFFFFF',
            fontSize: '48px',
            fontWeight: 700,
            lineHeight: '1.1',
            marginBottom: '12px',
            overflow: 'hidden',
          },
        },
        data.badgeName
      ),

      // Description
      el(
        'div',
        {
          style: {
            color: '#9CA3AF',
            fontSize: '22px',
            lineHeight: '1.4',
            marginBottom: '8px',
            overflow: 'hidden',
          },
        },
        data.badgeDescription
      )
    ),

    // Bottom: unlocked by
    el(
      'div',
      {
        style: {
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
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
        `Unlocked by @${data.username}`
      ),
      el(
        'span',
        {
          style: {
            color: '#4B5563',
            fontSize: '16px',
          },
        },
        data.unlockedAt
      )
    )
  );
}

// ============================================
// Stories Card (1080x1920)
// ============================================

export function badgeCardStories(data: BadgeCardData): SatoriElement {
  const accent = categoryColor(data.badgeCategory);

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

    // Category label
    el(
      'div',
      {
        style: {
          color: accent,
          fontSize: '22px',
          letterSpacing: '0.08em',
          marginBottom: '32px',
          display: 'flex',
        },
      },
      categoryLabel(data.badgeCategory).toUpperCase()
    ),

    // Badge icon placeholder (larger for stories)
    el(
      'div',
      {
        style: {
          display: 'flex',
          width: '120px',
          height: '120px',
          borderRadius: '50%',
          backgroundColor: accent,
          marginBottom: '48px',
          alignItems: 'center',
          justifyContent: 'center',
        },
      },
      el(
        'span',
        {
          style: {
            fontSize: '56px',
          },
        },
        '\uD83C\uDFC6'
      ) // trophy emoji
    ),

    // Badge name
    el(
      'div',
      {
        style: {
          color: '#FFFFFF',
          fontSize: '64px',
          fontWeight: 700,
          lineHeight: '1.1',
          textAlign: 'center',
          marginBottom: '24px',
          overflow: 'hidden',
          display: 'flex',
        },
      },
      data.badgeName
    ),

    // Description
    el(
      'div',
      {
        style: {
          color: '#9CA3AF',
          fontSize: '28px',
          lineHeight: '1.4',
          textAlign: 'center',
          marginBottom: '64px',
          display: 'flex',
        },
      },
      data.badgeDescription
    ),

    // Unlocked by
    el(
      'div',
      {
        style: {
          color: '#6B7280',
          fontSize: '22px',
          marginBottom: '12px',
          display: 'flex',
        },
      },
      `Unlocked by @${data.username}`
    ),

    // Date
    el(
      'div',
      {
        style: {
          color: '#4B5563',
          fontSize: '18px',
          display: 'flex',
        },
      },
      data.unlockedAt
    )
  );
}
