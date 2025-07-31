export interface User {
  user_id: string;
  email: string;
  password_hash: string;
  handle_name: string;
  display_name: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface Admin {
  admin_id: string;
  email: string;
  password_hash: string;
  handle_name: string;
  display_name: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export type ClientType = 'confidential';

export interface OAuthClient {
  client_id: string;
  created_by: string;
  client_name: string;
  client_description?: string;
  client_type: ClientType;
  jwks_uri: string;
  created_at: Date;
  updated_at: Date;
}

export interface OAuthRedirectUri {
  redirect_uri_id: string;
  client_id: string;
  redirect_uri: string;
  created_at: Date;
}

export interface OAuthScope {
  scope_id: string;
  scope_name: string;
  created_at: Date;
}

export interface UserConsent {
  consent_id: string;
  user_id: string;
  client_id: string;
  created_at: Date;
  updated_at: Date;
}

export interface RefreshToken {
  refresh_token_id: string;
  client_id: string;
  user_id: string;
  refresh_token_hash: string;
  issued_at: Date;
  expires_at: Date;
  is_revoked: boolean;
  revoked_at?: Date;
  revoked_reason?: string;
  last_used_at?: Date;
}

export type AuthEventStatus = 'success' | 'failure';
export type AuthEventType = 'login' | 'register' | 'consent' | 'token_request' | 'token_refresh' | 'admin_login';

export interface AuthEventLog {
  event_id: string;
  status: AuthEventStatus;
  event_type: AuthEventType;
  user_id?: string;
  user_screen_name?: string;
  client_id?: string;
  refresh_token_id?: string;
  log_message: string;
  created_at: Date;
}

// JWT payload types
export interface AccessTokenPayload {
  iss: string;
  sub: string;
  aud: string;
  exp: number;
  iat: number;
  jti: string;
  scope: string;
  [key: string]: any;
}

export interface IDTokenPayload {
  iss: string;
  sub: string;
  aud: string;
  exp: number;
  iat: number;
  name?: string;
  email?: string;
  [key: string]: any;
}

export interface SessionJWTPayload {
  sub: string;
  type: 'user' | 'admin';
  exp: number;
  iat: number;
}

// Cache/Session types
export type FlowSessionStatus = 
  | 'unauthenticated'
  | 'authenticated' 
  | 'consent_pending'
  | 'authorized'
  | 'token_issued'
  | 'error';

export interface PARCache {
  client_id: string;
  response_type: string;
  redirect_uri: string;
  scope: string;
  state: string;
  code_challenge: string;
  code_challenge_method: string;
  created_at: Date;
}

export interface FlowSession {
  request_uri: string;
  status: FlowSessionStatus;
}

export interface AuthorizationCodeCache {
  client_id: string;
  pkce_challenge: string;
  pkce_method: string;
  redirect_uri: string;
  scope: string;
}

// Request/Response types
export interface PARRequest {
  client_id: string;
  response_type: string;
  redirect_uri: string;
  scope: string;
  state: string;
  code_challenge: string;
  code_challenge_method: string;
}

export interface PARResponse {
  request_uri: string;
  expires_in: number;
}

export interface TokenRequest {
  grant_type: string;
  client_id: string;
  code?: string;
  redirect_uri?: string;
  code_verifier?: string;
  refresh_token?: string;
  scope?: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  id_token?: string;
  scope: string;
}

export interface UserInfoResponse {
  sub: string;
  name?: string;
  email?: string;
}

export interface JWKSResponse {
  keys: JsonWebKey[];
}

export interface OpenIDConfiguration {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
  response_types_supported: string[];
  subject_types_supported: string[];
  id_token_signing_alg_values_supported: string[];
  scopes_supported: string[];
  userinfo_endpoint: string;
  grant_types_supported: string[];
  token_endpoint_auth_methods_supported: string[];
  pushed_authorization_request_endpoint: string;
  require_pushed_authorization_requests: boolean;
}