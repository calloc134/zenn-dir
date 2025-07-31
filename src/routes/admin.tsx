import { Hono } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { getDb } from '@/lib/db';
import { jwtService } from '@/lib/jwt';
import { CryptoService } from '@/lib/crypto';
import { Layout, Form, Input, Button, Card, Alert } from '@/components/ui';
import type { Admin } from '@/types';
import type { AdminContext } from '@/lib/context';

const app = new Hono();

// Middleware to check admin authentication
const requireAdminAuth = async (c: AdminContext, next: any): Promise<Response | void> => {
  const token = getCookie(c, 'admin_session');
  
  if (!token) {
    return c.redirect('/admin/login');
  }
  
  try {
    const payload = jwtService.verifySessionToken(token);
    if (payload.type !== 'admin') {
      throw new Error('Invalid token type');
    }
    
    const db = getDb();
    const admin = await db`
      SELECT * FROM admins 
      WHERE admin_id = ${payload.sub} AND is_active = true
    `.then(rows => rows[0] as Admin | undefined);
    
    if (!admin) {
      deleteCookie(c, 'admin_session');
      return c.redirect('/admin/login');
    }
    
    c.set('admin', admin);
    await next();
  } catch (error) {
    deleteCookie(c, 'admin_session');
    return c.redirect('/admin/login');
  }
};

// Admin login page
app.get('/login', async (c) => {
  const error = c.req.query('error');
  
  return c.html(
    Layout({
      title: 'Admin Login',
      children: (
        <div class="max-w-md mx-auto">
          <Card title="Admin Login">
            {error && <Alert type="error">{error}</Alert>}
            <Form action="/admin/login">
              <Input name="handle_name" label="Handle Name" required />
              <Input name="password" type="password" label="Password" required />
              <Button>Login</Button>
            </Form>
          </Card>
        </div>
      )
    })
  );
});

// Admin login handler
app.post('/login', async (c) => {
  try {
    const body = await c.req.parseBody();
    const { handle_name, password } = body;
    
    if (!handle_name || !password) {
      return c.redirect('/admin/login?error=Missing+credentials');
    }
    
    const db = getDb();
    const admin = await db`
      SELECT * FROM admins 
      WHERE handle_name = ${handle_name as string} AND is_active = true
    `.then(rows => rows[0] as Admin | undefined);
    
    if (!admin || !await CryptoService.verifyPassword(password as string, admin.password_hash)) {
      return c.redirect('/admin/login?error=Invalid+credentials');
    }
    
    const token = jwtService.createSessionToken({
      sub: admin.admin_id,
      type: 'admin'
    });
    
    setCookie(c, 'admin_session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'Lax',
      maxAge: 10 * 60 // 10 minutes
    });
    
    return c.redirect('/admin/clients');
  } catch (error) {
    console.error('Admin login error:', error);
    return c.redirect('/admin/login?error=Login+failed');
  }
});

// Admin logout
app.post('/logout', (c) => {
  deleteCookie(c, 'admin_session');
  return c.redirect('/admin/login');
});

// Apply admin auth middleware to protected routes
app.use('/clients/*', requireAdminAuth);
app.use('/clients', requireAdminAuth);

// Client list page
app.get('/clients', async (c: AdminContext) => {
  try {
    const admin = c.get('admin') as Admin;
    const db = getDb();
    
    const clients = await db`
      SELECT 
        oc.*,
        COUNT(DISTINCT ur.redirect_uri_id) as redirect_uri_count,
        COUNT(DISTINCT ocs.scope_id) as scope_count
      FROM oauth_clients oc
      LEFT JOIN oauth_redirect_uris ur ON oc.client_id = ur.client_id
      LEFT JOIN oauth_client_scopes ocs ON oc.client_id = ocs.client_id
      WHERE oc.created_by = ${admin.admin_id}
      GROUP BY oc.client_id
      ORDER BY oc.created_at DESC
    `;
    
    return c.html(
      Layout({
        title: 'OAuth Clients',
        children: (
          <div>
            <div class="flex justify-between items-center mb-6">
              <h1 class="text-2xl font-bold text-gray-900">OAuth Clients</h1>
              <div class="space-x-2">
                <a href="/admin/clients/new" class="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700">
                  New Client
                </a>
                <form action="/admin/logout" method="post" class="inline">
                  <Button variant="secondary">Logout</Button>
                </form>
              </div>
            </div>
            
            {clients.length === 0 ? (
              <Card>
                <p class="text-gray-500 text-center py-8">
                  No OAuth clients found. <a href="/admin/clients/new" class="text-blue-600 hover:underline">Create your first client</a>.
                </p>
              </Card>
            ) : (
              <div class="space-y-4">
                {clients.map((client: any) => (
                  <Card>
                    <div class="flex justify-between items-start">
                      <div>
                        <h3 class="text-lg font-medium text-gray-900">{client.client_name}</h3>
                        <p class="text-sm text-gray-500 mt-1">Client ID: {client.client_id}</p>
                        <p class="text-sm text-gray-600 mt-2">{client.client_description}</p>
                        <div class="mt-2 space-x-4 text-sm text-gray-500">
                          <span>{client.redirect_uri_count} redirect URI(s)</span>
                          <span>{client.scope_count} scope(s)</span>
                          <span>Created: {new Date(client.created_at).toLocaleDateString()}</span>
                        </div>
                      </div>
                      <div class="space-x-2">
                        <a href={`/admin/clients/${client.client_id}/edit`} class="text-blue-600 hover:underline">
                          Edit
                        </a>
                        <a href={`/admin/clients/${client.client_id}/delete`} class="text-red-600 hover:underline">
                          Delete
                        </a>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )
      })
    );
  } catch (error) {
    console.error('Error loading clients:', error);
    return c.html(
      Layout({
        title: 'Error',
        children: <Alert type="error">Error loading clients</Alert>
      })
    );
  }
});

// New client page
app.get('/clients/new', async (c) => {
  try {
    const db = getDb();
    const scopes = await db`SELECT * FROM oauth_scopes ORDER BY scope_name`;
    const error = c.req.query('error');
    
    return c.html(
      Layout({
        title: 'New OAuth Client',
        children: (
          <div class="max-w-2xl mx-auto">
            <div class="mb-6">
              <h1 class="text-2xl font-bold text-gray-900">Create OAuth Client</h1>
              <a href="/admin/clients" class="text-blue-600 hover:underline">← Back to clients</a>
            </div>
            
            <Card>
              {error && <Alert type="error">{error}</Alert>}
              <Form action="/admin/clients/new">
                <Input name="client_name" label="Client Name" required />
                <div>
                  <label for="client_description" class="block text-sm font-medium text-gray-700 mb-1">
                    Client Description
                  </label>
                  <textarea
                    name="client_description"
                    id="client_description"
                    rows={3}
                    class="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  ></textarea>
                </div>
                <Input name="jwks_uri" label="JWKS URI" type="url" required />
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-2">Redirect URIs (one per line)</label>
                  <textarea
                    name="redirect_uris"
                    rows={4}
                    placeholder="https://example.com/callback"
                    required
                    class="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  ></textarea>
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-2">Allowed Scopes</label>
                  <div class="space-y-2">
                    {scopes.map((scope: any) => (
                      <label class="flex items-center">
                        <input
                          type="checkbox"
                          name="scopes"
                          value={scope.scope_id}
                          class="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span class="ml-2 text-sm text-gray-700">{scope.scope_name}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div class="flex space-x-2">
                  <Button>Create Client</Button>
                  <a href="/admin/clients" class="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50">
                    Cancel
                  </a>
                </div>
              </Form>
            </Card>
          </div>
        )
      })
    );
  } catch (error) {
    console.error('Error loading new client page:', error);
    return c.html(
      Layout({
        title: 'Error',
        children: <Alert type="error">Error loading page</Alert>
      })
    );
  }
});

// Create client handler
app.post('/clients/new', async (c: AdminContext) => {
  try {
    const admin = c.get('admin') as Admin;
    const body = await c.req.parseBody();
    const { client_name, client_description, jwks_uri, redirect_uris, scopes } = body;
    
    if (!client_name || !jwks_uri || !redirect_uris) {
      return c.redirect('/admin/clients/new?error=Missing+required+fields');
    }
    
    const db = getDb();
    
    // Validate JWKS URI is unique
    const existingClient = await db`
      SELECT client_id FROM oauth_clients WHERE jwks_uri = ${jwks_uri as string}
    `.then(rows => rows[0]);
    
    if (existingClient) {
      return c.redirect('/admin/clients/new?error=JWKS+URI+already+exists');
    }
    
    await db.begin(async (tx) => {
      // Create client
      const [client] = await tx`
        INSERT INTO oauth_clients (created_by, client_name, client_description, jwks_uri)
        VALUES (${admin.admin_id}, ${client_name as string}, ${client_description as string || null}, ${jwks_uri as string})
        RETURNING client_id
      `;
      
      if (!client) {
        throw new Error('Failed to create client');
      }
      
      // Add redirect URIs
      const uris = (redirect_uris as string).split('\n').map(uri => uri.trim()).filter(Boolean);
      for (const uri of uris) {
        await tx`
          INSERT INTO oauth_redirect_uris (client_id, redirect_uri)
          VALUES (${client.client_id}, ${uri})
        `;
      }
      
      // Add scopes
      const scopeIds = Array.isArray(scopes) ? scopes : scopes ? [scopes] : [];
      for (const scopeId of scopeIds as string[]) {
        await tx`
          INSERT INTO oauth_client_scopes (client_id, scope_id)
          VALUES (${client.client_id}, ${scopeId})
        `;
      }
    });
    
    return c.redirect('/admin/clients');
  } catch (error) {
    console.error('Error creating client:', error);
    return c.redirect('/admin/clients/new?error=Failed+to+create+client');
  }
});

export const adminRoutes = app;