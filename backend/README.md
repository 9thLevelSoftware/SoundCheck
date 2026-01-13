# SoundCheck Backend API

A comprehensive Node.js/Express/TypeScript API for the SoundCheck mobile application, allowing users to discover and review concert venues and bands.

## 🚀 Features

- **User Authentication** - JWT-based auth with registration, login, and profile management
- **Venue Discovery** - CRUD operations, search, filtering, and location-based queries
- **Band Discovery** - CRUD operations, search by genre, trending bands
- **Reviews & Ratings** - Create, read, update, delete reviews with helpfulness voting
- **Gamification** - Automatic badge earning system based on user activity
- **Rate Limiting** - Protection against abuse with configurable limits
- **PostgreSQL Database** - Robust relational database schema with indexes
- **Security** - Helmet, CORS, input validation, and authentication middleware

## 📋 Prerequisites

- Node.js 18.x or later
- PostgreSQL 12.x or later
- npm 9.x or later

## 🛠️ Installation

1. **Clone the repository and navigate to backend:**
   ```bash
   cd backend
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Set up environment variables:**
   ```bash
   cp .env.example .env
   # Edit .env with your database credentials and JWT secret
   ```

4. **Create PostgreSQL database:**
   ```bash
   createdb soundcheck
   ```

5. **Run database schema:**
   ```bash
   psql -d soundcheck -f database-schema.sql
   ```

6. **Start development server:**
   ```bash
   npm run dev
   ```

The API will be available at `http://localhost:3000`

## 🔧 Available Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build TypeScript to JavaScript
- `npm start` - Start production server
- `npm test` - Run tests (to be implemented)

## 📊 Database Schema

The application uses PostgreSQL with the following main tables:
- **users** - User accounts and profiles
- **venues** - Concert venues and their details
- **bands** - Musical artists and their information
- **reviews** - User reviews for venues and bands
- **badges** - Achievement badges
- **user_badges** - User badge earnings
- **user_followers** - User following relationships
- **review_helpfulness** - Review helpful votes

## 🌐 API Endpoints

### 🔐 Authentication
```
POST   /api/users/register           # Register new user
POST   /api/users/login              # User login
GET    /api/users/me                 # Get current user profile  
PUT    /api/users/me                 # Update current user profile
DELETE /api/users/me                 # Deactivate account
GET    /api/users/:username          # Get public user profile
GET    /api/users/check-username/:username  # Check username availability
GET    /api/users/check-email/:email # Check email availability
```

### 🏛️ Venues
```
GET    /api/venues                   # Search venues with filters
GET    /api/venues/:id               # Get venue by ID
POST   /api/venues                   # Create venue (auth required)
PUT    /api/venues/:id               # Update venue (auth required)
DELETE /api/venues/:id               # Delete venue (auth required)
GET    /api/venues/popular           # Get popular venues
GET    /api/venues/near              # Get venues near coordinates
```

### 🎵 Bands  
```
GET    /api/bands                    # Search bands with filters
GET    /api/bands/:id                # Get band by ID
POST   /api/bands                    # Create band (auth required)
PUT    /api/bands/:id                # Update band (auth required) 
DELETE /api/bands/:id                # Delete band (auth required)
GET    /api/bands/popular            # Get popular bands
GET    /api/bands/trending           # Get trending bands
GET    /api/bands/genres             # Get all genres
GET    /api/bands/genre/:genre       # Get bands by genre
```

### ⭐ Reviews
```
GET    /api/reviews                  # Search reviews with filters
GET    /api/reviews/:id              # Get review by ID
POST   /api/reviews                  # Create review (auth required)
PUT    /api/reviews/:id              # Update review (auth required)
DELETE /api/reviews/:id              # Delete review (auth required)
POST   /api/reviews/:id/helpful      # Mark review helpful (auth required)
GET    /api/reviews/my-review        # Get user's review for venue/band
GET    /api/reviews/venue/:venueId   # Get reviews for venue
GET    /api/reviews/band/:bandId     # Get reviews for band
GET    /api/reviews/user/:userId     # Get reviews by user
```

### 🏆 Badges
```
GET    /api/badges                   # Get all available badges
GET    /api/badges/:id               # Get badge by ID
GET    /api/badges/user/:userId      # Get user's earned badges
GET    /api/badges/my-badges         # Get current user's badges (auth required)
GET    /api/badges/my-progress       # Get badge progress (auth required)
POST   /api/badges/check-awards      # Check for new badge awards (auth required)
GET    /api/badges/leaderboard       # Get badge leaderboard
```

### 🔧 System
```
GET    /health                       # Health check endpoint
GET    /                             # API info
```

## 📝 API Request/Response Examples

### Register User
```bash
POST /api/users/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "SecurePass123!",
  "username": "musiclover",
  "firstName": "John",
  "lastName": "Doe"
}
```

### Create Review
```bash
POST /api/reviews
Authorization: Bearer <jwt-token>
Content-Type: application/json

{
  "venueId": "uuid-here",
  "rating": 5,
  "title": "Amazing concert hall!",
  "content": "Great acoustics and atmosphere...",
  "eventDate": "2024-01-15",
  "imageUrls": ["https://example.com/image1.jpg"]
}
```

### Search Venues
```bash
GET /api/venues?q=concert&city=New+York&rating=4&page=1&limit=20
```

## 🔒 Authentication

The API uses JWT (JSON Web Tokens) for authentication. Include the token in the Authorization header:

```
Authorization: Bearer <your-jwt-token>
```

Protected endpoints require a valid JWT token. Tokens expire after 7 days by default.

## 🚦 Rate Limiting

Rate limiting is implemented to prevent abuse:
- **Authentication endpoints**: 5 requests per 15 minutes
- **General endpoints**: 30-100 requests per 15 minutes  
- **Badge checking**: 10 requests per 15 minutes

## 🎯 Badge System

Users automatically earn badges based on their activity:
- **First Review** - Write your first review
- **Review Master** - Write 10 reviews  
- **Review Legend** - Write 50 reviews
- **Venue Explorer** - Review 5 different venues
- **Music Lover** - Review 10 different bands
- **Concert Goer** - Attend and review 25 events
- **Helpful Reviewer** - Get 20 helpful votes

## 🔍 Search & Filtering

### Venue Search Parameters
- `q` - Text search (name, description, city)
- `city` - Filter by city
- `venueType` - Filter by venue type
- `rating` - Minimum rating filter
- `page` - Page number (default: 1)
- `limit` - Results per page (default: 20)
- `sort` - Sort field (name, rating, etc.)
- `order` - Sort order (asc/desc)

### Band Search Parameters  
- `q` - Text search (name, description, genre, hometown)
- `genre` - Filter by genre
- `rating` - Minimum rating filter
- `page`, `limit`, `sort`, `order` - Pagination and sorting

## 🐛 Error Handling

All API responses follow a consistent format:

**Success Response:**
```json
{
  "success": true,
  "data": { ... },
  "message": "Operation completed successfully"
}
```

**Error Response:**
```json
{
  "success": false,
  "error": "Error description"
}
```

## 🚀 Deployment

1. Build the application:
   ```bash
   npm run build
   ```

2. Set production environment variables

3. Start the production server:
   ```bash
   npm start
   ```

For cloud deployment, the app is ready for platforms like:
- Vercel
- Heroku  
- AWS
- DigitalOcean

## 🧪 Testing

Tests will be implemented in Milestone 5. The application is designed to be easily testable with:
- Unit tests for services and utilities
- Integration tests for API endpoints
- Database transaction rollbacks for test isolation

## 📊 Monitoring

The application includes:
- Request logging in development mode
- Error logging with stack traces
- Database query performance logging
- Health check endpoint for monitoring

## 🤝 Contributing

1. Follow TypeScript strict mode
2. Use the existing code structure and patterns
3. Add proper error handling and validation
4. Include JSDoc comments for public methods
5. Test your changes thoroughly

## 📄 License

This project is licensed under the ISC License.