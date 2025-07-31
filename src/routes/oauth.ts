import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import { getDb } from '@/lib/db';
import { jwtService } from '@/lib/jwt';
import { CryptoService } from '@/lib/crypto';
import { getCache, setCache, deleteCache } from '@/lib/redis';
import type { 
  PARCache, 
  FlowSession, 
  AuthorizationCodeCache, 
  TokenResponse,
  UserInfoResponse,
  User,
  OAuthClient,
  RefreshToken
} from '@/types';

const app = new Hono();

// PAR (Pushed Authorization Requests) endpoint
app.post('/par', async (c) => {
  try {
    // TODO: Implement private_key_jwt client authentication
    const body = await c.req.parseBody();
    const {
      client_id,
      response_type,
      redirect_uri,
      scope,
      state,
      code_challenge,
      code_challenge_method
    } = body;

    // Basic validation
    if (!client_id || !response_type || !redirect_uri || !scope || !state || !code_challenge || !code_challenge_method) {
      return c.json({ error: 'invalid_request', error_description: 'Missing required parameters' }, 400);
    }

    if (response_type !== 'code') {
      return c.json({ error: 'unsupported_response_type' }, 400);
    }

    if (code_challenge_method !== 'S256') {
      return c.json({ error: 'invalid_request', error_description: 'Only S256 code challenge method is supported' }, 400);
    }

    const db = getDb();

    // Validate client
    const client = await db`
      SELECT * FROM oauth_clients WHERE client_id = ${client_id as string}
    `.then(rows => rows[0] as OAuthClient | undefined);

    if (!client) {
      return c.json({ error: 'invalid_client' }, 400);
    }

    // Validate redirect URI
    const validRedirectUri = await db`
      SELECT * FROM oauth_redirect_uris 
      WHERE client_id = ${client_id as string} AND redirect_uri = ${redirect_uri as string}
    `.then(rows => rows[0]);

    if (!validRedirectUri) {
      return c.json({ error: 'invalid_request', error_description: 'Invalid redirect_uri' }, 400);
    }

    // Validate scopes
    const requestedScopes = (scope as string).split(' ');
    const [clientScopes, allScopes] = await Promise.all([
      db`
        SELECT os.scope_name
        FROM oauth_client_scopes ocs
        JOIN oauth_scopes os ON ocs.scope_id = os.scope_id
        WHERE ocs.client_id = ${client_id as string}
      `,
      db`SELECT scope_name FROM oauth_scopes`
    ]);

    const allowedScopeNames = clientScopes.map(s => s.scope_name);
    const validScopeNames = allScopes.map(s => s.scope_name);

    for (const requestedScope of requestedScopes) {
      if (!validScopeNames.includes(requestedScope)) {
        return c.json({ error: 'invalid_scope', error_description: `Unknown scope: ${requestedScope}` }, 400);
      }
      if (!allowedScopeNames.includes(requestedScope)) {
        return c.json({ error: 'invalid_scope', error_description: `Scope not allowed for client: ${requestedScope}` }, 400);
      }
    }

    // Generate request URI
    const request_uri = CryptoService.generateRequestURI();
    
    // Store PAR data
    const parData: PARCache = {
      client_id: client_id as string,
      response_type: response_type as string,
      redirect_uri: redirect_uri as string,
      scope: scope as string,
      state: state as string,
      code_challenge: code_challenge as string,
      code_challenge_method: code_challenge_method as string,
      created_at: new Date()
    };

    await setCache(request_uri, parData, 300); // 5 minutes TTL

    return c.json({
      request_uri,
      expires_in: 300
    });
  } catch (error) {
    console.error('PAR error:', error);
    return c.json({ error: 'server_error' }, 500);
  }
});

// Authorization endpoint
app.get('/authorize', async (c) => {
  try {
    const request_uri = c.req.query('request_uri');
    const client_id = c.req.query('client_id');

    if (!request_uri || !client_id) {
      return c.redirect('/error?message=Missing+request_uri+or+client_id');
    }

    // Get PAR data
    const parData: PARCache | null = await getCache(request_uri);
    if (!parData) {
      return c.redirect('/error?message=Invalid+or+expired+request_uri');
    }

    if (parData.client_id !== client_id) {
      return c.redirect('/error?message=Client+ID+mismatch');
    }

    // Generate session ID
    const session_id = CryptoService.generateToken();
    
    // Create flow session
    const flowSession: FlowSession = {
      request_uri,
      status: 'unauthenticated'
    };
    
    await setCache(`flow_session:${session_id}`, flowSession, 300);

    // Check if user is already authenticated
    const userToken = getCookie(c, 'user_session');
    if (userToken) {
      try {
        const userPayload = jwtService.verifySessionToken(userToken);
        if (userPayload.type === 'user') {
          // Check if user has already consented
          const db = getDb();
          const scopeNames = parData.scope.split(' ');
          const existingConsent = await db`
            SELECT uc.consent_id
            FROM user_consents uc
            JOIN user_consent_scopes ucs ON uc.consent_id = ucs.user_consent_id
            JOIN oauth_scopes os ON ucs.scope_id = os.scope_id
            WHERE uc.user_id = ${userPayload.sub} AND uc.client_id = ${parData.client_id}
            AND os.scope_name = ANY(${scopeNames})
            GROUP BY uc.consent_id
            HAVING COUNT(DISTINCT os.scope_name) = ${scopeNames.length}
          `.then(rows => rows[0]);

          if (existingConsent) {
            // User is authenticated and has consented, issue authorization code
            flowSession.status = 'authenticated';
            await setCache(`flow_session:${session_id}`, flowSession, 300);
            return c.redirect(`/authorize/complete?session_id=${session_id}`);
          } else {
            // User is authenticated but needs to consent
            flowSession.status = 'authenticated';
            await setCache(`flow_session:${session_id}`, flowSession, 300);
            return c.redirect(`/consent?session_id=${session_id}`);
          }
        }
      } catch (error) {
        // Invalid token, proceed to login
      }
    }

    // User needs to authenticate
    return c.redirect(`/login?session_id=${session_id}`);
  } catch (error) {
    console.error('Authorization error:', error);
    return c.redirect('/error?message=Authorization+failed');
  }
});

// Complete authorization (issue authorization code)
app.get('/authorize/complete', async (c) => {
  try {
    const session_id = c.req.query('session_id');
    if (!session_id) {
      return c.redirect('/error?message=Invalid+session');
    }

    const flowSession: FlowSession | null = await getCache(`flow_session:${session_id}`);
    if (!flowSession || flowSession.status !== 'authenticated') {
      return c.redirect(`/login?session_id=${session_id}`);
    }

    const parData: PARCache | null = await getCache(flowSession.request_uri);
    if (!parData) {
      return c.redirect('/error?message=Authorization+request+expired');
    }

    const userToken = getCookie(c, 'user_session');
    if (!userToken) {
      return c.redirect(`/login?session_id=${session_id}`);
    }

    // We need to get the actual user ID from the authorization flow
    // For now, this is simplified - in a real implementation, we'd store the user ID in the auth code
    // const userPayload = jwtService.verifySessionToken(userToken);

    // Generate authorization code
    const authCode = CryptoService.generateAuthorizationCode();
    const authCodeHash = await CryptoService.hashToken(authCode);

    // Store authorization code
    const authCodeData: AuthorizationCodeCache = {
      client_id: parData.client_id,
      pkce_challenge: parData.code_challenge,
      pkce_method: parData.code_challenge_method,
      redirect_uri: parData.redirect_uri,
      scope: parData.scope
    };

    await setCache(`auth_code:${authCodeHash}`, authCodeData, 60); // 1 minute TTL

    // Clean up PAR and session
    await deleteCache(flowSession.request_uri);
    await deleteCache(`flow_session:${session_id}`);

    // Redirect with authorization code
    const redirectUrl = new URL(parData.redirect_uri);
    redirectUrl.searchParams.set('code', authCode);
    redirectUrl.searchParams.set('state', parData.state);
    redirectUrl.searchParams.set('iss', process.env.ISSUER_URL!);

    return c.redirect(redirectUrl.toString());
  } catch (error) {
    console.error('Authorization completion error:', error);
    return c.redirect('/error?message=Authorization+failed');
  }
});

// Token endpoint
app.post('/token', async (c) => {
  try {
    // TODO: Implement private_key_jwt client authentication
    const body = await c.req.parseBody();
    const { grant_type, client_id } = body;

    if (!grant_type || !client_id) {
      return c.json({ error: 'invalid_request' }, 400);
    }

    const db = getDb();
    const client = await db`
      SELECT * FROM oauth_clients WHERE client_id = ${client_id as string}
    `.then(rows => rows[0] as OAuthClient | undefined);

    if (!client) {
      return c.json({ error: 'invalid_client' }, 400);
    }

    if (grant_type === 'authorization_code') {
      return handleAuthorizationCodeGrant(c, body, client, db);
    } else if (grant_type === 'refresh_token') {
      return handleRefreshTokenGrant(c, body, client, db);
    } else {
      return c.json({ error: 'unsupported_grant_type' }, 400);
    }
  } catch (error) {
    console.error('Token endpoint error:', error);
    return c.json({ error: 'server_error' }, 500);
  }
});

async function handleAuthorizationCodeGrant(c: any, body: any, client: OAuthClient, db: any) {
  const { code, redirect_uri, code_verifier } = body;

  if (!code || !redirect_uri || !code_verifier) {
    return c.json({ error: 'invalid_request' }, 400);
  }

  // Get authorization code data
  const codeHash = await CryptoService.hashToken(code);
  const authCodeData: AuthorizationCodeCache | null = await getCache(`auth_code:${codeHash}`);
  
  if (!authCodeData) {
    return c.json({ error: 'invalid_grant' }, 400);
  }

  // Validate client and redirect URI
  if (authCodeData.client_id !== client.client_id || authCodeData.redirect_uri !== redirect_uri) {
    return c.json({ error: 'invalid_grant' }, 400);
  }

  // Verify PKCE
  const pkceValid = await CryptoService.verifyCodeChallenge(
    code_verifier,
    authCodeData.pkce_challenge,
    authCodeData.pkce_method
  );

  if (!pkceValid) {
    return c.json({ error: 'invalid_grant' }, 400);
  }

  // TODO: Get user from the authorization flow
  // For now, we'll need to store user_id in the auth code data
  // This is a simplified implementation
  
  const scopes = authCodeData.scope.split(' ');
  const hasOpenId = scopes.includes('openid');
  const hasOfflineAccess = scopes.includes('offline_access');

  // Generate tokens
  const jti = CryptoService.generateToken();
  const accessToken = await jwtService.createAccessToken({
    sub: 'user_id', // TODO: Get actual user ID
    aud: client.client_id,
    jti,
    scope: authCodeData.scope
  });

  const response: TokenResponse = {
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: 600, // 10 minutes
    scope: authCodeData.scope
  };

  if (hasOpenId) {
    const idToken = await jwtService.createIDToken({
      sub: 'user_id', // TODO: Get actual user data
      aud: client.client_id,
      name: 'User Name',
      email: 'user@example.com'
    });
    response.id_token = idToken;
  }

  if (hasOfflineAccess) {
    // Generate refresh token
    const refreshTokenValue = CryptoService.generateRefreshToken();
    const refreshTokenHash = await CryptoService.hashToken(refreshTokenValue);
    
    // Store refresh token in database
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
    await db`
      INSERT INTO refresh_tokens (client_id, user_id, refresh_token_hash, expires_at)
      VALUES (${client.client_id}, ${'user_id'}, ${refreshTokenHash}, ${expiresAt})
    `;
    
    response.refresh_token = refreshTokenValue;
  }

  // Clean up authorization code
  await deleteCache(`auth_code:${codeHash}`);

  return c.json(response);
}

async function handleRefreshTokenGrant(c: any, body: any, client: OAuthClient, db: any) {
  const { refresh_token, scope } = body;

  if (!refresh_token) {
    return c.json({ error: 'invalid_request' }, 400);
  }

  // Verify refresh token
  const refreshTokenHash = await CryptoService.hashToken(refresh_token);
  const storedToken = await db`
    SELECT rt.*, array_agg(os.scope_name) as scopes
    FROM refresh_tokens rt
    LEFT JOIN refresh_token_scopes rts ON rt.refresh_token_id = rts.refresh_token_id
    LEFT JOIN oauth_scopes os ON rts.scope_id = os.scope_id
    WHERE rt.refresh_token_hash = ${refreshTokenHash}
    AND rt.client_id = ${client.client_id}
    AND rt.expires_at > NOW()
    AND rt.is_revoked = false
    GROUP BY rt.refresh_token_id
  `.then((rows: any[]) => rows[0] as (RefreshToken & { scopes: string[] }) | undefined);

  if (!storedToken) {
    return c.json({ error: 'invalid_grant' }, 400);
  }

  // Validate requested scope
  const requestedScopes = scope ? scope.split(' ') : storedToken.scopes;
  const allowedScopes = storedToken.scopes;
  
  for (const requestedScope of requestedScopes) {
    if (!allowedScopes.includes(requestedScope)) {
      return c.json({ error: 'invalid_scope' }, 400);
    }
  }

  // Generate new access token
  const jti = CryptoService.generateToken();
  const accessToken = await jwtService.createAccessToken({
    sub: storedToken.user_id,
    aud: client.client_id,
    jti,
    scope: requestedScopes.join(' ')
  });

  // Update last used timestamp
  await db`
    UPDATE refresh_tokens 
    SET last_used_at = NOW()
    WHERE refresh_token_id = ${storedToken.refresh_token_id}
  `;

  return c.json({
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: 600, // 10 minutes
    scope: requestedScopes.join(' ')
  });
}

// Token revocation endpoint
app.post('/revoke', async (c) => {
  try {
    const body = await c.req.parseBody();
    const { token } = body;

    if (!token || typeof token !== 'string') {
      return c.json({ error: 'invalid_request' }, 400);
    }

    // Only refresh tokens can be revoked (access tokens are stateless)
    const db = getDb();
    const tokenHash = await CryptoService.hashToken(token);
    
    await db`
      UPDATE refresh_tokens 
      SET is_revoked = true, revoked_at = NOW(), revoked_reason = 'Client revocation'
      WHERE refresh_token_hash = ${tokenHash}
    `;

    return c.json({});
  } catch (error) {
    console.error('Token revocation error:', error);
    return c.json({ error: 'server_error' }, 500);
  }
});

// UserInfo endpoint
app.get('/userinfo', async (c) => {
  try {
    const authorization = c.req.header('Authorization');
    if (!authorization || !authorization.startsWith('Bearer ')) {
      return c.json({ error: 'invalid_token' }, 401);
    }

    const accessToken = authorization.substring(7);
    const payload = await jwtService.verifyAccessToken(accessToken);

    const db = getDb();
    const user = await db`
      SELECT * FROM users WHERE user_id = ${payload.sub}
    `.then(rows => rows[0] as User | undefined);

    if (!user) {
      return c.json({ error: 'invalid_token' }, 401);
    }

    const scopes = payload.scope.split(' ');
    const response: UserInfoResponse = {
      sub: user.user_id
    };

    if (scopes.includes('profile')) {
      response.name = user.display_name;
    }

    if (scopes.includes('email')) {
      response.email = user.email;
    }

    return c.json(response);
  } catch (error) {
    console.error('UserInfo error:', error);
    return c.json({ error: 'invalid_token' }, 401);
  }
});

export const oauthRoutes = app;