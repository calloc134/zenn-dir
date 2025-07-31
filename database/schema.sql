-- UUID v7 extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enable UUID v7 support (PostgreSQL 18+)
-- Note: For older versions, you might need a custom function

-- Users table (login users/resource owners)
CREATE TABLE users (
    user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    handle_name VARCHAR(255) NOT NULL UNIQUE,
    display_name VARCHAR(255) NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Admins table (administrator users)
CREATE TABLE admins (
    admin_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    handle_name VARCHAR(255) NOT NULL UNIQUE,
    display_name VARCHAR(255) NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- OAuth client types enum
CREATE TYPE client_type_enum AS ENUM ('confidential');

-- OAuth clients table
CREATE TABLE oauth_clients (
    client_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_by UUID NOT NULL REFERENCES admins(admin_id) ON DELETE CASCADE,
    client_name VARCHAR(255) NOT NULL UNIQUE,
    client_description TEXT,
    client_type client_type_enum DEFAULT 'confidential',
    jwks_uri VARCHAR(512) NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- OAuth redirect URIs table
CREATE TABLE oauth_redirect_uris (
    redirect_uri_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES oauth_clients(client_id) ON DELETE CASCADE,
    redirect_uri VARCHAR(512) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(client_id, redirect_uri)
);

-- OAuth scopes table
CREATE TABLE oauth_scopes (
    scope_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scope_name VARCHAR(255) NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- OAuth client scopes junction table
CREATE TABLE oauth_client_scopes (
    client_id UUID NOT NULL REFERENCES oauth_clients(client_id) ON DELETE CASCADE,
    scope_id UUID NOT NULL REFERENCES oauth_scopes(scope_id) ON DELETE CASCADE,
    PRIMARY KEY (client_id, scope_id)
);

-- User consents table
CREATE TABLE user_consents (
    consent_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    client_id UUID NOT NULL REFERENCES oauth_clients(client_id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, client_id)
);

-- Refresh tokens table
CREATE TABLE refresh_tokens (
    refresh_token_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES oauth_clients(client_id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    refresh_token_hash VARCHAR(512) NOT NULL UNIQUE,
    issued_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    is_revoked BOOLEAN DEFAULT false,
    revoked_at TIMESTAMP WITH TIME ZONE,
    revoked_reason TEXT,
    last_used_at TIMESTAMP WITH TIME ZONE
);

-- User consent scopes junction table
CREATE TABLE user_consent_scopes (
    user_consent_id UUID NOT NULL REFERENCES user_consents(consent_id) ON DELETE CASCADE,
    scope_id UUID NOT NULL REFERENCES oauth_scopes(scope_id) ON DELETE CASCADE,
    PRIMARY KEY (user_consent_id, scope_id)
);

-- Refresh token scopes junction table
CREATE TABLE refresh_token_scopes (
    refresh_token_id UUID NOT NULL REFERENCES refresh_tokens(refresh_token_id) ON DELETE CASCADE,
    scope_id UUID NOT NULL REFERENCES oauth_scopes(scope_id) ON DELETE CASCADE,
    PRIMARY KEY (refresh_token_id, scope_id)
);

-- Auth event log status enum
CREATE TYPE auth_event_status_enum AS ENUM ('success', 'failure');

-- Auth event log type enum
CREATE TYPE auth_event_type_enum AS ENUM ('login', 'register', 'consent', 'token_request', 'token_refresh', 'admin_login');

-- Auth event logs table
CREATE TABLE auth_event_logs (
    event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    status auth_event_status_enum NOT NULL,
    event_type auth_event_type_enum NOT NULL,
    user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
    user_screen_name VARCHAR(255),
    client_id UUID REFERENCES oauth_clients(client_id) ON DELETE SET NULL,
    refresh_token_id UUID REFERENCES refresh_tokens(refresh_token_id) ON DELETE SET NULL,
    log_message TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_handle_name ON users(handle_name);
CREATE INDEX idx_admins_email ON admins(email);
CREATE INDEX idx_admins_handle_name ON admins(handle_name);
CREATE INDEX idx_oauth_clients_client_name ON oauth_clients(client_name);
CREATE INDEX idx_oauth_redirect_uris_client_id ON oauth_redirect_uris(client_id);
CREATE INDEX idx_refresh_tokens_client_id ON refresh_tokens(client_id);
CREATE INDEX idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_hash ON refresh_tokens(refresh_token_hash);
CREATE INDEX idx_refresh_tokens_expires_at ON refresh_tokens(expires_at);
CREATE INDEX idx_user_consents_user_id ON user_consents(user_id);
CREATE INDEX idx_user_consents_client_id ON user_consents(client_id);
CREATE INDEX idx_auth_event_logs_user_id ON auth_event_logs(user_id);
CREATE INDEX idx_auth_event_logs_client_id ON auth_event_logs(client_id);
CREATE INDEX idx_auth_event_logs_created_at ON auth_event_logs(created_at);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_admins_updated_at BEFORE UPDATE ON admins FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_oauth_clients_updated_at BEFORE UPDATE ON oauth_clients FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_user_consents_updated_at BEFORE UPDATE ON user_consents FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();