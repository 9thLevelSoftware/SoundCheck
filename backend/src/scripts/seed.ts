import Database from '../config/database';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const db = Database.getInstance();

// Seed data
const venues = [
  {
    name: 'The Fillmore',
    description:
      'Historic music venue with incredible acoustics and an intimate atmosphere. Known for hosting legendary performances since 1965.',
    address: '1805 Geary Boulevard',
    city: 'San Francisco',
    state: 'California',
    country: 'USA',
    postal_code: '94115',
    latitude: 37.7841,
    longitude: -122.433,
    website_url: 'https://www.thefillmore.com',
    phone: '+1-415-346-3000',
    capacity: 1315,
    venue_type: 'concert_hall',
    image_url: 'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=800',
  },
  {
    name: 'Red Rocks Amphitheatre',
    description:
      'World-famous outdoor amphitheatre carved into stunning red rock formations. Perfect natural acoustics and breathtaking views.',
    address: '18300 W Alameda Parkway',
    city: 'Morrison',
    state: 'Colorado',
    country: 'USA',
    postal_code: '80465',
    latitude: 39.6654,
    longitude: -105.2057,
    website_url: 'https://www.redrocksonline.com',
    phone: '+1-720-865-2494',
    capacity: 9525,
    venue_type: 'outdoor',
    image_url: 'https://images.unsplash.com/photo-1501281668745-f7f57925c3b4?w=800',
  },
  {
    name: 'Brooklyn Steel',
    description:
      'Industrial-chic concert venue with a massive dance floor, state-of-the-art sound system, and rooftop bar.',
    address: '319 Frost Street',
    city: 'Brooklyn',
    state: 'New York',
    country: 'USA',
    postal_code: '11211',
    latitude: 40.7198,
    longitude: -73.9384,
    website_url: 'https://www.brooklynsteel.com',
    phone: '+1-718-389-3300',
    capacity: 1800,
    venue_type: 'club',
    image_url: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=800',
  },
  {
    name: 'The Troubadour',
    description:
      'Legendary West Hollywood nightclub that launched the careers of countless artists. Intimate setting with incredible history.',
    address: '9081 Santa Monica Boulevard',
    city: 'West Hollywood',
    state: 'California',
    country: 'USA',
    postal_code: '90069',
    latitude: 34.09,
    longitude: -118.3877,
    website_url: 'https://www.troubadour.com',
    phone: '+1-310-276-1158',
    capacity: 500,
    venue_type: 'club',
    image_url: 'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=800',
  },
  {
    name: 'House of Blues Chicago',
    description:
      'Multi-level concert venue with Southern-inspired decor, great sightlines, and an energetic atmosphere.',
    address: '329 N Dearborn Street',
    city: 'Chicago',
    state: 'Illinois',
    country: 'USA',
    postal_code: '60654',
    latitude: 41.8882,
    longitude: -87.6298,
    website_url: 'https://www.houseofblues.com/chicago',
    phone: '+1-312-923-2000',
    capacity: 1500,
    venue_type: 'concert_hall',
    image_url: 'https://images.unsplash.com/photo-1540039155733-5bb30b53aa14?w=800',
  },
  {
    name: 'The Roxy Theatre',
    description:
      'Iconic Sunset Strip venue known for its intimate vibe and stellar sound. A must-visit for rock music fans.',
    address: '9009 Sunset Boulevard',
    city: 'West Hollywood',
    state: 'California',
    country: 'USA',
    postal_code: '90069',
    latitude: 34.0907,
    longitude: -118.3884,
    website_url: 'https://www.theroxy.com',
    phone: '+1-310-278-9457',
    capacity: 500,
    venue_type: 'club',
    image_url: 'https://images.unsplash.com/photo-1598387993441-a364f854c3e1?w=800',
  },
  {
    name: 'Terminal 5',
    description:
      "Three-level concert venue in Hell's Kitchen with excellent sightlines from every floor and top-notch sound.",
    address: '610 W 56th Street',
    city: 'New York',
    state: 'New York',
    country: 'USA',
    postal_code: '10019',
    latitude: 40.7708,
    longitude: -73.9915,
    website_url: 'https://www.terminal5nyc.com',
    phone: '+1-212-582-6600',
    capacity: 3000,
    venue_type: 'concert_hall',
    image_url: 'https://images.unsplash.com/photo-1470229538611-16ba8c7ffbd7?w=800',
  },
  {
    name: 'First Avenue',
    description:
      "Minneapolis institution immortalized in Prince's Purple Rain. Iconic venue with incredible local music history.",
    address: '701 N 1st Avenue',
    city: 'Minneapolis',
    state: 'Minnesota',
    country: 'USA',
    postal_code: '55403',
    latitude: 44.9817,
    longitude: -93.2749,
    website_url: 'https://www.first-avenue.com',
    phone: '+1-612-332-1775',
    capacity: 1550,
    venue_type: 'club',
    image_url: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=800',
  },
  {
    name: 'The Gorge Amphitheatre',
    description:
      'Stunning outdoor venue overlooking the Columbia River Gorge. One of the most beautiful concert settings in the world.',
    address: '754 Silica Road NW',
    city: 'Quincy',
    state: 'Washington',
    country: 'USA',
    postal_code: '98848',
    latitude: 46.9856,
    longitude: -119.2994,
    website_url: 'https://www.gorgeamphitheatre.com',
    phone: '+1-509-785-6262',
    capacity: 27500,
    venue_type: 'outdoor',
    image_url: 'https://images.unsplash.com/photo-1506157786151-b8491531f063?w=800',
  },
  {
    name: "Emo's Austin",
    description:
      "Austin's premier rock club with indoor and outdoor stages. Great sound, awesome vibes, and Texas hospitality.",
    address: '2015 E Riverside Drive',
    city: 'Austin',
    state: 'Texas',
    country: 'USA',
    postal_code: '78741',
    latitude: 30.2441,
    longitude: -97.7263,
    website_url: 'https://www.emosaustin.com',
    phone: '+1-512-505-8541',
    capacity: 2000,
    venue_type: 'club',
    image_url: 'https://images.unsplash.com/photo-1501612780327-45045538702b?w=800',
  },
  {
    name: 'The Wiltern',
    description:
      'Art Deco masterpiece in Los Angeles with stunning architecture and excellent acoustics. A truly special venue.',
    address: '3790 Wilshire Boulevard',
    city: 'Los Angeles',
    state: 'California',
    country: 'USA',
    postal_code: '90010',
    latitude: 34.062,
    longitude: -118.3091,
    website_url: 'https://www.wiltern.com',
    phone: '+1-213-388-1400',
    capacity: 1850,
    venue_type: 'concert_hall',
    image_url: 'https://images.unsplash.com/photo-1429962714451-bb934ecdc4ec?w=800',
  },
  {
    name: 'Exit/In',
    description:
      "Nashville's legendary rock club since 1971. Intimate setting where you can get up close with amazing artists.",
    address: '2208 Elliston Place',
    city: 'Nashville',
    state: 'Tennessee',
    country: 'USA',
    postal_code: '37203',
    latitude: 36.1515,
    longitude: -86.7989,
    website_url: 'https://www.exitin.com',
    phone: '+1-615-321-3340',
    capacity: 500,
    venue_type: 'club',
    image_url: 'https://images.unsplash.com/photo-1520483601267-c96ac5dcb632?w=800',
  },
  {
    name: 'The Bowery Ballroom',
    description:
      'Perfect-sized venue in Manhattan with ornate balcony, excellent sightlines, and pristine sound quality.',
    address: '6 Delancey Street',
    city: 'New York',
    state: 'New York',
    country: 'USA',
    postal_code: '10002',
    latitude: 40.7186,
    longitude: -73.9935,
    website_url: 'https://www.boweryballroom.com',
    phone: '+1-212-533-2111',
    capacity: 575,
    venue_type: 'concert_hall',
    image_url: 'https://images.unsplash.com/photo-1516873240891-4bf014598ab4?w=800',
  },
  {
    name: 'The Observatory',
    description:
      'Santa Ana venue in a renovated 1930s building. Great sound system and an eclectic mix of shows.',
    address: '3503 S Harbor Boulevard',
    city: 'Santa Ana',
    state: 'California',
    country: 'USA',
    postal_code: '92704',
    latitude: 33.7135,
    longitude: -117.9177,
    website_url: 'https://www.observatoryoc.com',
    phone: '+1-714-957-0600',
    capacity: 1100,
    venue_type: 'club',
    image_url: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=800',
  },
  {
    name: 'Sloss Furnaces',
    description:
      'Historic industrial site turned concert venue in Birmingham. Unique atmosphere with incredible acoustics.',
    address: '20 32nd Street N',
    city: 'Birmingham',
    state: 'Alabama',
    country: 'USA',
    postal_code: '35222',
    latitude: 33.5251,
    longitude: -86.7879,
    website_url: 'https://www.slossfurnaces.com',
    phone: '+1-205-324-1911',
    capacity: 5000,
    venue_type: 'outdoor',
    image_url: 'https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=800',
  },
];

const bands = [
  {
    name: 'The Midnight Riders',
    description:
      'High-energy rock band blending classic rock influences with modern sensibilities. Known for electrifying live performances.',
    genre: 'Rock',
    formed_year: 2018,
    hometown: 'Austin, TX',
    image_url: 'https://images.unsplash.com/photo-1511735111819-9a3f7709049c?w=800',
  },
  {
    name: 'Neon Pulse',
    description:
      'Synthwave duo creating nostalgic 80s-inspired electronic music with a modern twist. Dance floor essentials.',
    genre: 'Electronic',
    formed_year: 2020,
    hometown: 'Los Angeles, CA',
    image_url: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=800',
  },
  {
    name: 'Velvet Underground Revival',
    description:
      'Indie rock collective with dreamy vocals and atmospheric guitar work. Perfect for late-night contemplation.',
    genre: 'Indie Rock',
    formed_year: 2017,
    hometown: 'Brooklyn, NY',
    image_url: 'https://images.unsplash.com/photo-1498038432885-c6f3f1b912ee?w=800',
  },
  {
    name: 'Bass Drop Collective',
    description:
      'Hard-hitting dubstep crew pushing the boundaries of electronic bass music. Bring ear protection!',
    genre: 'Dubstep',
    formed_year: 2019,
    hometown: 'Denver, CO',
    image_url: 'https://images.unsplash.com/photo-1571330735066-03aaa9429d89?w=800',
  },
  {
    name: 'The Wildflowers',
    description:
      'Folk-rock quartet with beautiful harmonies and heartfelt storytelling. Music that touches the soul.',
    genre: 'Folk Rock',
    formed_year: 2016,
    hometown: 'Nashville, TN',
    image_url: 'https://images.unsplash.com/photo-1516280440614-37939bbacd81?w=800',
  },
  {
    name: 'Crimson Tide',
    description:
      'Progressive metal band with technical prowess and crushing breakdowns. Not for the faint of heart.',
    genre: 'Metal',
    formed_year: 2015,
    hometown: 'Birmingham, AL',
    image_url: 'https://images.unsplash.com/photo-1524650359799-842906ca1c06?w=800',
  },
  {
    name: 'Smooth Operators',
    description:
      'Contemporary jazz ensemble bringing fresh energy to classic jazz standards and original compositions.',
    genre: 'Jazz',
    formed_year: 2019,
    hometown: 'Chicago, IL',
    image_url: 'https://images.unsplash.com/photo-1415201364774-f6f0bb35f28f?w=800',
  },
  {
    name: 'Electric Avenue',
    description:
      'Funk and soul powerhouse guaranteed to get you dancing. Tight grooves and infectious energy.',
    genre: 'Funk',
    formed_year: 2018,
    hometown: 'Minneapolis, MN',
    image_url: 'https://images.unsplash.com/photo-1510915361894-db8b60106cb1?w=800',
  },
  {
    name: 'Desert Storm',
    description:
      'Psychedelic rock band with hypnotic rhythms and cosmic soundscapes. A journey for your mind.',
    genre: 'Psychedelic Rock',
    formed_year: 2017,
    hometown: 'Phoenix, AZ',
    image_url: 'https://images.unsplash.com/photo-1506157786151-b8491531f063?w=800',
  },
  {
    name: 'The Crooners',
    description:
      'Classic vocal group reviving the golden age of doo-wop and early rock and roll. Timeless entertainment.',
    genre: 'Doo-Wop',
    formed_year: 2020,
    hometown: 'Philadelphia, PA',
    image_url: 'https://images.unsplash.com/photo-1487180144351-b8472da7d491?w=800',
  },
  {
    name: 'Voltage',
    description:
      'High-octane punk rock trio with raw energy and anthemic choruses. Mosh pit guaranteed.',
    genre: 'Punk Rock',
    formed_year: 2019,
    hometown: 'Seattle, WA',
    image_url: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=800',
  },
  {
    name: 'Lunar Echo',
    description:
      'Ambient electronic project creating ethereal soundscapes perfect for introspection and meditation.',
    genre: 'Ambient',
    formed_year: 2021,
    hometown: 'Portland, OR',
    image_url: 'https://images.unsplash.com/photo-1514320291840-2e0a9bf2a9ae?w=800',
  },
  {
    name: 'The Revival',
    description:
      'Blues rock band keeping the tradition alive with soulful vocals and blistering guitar solos.',
    genre: 'Blues Rock',
    formed_year: 2016,
    hometown: 'Memphis, TN',
    image_url: 'https://images.unsplash.com/photo-1498038432885-c6f3f1b912ee?w=800',
  },
  {
    name: 'Urban Legends',
    description:
      'Hip-hop crew with clever wordplay and boom-bap beats. Real hip-hop for real heads.',
    genre: 'Hip Hop',
    formed_year: 2018,
    hometown: 'Atlanta, GA',
    image_url: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=800',
  },
  {
    name: 'Starlight Symphony',
    description:
      'Orchestral pop band blending classical instrumentation with contemporary songwriting. Truly unique sound.',
    genre: 'Orchestral Pop',
    formed_year: 2019,
    hometown: 'San Francisco, CA',
    image_url: 'https://images.unsplash.com/photo-1429962714451-bb934ecdc4ec?w=800',
  },
  {
    name: 'Coastal Drift',
    description:
      'Surf rock band with infectious beach vibes and reverb-drenched guitar tones. Summer all year round.',
    genre: 'Surf Rock',
    formed_year: 2020,
    hometown: 'San Diego, CA',
    image_url: 'https://images.unsplash.com/photo-1516873240891-4bf014598ab4?w=800',
  },
  {
    name: 'The Alchemists',
    description:
      'Experimental rock group fusing genres and pushing boundaries. Never the same show twice.',
    genre: 'Experimental Rock',
    formed_year: 2017,
    hometown: 'Detroit, MI',
    image_url: 'https://images.unsplash.com/photo-1524650359799-842906ca1c06?w=800',
  },
  {
    name: 'Rhythm Section',
    description:
      'Latin jazz fusion ensemble bringing Afro-Cuban rhythms and jazz improvisation together beautifully.',
    genre: 'Latin Jazz',
    formed_year: 2018,
    hometown: 'Miami, FL',
    image_url: 'https://images.unsplash.com/photo-1511735111819-9a3f7709049c?w=800',
  },
  {
    name: 'Echo Chamber',
    description:
      'Shoegaze revival band with walls of distorted guitars and ethereal vocals. Loud and beautiful.',
    genre: 'Shoegaze',
    formed_year: 2019,
    hometown: 'Boston, MA',
    image_url: 'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=800',
  },
  {
    name: 'The Remedy',
    description:
      'Reggae band spreading positive vibes with infectious grooves and conscious lyrics.',
    genre: 'Reggae',
    formed_year: 2020,
    hometown: 'Honolulu, HI',
    image_url: 'https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=800',
  },
];

async function seedDatabase() {
  console.log('🌱 Starting database seeding...\n');

  try {
    // Check database connection
    const isHealthy = await db.healthCheck();
    if (!isHealthy) {
      throw new Error('Database connection failed');
    }
    console.log('✅ Database connection successful\n');

    // Seed venues
    console.log('📍 Seeding venues...');
    const venueIds: string[] = [];
    for (const venue of venues) {
      const query = `
        INSERT INTO venues (name, description, address, city, state, country, postal_code,
                           latitude, longitude, website_url, phone, capacity, venue_type, image_url)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        ON CONFLICT DO NOTHING
        RETURNING id
      `;
      const values = [
        venue.name,
        venue.description,
        venue.address,
        venue.city,
        venue.state,
        venue.country,
        venue.postal_code,
        venue.latitude,
        venue.longitude,
        venue.website_url,
        venue.phone,
        venue.capacity,
        venue.venue_type,
        venue.image_url,
      ];
      const result = await db.query(query, values);
      if (result.rows[0]) {
        venueIds.push(result.rows[0].id);
        console.log(`  ✓ ${venue.name}`);
      }
    }
    console.log(`✅ Seeded ${venueIds.length} venues\n`);

    // Seed bands
    console.log('🎸 Seeding bands...');
    const bandIds: string[] = [];
    for (const band of bands) {
      const query = `
        INSERT INTO bands (name, description, genre, formed_year, hometown, image_url)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT DO NOTHING
        RETURNING id
      `;
      const values = [
        band.name,
        band.description,
        band.genre,
        band.formed_year,
        band.hometown,
        band.image_url,
      ];
      const result = await db.query(query, values);
      if (result.rows[0]) {
        bandIds.push(result.rows[0].id);
        console.log(`  ✓ ${band.name} (${band.genre})`);
      }
    }
    console.log(`✅ Seeded ${bandIds.length} bands\n`);

    console.log('🎉 Database seeding completed successfully!\n');
    console.log('📊 Summary:');
    console.log(`   • ${venueIds.length} venues added`);
    console.log(`   • ${bandIds.length} bands added\n`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding database:', error);
    process.exit(1);
  }
}

// Run the seed function
seedDatabase();
