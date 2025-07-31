# OAuth 2.0/OIDC Authorization Server

This is a complete OAuth 2.0 and OpenID Connect authorization server implementation built with HonoX, TypeScript, PostgreSQL, and Redis. It follows the FAPI 2.0 Security Profile and implements modern OAuth security features.

## Features

### OAuth 2.0/OIDC Support
- ✅ Authorization Code Flow with PKCE (S256 only)
- ✅ Refresh Token Flow
- ✅ OpenID Connect ID Tokens
- ✅ Pushed Authorization Requests (PAR)
- ✅ JWT Access Tokens (RS256)
- ✅ UserInfo Endpoint
- ✅ JWKS and Discovery Endpoints

### Security Features
- ✅ private_key_jwt Client Authentication
- ✅ PKCE (Proof Key for Code Exchange)
- ✅ State Parameter Validation
- ✅ CSRF Protection for MPA routes
- ✅ Secure Token Storage (PBKDF2 hashing)
- ✅ JWT Replay Protection Ready
- ⏳ DPoP Support (spec ready, not implemented)
- ⏳ Nonce Support (spec ready, not implemented)

### Database & Caching
- ✅ PostgreSQL with UUID v7 support
- ✅ Redis for session and temporary data
- ✅ Proper database schemas with referential integrity
- ✅ Automatic timestamp management

### Multi-Page Application (MPA)
- ✅ Admin Dashboard
- ✅ Client Registration & Management
- ✅ User Registration & Login
- ✅ Consent/Authorization Pages
- ✅ Responsive UI with Tailwind CSS

## Prerequisites

- Node.js 18+
- PostgreSQL 16+ (for UUID v7 support)
- Redis 6+

## Quick Start

1. **Clone and Install Dependencies**
   ```bash
   git clone <repository-url>
   cd zenn-dir
   npm install
   ```

2. **Set Up Environment**
   ```bash
   cp .env.example .env
   # Edit .env with your database and Redis credentials
   ```

3. **Generate RSA Key Pair for JWT Signing**
   ```bash
   # Generate private key
   openssl genpkey -algorithm RSA -out private_key.pem -pkcs8 -aes256
   
   # Generate public key
   openssl rsa -pubout -in private_key.pem -out public_key.pem
   
   # Copy the keys to your .env file (as single-line strings)
   ```

4. **Set Up Database**
   ```bash
   # Create database
   createdb yamaten
   
   # Run migrations
   npm run db:migrate
   
   # Seed initial data
   npm run db:seed
   ```

5. **Start Development Server**
   ```bash
   npm run dev
   ```

## Environment Variables

```env
# Database
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your_password
POSTGRES_DB=yamaten
POSTGRES_HOST=localhost
POSTGRES_PORT=5432

# Redis
REDIS_URL=redis://localhost:6379

# JWT Configuration
JWT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n..."
JWT_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----\n..."
ISSUER_URL="https://your-domain.com"

# Session Secret
SESSION_SECRET="your-secret-key"
```

## API Endpoints

### OAuth 2.0/OIDC Endpoints
- `POST /par` - Pushed Authorization Requests
- `GET /authorize` - Authorization Endpoint
- `POST /token` - Token Endpoint
- `POST /revoke` - Token Revocation
- `GET /userinfo` - UserInfo Endpoint

### Discovery Endpoints
- `GET /.well-known/openid-configuration` - OpenID Configuration
- `GET /.well-known/jwks.json` - JSON Web Key Set

### Admin Dashboard
- `GET /admin/login` - Admin Login
- `GET /admin/clients` - Client Management
- `GET /admin/clients/new` - Create New Client
- `GET /admin/clients/:id/edit` - Edit Client
- `GET /admin/clients/:id/delete` - Delete Client

### User Authentication
- `GET /register` - User Registration
- `GET /login` - User Login
- `GET /consent` - Authorization Consent
- `GET /error` - Error Display

## Database Schema

The application uses a comprehensive database schema supporting:

- **Users & Admins**: Separate user management for end-users and administrators
- **OAuth Clients**: Client registration with JWKS URI validation
- **Scopes & Permissions**: Granular scope management
- **Consent Management**: User consent tracking and scope associations
- **Token Management**: Refresh token storage with revocation support
- **Audit Logging**: Authentication and authorization event logging

## Security Implementation

### Client Authentication
- **private_key_jwt**: Clients authenticate using JWT signed with their private key
- **JWKS Validation**: Public keys fetched from client's JWKS URI
- **Audience Validation**: JWT audience must match issuer URL (not token endpoint)

### Token Security
- **Access Tokens**: Self-contained JWT tokens with RS256 signature
- **Refresh Tokens**: Opaque tokens stored with PBKDF2 hashing
- **Authorization Codes**: Short-lived, hashed for storage

### PKCE Implementation
- **S256 Method Only**: Only SHA256 code challenge method supported
- **Verifier Validation**: Proper code verifier validation during token exchange

## Testing

```bash
# Type checking
npm run type-check

# Run tests
npm test

# Build for production
npm run build
```

## Default Credentials

### Admin User
- Username: `admin`
- Password: `admin123`

### Available Scopes
- `openid` - OpenID Connect identifier
- `offline_access` - Refresh token issuance
- `email` - Email address access
- `profile` - Profile information access

## Production Deployment

1. **Set Production Environment Variables**
   - Use secure JWT keys
   - Set proper ISSUER_URL
   - Configure database with SSL
   - Use Redis with authentication

2. **Build Application**
   ```bash
   npm run build
   ```

3. **Start Production Server**
   ```bash
   npm start
   ```

4. **Database Setup**
   - Run migrations on production database
   - Create admin users as needed
   - Set up database backups

## Contributing

This implementation follows OAuth 2.0 and OIDC specifications:
- [RFC 6749](https://tools.ietf.org/html/rfc6749) - OAuth 2.0 Authorization Framework
- [RFC 7636](https://tools.ietf.org/html/rfc7636) - PKCE
- [OpenID Connect Core 1.0](https://openid.net/specs/openid-connect-core-1_0.html)
- [RFC 9126](https://tools.ietf.org/html/rfc9126) - Pushed Authorization Requests
- [FAPI 2.0 Security Profile](https://openid.net/specs/fapi-2_0-security-profile.html)

## License

ISC