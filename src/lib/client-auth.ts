import { jwtVerify, importJWK } from 'jose';
import { getDb } from '@/lib/db';
import type { OAuthClient } from '@/types';

export class ClientAuthService {
  
  // Verify private_key_jwt client authentication
  static async verifyPrivateKeyJWT(
    clientAssertion: string, 
    clientAssertionType: string,
    clientId: string
  ): Promise<OAuthClient | null> {
    
    if (clientAssertionType !== 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer') {
      return null;
    }

    try {
      const db = getDb();
      
      // Get client
      const client = await db`
        SELECT * FROM oauth_clients WHERE client_id = ${clientId}
      `.then(rows => rows[0] as OAuthClient | undefined);

      if (!client) {
        return null;
      }

      // Fetch client's JWKS
      const jwksResponse = await fetch(client.jwks_uri);
      if (!jwksResponse.ok) {
        throw new Error('Failed to fetch JWKS');
      }
      
      const jwks = await jwksResponse.json();
      
      // Try to verify with each key in JWKS
      for (const jwk of jwks.keys) {
        try {
          const publicKey = await importJWK(jwk, 'RS256');
          
          const { payload } = await jwtVerify(clientAssertion, publicKey, {
            issuer: clientId,
            audience: process.env.ISSUER_URL! // aud should be issuer URL, not token endpoint
          });

          // Validate JWT claims
          if (payload.sub !== clientId) {
            continue;
          }

          // Check expiration (exp claim is validated by jwtVerify)
          // Check not before (nbf claim is validated by jwtVerify if present)
          
          return client;
        } catch (keyError) {
          // Try next key
          continue;
        }
      }
      
      return null;
    } catch (error) {
      console.error('Client authentication error:', error);
      return null;
    }
  }

  // Helper to extract client authentication from request
  static extractClientAuthentication(body: any): {
    clientId?: string;
    clientAssertion?: string;
    clientAssertionType?: string;
  } {
    return {
      clientId: body.client_id,
      clientAssertion: body.client_assertion,
      clientAssertionType: body.client_assertion_type
    };
  }
}