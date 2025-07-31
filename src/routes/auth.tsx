import { Hono } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import { getDb } from '@/lib/db';
import { jwtService } from '@/lib/jwt';
import { CryptoService } from '@/lib/crypto';
import { getCache, setCache } from '@/lib/redis';
import { Layout, Form, Input, Button, Card, Alert } from '@/components/ui';
import type { User, OAuthClient, PARCache, FlowSession } from '@/types';

const app = new Hono();

// User registration page
app.get('/register', async (c) => {
  const session_id = c.req.query('session_id');
  const error = c.req.query('error');
  
  if (!session_id) {
    return c.redirect('/error?message=Invalid+session');
  }
  
  try {
    const flowSession: FlowSession | null = await getCache(`flow_session:${session_id}`);
    if (!flowSession) {
      return c.redirect('/error?message=Session+expired');
    }
    
    const parData: PARCache | null = await getCache(flowSession.request_uri);
    if (!parData) {
      return c.redirect('/error?message=Authorization+request+expired');
    }
    
    const db = getDb();
    const client = await db`
      SELECT * FROM oauth_clients WHERE client_id = ${parData.client_id}
    `.then(rows => rows[0] as OAuthClient | undefined);
    
    if (!client) {
      return c.redirect('/error?message=Invalid+client');
    }
    
    return c.html(
      Layout({
        title: 'User Registration',
        children: (
          <div class="max-w-md mx-auto">
            <Card title={`Register for ${client.client_name}`}>
              {error && <Alert type="error">{error}</Alert>}
              <Form action="/register">
                <input type="hidden" name="session_id" value={session_id} />
                <Input name="email" type="email" label="Email Address" required />
                <Input name="handle_name" label="Username" required />
                <Input name="display_name" label="Display Name" required />
                <Input name="password" type="password" label="Password" required />
                <Input name="confirm_password" type="password" label="Confirm Password" required />
                <Button>Register</Button>
              </Form>
              <div class="mt-4 text-center">
                <a href={`/login?session_id=${session_id}`} class="text-blue-600 hover:underline">
                  Already have an account? Sign in
                </a>
              </div>
            </Card>
          </div>
        )
      })
    );
  } catch (error) {
    console.error('Error loading registration page:', error);
    return c.redirect('/error?message=Server+error');
  }
});

// User registration handler
app.post('/register', async (c) => {
  try {
    const body = await c.req.parseBody();
    const { session_id, email, handle_name, display_name, password, confirm_password } = body;
    
    if (!session_id || !email || !handle_name || !display_name || !password || !confirm_password) {
      return c.redirect(`/register?session_id=${session_id}&error=Missing+required+fields`);
    }
    
    if (password !== confirm_password) {
      return c.redirect(`/register?session_id=${session_id}&error=Passwords+do+not+match`);
    }
    
    const flowSession: FlowSession | null = await getCache(`flow_session:${session_id}`);
    if (!flowSession) {
      return c.redirect('/error?message=Session+expired');
    }
    
    const db = getDb();
    
    // Check if user already exists
    const existingUser = await db`
      SELECT user_id FROM users 
      WHERE email = ${email as string} OR handle_name = ${handle_name as string}
    `.then(rows => rows[0]);
    
    if (existingUser) {
      return c.redirect(`/register?session_id=${session_id}&error=User+already+exists`);
    }
    
    // Create user
    const passwordHash = await CryptoService.hashPassword(password as string);
    const [user] = await db`
      INSERT INTO users (email, password_hash, handle_name, display_name)
      VALUES (${email as string}, ${passwordHash}, ${handle_name as string}, ${display_name as string})
      RETURNING user_id
    `;
    
    if (!user) {
      throw new Error('Failed to create user');
    }
    
    // Create session token
    const token = jwtService.createSessionToken({
      sub: user.user_id,
      type: 'user'
    });
    
    setCookie(c, 'user_session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'Lax',
      maxAge: 10 * 60 // 10 minutes
    });
    
    // Update flow session
    flowSession.status = 'authenticated';
    await setCache(`flow_session:${session_id}`, flowSession, 300);
    
    return c.redirect(`/consent?session_id=${session_id}`);
  } catch (error) {
    console.error('Registration error:', error);
    const body = await c.req.parseBody();
    return c.redirect(`/register?session_id=${body.session_id}&error=Registration+failed`);
  }
});

// User login page
app.get('/login', async (c) => {
  const session_id = c.req.query('session_id');
  const error = c.req.query('error');
  
  if (!session_id) {
    return c.redirect('/error?message=Invalid+session');
  }
  
  try {
    const flowSession: FlowSession | null = await getCache(`flow_session:${session_id}`);
    if (!flowSession) {
      return c.redirect('/error?message=Session+expired');
    }
    
    const parData: PARCache | null = await getCache(flowSession.request_uri);
    if (!parData) {
      return c.redirect('/error?message=Authorization+request+expired');
    }
    
    const db = getDb();
    const client = await db`
      SELECT * FROM oauth_clients WHERE client_id = ${parData.client_id}
    `.then(rows => rows[0] as OAuthClient | undefined);
    
    if (!client) {
      return c.redirect('/error?message=Invalid+client');
    }
    
    return c.html(
      Layout({
        title: 'User Login',
        children: (
          <div class="max-w-md mx-auto">
            <Card title={`Sign in to ${client.client_name}`}>
              {error && <Alert type="error">{error}</Alert>}
              <Form action="/login">
                <input type="hidden" name="session_id" value={session_id} />
                <Input name="handle_name" label="Username" required />
                <Input name="password" type="password" label="Password" required />
                <Button>Sign In</Button>
              </Form>
              <div class="mt-4 text-center">
                <a href={`/register?session_id=${session_id}`} class="text-blue-600 hover:underline">
                  Don't have an account? Register
                </a>
              </div>
            </Card>
          </div>
        )
      })
    );
  } catch (error) {
    console.error('Error loading login page:', error);
    return c.redirect('/error?message=Server+error');
  }
});

// User login handler
app.post('/login', async (c) => {
  try {
    const body = await c.req.parseBody();
    const { session_id, handle_name, password } = body;
    
    if (!session_id || !handle_name || !password) {
      return c.redirect(`/login?session_id=${session_id}&error=Missing+credentials`);
    }
    
    const flowSession: FlowSession | null = await getCache(`flow_session:${session_id}`);
    if (!flowSession) {
      return c.redirect('/error?message=Session+expired');
    }
    
    const db = getDb();
    const user = await db`
      SELECT * FROM users 
      WHERE handle_name = ${handle_name as string} AND is_active = true
    `.then(rows => rows[0] as User | undefined);
    
    if (!user || !await CryptoService.verifyPassword(password as string, user.password_hash)) {
      return c.redirect(`/login?session_id=${session_id}&error=Invalid+credentials`);
    }
    
    // Create session token
    const token = jwtService.createSessionToken({
      sub: user.user_id,
      type: 'user'
    });
    
    setCookie(c, 'user_session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'Lax',
      maxAge: 10 * 60 // 10 minutes
    });
    
    // Update flow session
    flowSession.status = 'authenticated';
    await setCache(`flow_session:${session_id}`, flowSession, 300);
    
    return c.redirect(`/consent?session_id=${session_id}`);
  } catch (error) {
    console.error('Login error:', error);
    const body = await c.req.parseBody();
    return c.redirect(`/login?session_id=${body.session_id}&error=Login+failed`);
  }
});

// Consent page
app.get('/consent', async (c) => {
  const session_id = c.req.query('session_id');
  const error = c.req.query('error');
  
  if (!session_id) {
    return c.redirect('/error?message=Invalid+session');
  }
  
  try {
    const flowSession: FlowSession | null = await getCache(`flow_session:${session_id}`);
    if (!flowSession || flowSession.status !== 'authenticated') {
      return c.redirect(`/login?session_id=${session_id}`);
    }
    
    const parData: PARCache | null = await getCache(flowSession.request_uri);
    if (!parData) {
      return c.redirect('/error?message=Authorization+request+expired');
    }
    
    // Check user session
    const userToken = getCookie(c, 'user_session');
    if (!userToken) {
      return c.redirect(`/login?session_id=${session_id}`);
    }
    
    const userPayload = jwtService.verifySessionToken(userToken);
    
    const db = getDb();
    const [client, user] = await Promise.all([
      db`SELECT * FROM oauth_clients WHERE client_id = ${parData.client_id}`.then(rows => rows[0] as OAuthClient),
      db`SELECT * FROM users WHERE user_id = ${userPayload.sub}`.then(rows => rows[0] as User)
    ]);
    
    // Get requested scopes
    const scopeNames = parData.scope.split(' ');
    const scopes = await db`
      SELECT * FROM oauth_scopes WHERE scope_name = ANY(${scopeNames})
    `;
    
    // Check if user has already consented
    const existingConsent = await db`
      SELECT uc.consent_id
      FROM user_consents uc
      JOIN user_consent_scopes ucs ON uc.consent_id = ucs.user_consent_id
      JOIN oauth_scopes os ON ucs.scope_id = os.scope_id
      WHERE uc.user_id = ${user.user_id} AND uc.client_id = ${client.client_id}
      AND os.scope_name = ANY(${scopeNames})
      GROUP BY uc.consent_id
      HAVING COUNT(DISTINCT os.scope_name) = ${scopeNames.length}
    `.then(rows => rows[0]);
    
    if (existingConsent) {
      // User has already consented, proceed to authorization
      return c.redirect(`/authorize/complete?session_id=${session_id}`);
    }
    
    return c.html(
      Layout({
        title: 'Authorization Consent',
        children: (
          <div class="max-w-md mx-auto">
            <Card title={`Authorize ${client.client_name}`}>
              {error && <Alert type="error">{error}</Alert>}
              <div class="mb-4">
                <p class="text-sm text-gray-600 mb-4">
                  <strong>{client.client_name}</strong> is requesting access to your account.
                </p>
                <div class="border rounded-lg p-4 bg-gray-50">
                  <h4 class="font-medium text-gray-900 mb-2">Requested permissions:</h4>
                  <ul class="space-y-1">
                    {scopes.map((scope: any) => (
                      <li class="text-sm text-gray-600">• {scope.scope_name}</li>
                    ))}
                  </ul>
                </div>
              </div>
              <Form action="/consent">
                <input type="hidden" name="session_id" value={session_id} />
                <div class="flex space-x-2">
                  <Button>Authorize</Button>
                  <a href={`/consent/deny?session_id=${session_id}`} class="px-4 py-2 bg-gray-600 text-white font-medium rounded-md hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500">
                    Deny
                  </a>
                </div>
              </Form>
            </Card>
          </div>
        )
      })
    );
  } catch (error) {
    console.error('Error loading consent page:', error);
    return c.redirect('/error?message=Server+error');
  }
});

// Consent handler
app.post('/consent', async (c) => {
  try {
    const body = await c.req.parseBody();
    const { session_id } = body;
    
    const flowSession: FlowSession | null = await getCache(`flow_session:${session_id}`);
    if (!flowSession || flowSession.status !== 'authenticated') {
      return c.redirect(`/login?session_id=${session_id}`);
    }
    
    const userToken = getCookie(c, 'user_session');
    if (!userToken) {
      return c.redirect(`/login?session_id=${session_id}`);
    }
    
    const userPayload = jwtService.verifySessionToken(userToken);
    const parData: PARCache | null = await getCache(flowSession.request_uri);
    if (!parData) {
      return c.redirect('/error?message=Authorization+request+expired');
    }
    
    const db = getDb();
    const scopeNames = parData.scope.split(' ');
    const scopes = await db`
      SELECT * FROM oauth_scopes WHERE scope_name = ANY(${scopeNames})
    `;
    
    // Create or update consent
    await db.begin(async (tx) => {
      const [consent] = await tx`
        INSERT INTO user_consents (user_id, client_id)
        VALUES (${userPayload.sub}, ${parData.client_id})
        ON CONFLICT (user_id, client_id)
        DO UPDATE SET updated_at = NOW()
        RETURNING consent_id
      `;
      
      if (!consent) {
        throw new Error('Failed to create consent');
      }
      
      // Clear existing consent scopes and add new ones
      await tx`DELETE FROM user_consent_scopes WHERE user_consent_id = ${consent.consent_id}`;
      
      for (const scope of scopes) {
        await tx`
          INSERT INTO user_consent_scopes (user_consent_id, scope_id)
          VALUES (${consent.consent_id}, ${scope.scope_id})
        `;
      }
    });
    
    // Update flow session
    flowSession.status = 'consent_pending';
    await setCache(`flow_session:${session_id}`, flowSession, 300);
    
    return c.redirect(`/authorize/complete?session_id=${session_id}`);
  } catch (error) {
    console.error('Consent error:', error);
    const body = await c.req.parseBody();
    return c.redirect(`/consent?session_id=${body.session_id}&error=Consent+failed`);
  }
});

// Consent denial
app.get('/consent/deny', (c) => {
  return c.redirect('/error?message=Authorization+denied');
});

// Error page
app.get('/error', (c) => {
  const message = c.req.query('message') || 'An error occurred';
  
  return c.html(
    Layout({
      title: 'Error',
      children: (
        <div class="max-w-md mx-auto">
          <Card title="Error">
            <Alert type="error">{decodeURIComponent(message)}</Alert>
            <div class="mt-4">
              <a href="/" class="text-blue-600 hover:underline">← Go back</a>
            </div>
          </Card>
        </div>
      )
    })
  );
});

export const authRoutes = app;