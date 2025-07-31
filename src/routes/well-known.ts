import { Hono } from 'hono';
import { jwtService } from '@/lib/jwt';
import type { JWKSResponse, OpenIDConfiguration } from '@/types';

const app = new Hono();

// JWKS endpoint
app.get('/jwks.json', async (c) => {
  try {
    const publicKey = await jwtService.getPublicKeyJWK();
    
    const response: JWKSResponse = {
      keys: [publicKey]
    };

    return c.json(response);
  } catch (error) {
    console.error('JWKS error:', error);
    return c.json({ error: 'server_error' }, 500);
  }
});

// OpenID Connect Discovery endpoint
app.get('/openid-configuration', (c) => {
  const issuerUrl = process.env.ISSUER_URL!;
  
  const configuration: OpenIDConfiguration = {
    issuer: issuerUrl,
    authorization_endpoint: `${issuerUrl}/authorize`,
    token_endpoint: `${issuerUrl}/token`,
    jwks_uri: `${issuerUrl}/.well-known/jwks.json`,
    response_types_supported: ['code'],
    subject_types_supported: ['public'],
    id_token_signing_alg_values_supported: ['RS256'],
    scopes_supported: ['openid', 'profile', 'email', 'offline_access'],
    userinfo_endpoint: `${issuerUrl}/userinfo`,
    grant_types_supported: ['authorization_code', 'refresh_token'],
    token_endpoint_auth_methods_supported: ['private_key_jwt'],
    pushed_authorization_request_endpoint: `${issuerUrl}/par`,
    require_pushed_authorization_requests: true
  };

  return c.json(configuration);
});

export const wellKnownRoutes = app;