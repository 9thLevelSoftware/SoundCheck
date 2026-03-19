# SoundCheck Backend API

A comprehensive Node.js/Express/TypeScript API for the SoundCheck mobile application, allowing users to discover venues and bands, check in at shows, and earn badges.

## 🚀 Features

- **User Authentication** - JWT-based auth with registration, login, and profile management
- **Venue Discovery** - CRUD operations, search, filtering, and location-based queries
- **Band Discovery** - CRUD operations, search by genre, trending bands
- **Check-ins & Ratings** - Create, read, update, delete check-ins with ratings and notes
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
- **check_ins** - User check-ins at venues with ratings and notes
- **badges** - Achievement badges
- **user_badges** - User badge earnings
- **user_followers** - User following relationships

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

### ✓ Check-ins
```
GET    /api/check-ins                # Search check-ins with filters
GET    /api/check-ins/:id            # Get check-in by ID
POST   /api/check-ins                # Create check-in (auth required)
PUT    /api/check-ins/:id            # Update check-in (auth required)
DELETE /api/check-ins/:id            # Delete check-in (auth required)
GET    /api/check-ins/venue/:venueId # Get check-ins for venue
GET    /api/check-ins/band/:bandId   # Get check-ins for band
GET    /api/check-ins/user/:userId   # Get check-ins by user
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

### Create Check-in
```bash
POST /api/check-ins
Authorization: Bearer <jwt-token>
Content-Type: application/json

{
  "venueId": "uuid-here",
  "rating": 5,
  "notes": "Great acoustics and atmosphere...",
  "visitDate": "2024-01-15",
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
- **First Check-in** - Check in to your first show
- **Check-in Champion** - Check in to 10 shows
- **Check-in Legend** - Check in to 50 shows
- **Venue Explorer** - Check in at 5 different venues
- **Band Collector** - Check in to 10 different bands
- **Concert Goer** - Check in to 25 shows
- **Popular Spot** - Your venue check-ins get 20 likes

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