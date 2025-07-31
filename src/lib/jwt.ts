import { sign, verify } from 'jsonwebtoken';
import { importPKCS8, importSPKI, SignJWT, jwtVerify, exportJWK } from 'jose';
import type { AccessTokenPayload, IDTokenPayload, SessionJWTPayload } from '@/types';

export class JWTService {
  private privateKey: string;
  private publicKey: string;
  private issuer: string;

  constructor() {
    this.privateKey = process.env.JWT_PRIVATE_KEY!;
    this.publicKey = process.env.JWT_PUBLIC_KEY!;
    this.issuer = process.env.ISSUER_URL!;

    if (!this.privateKey || !this.publicKey || !this.issuer) {
      throw new Error('JWT configuration is missing. Please set JWT_PRIVATE_KEY, JWT_PUBLIC_KEY, and ISSUER_URL environment variables.');
    }
  }

  // Access Token (RS256)
  async createAccessToken(payload: Omit<AccessTokenPayload, 'iss' | 'iat' | 'exp'>): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    const fullPayload = {
      ...payload,
      iss: this.issuer,
      iat: now,
      exp: now + (10 * 60) // 10 minutes
    };

    const privateKey = await importPKCS8(this.privateKey, 'RS256');
    return await new SignJWT(fullPayload)
      .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
      .sign(privateKey);
  }

  // ID Token (RS256)
  async createIDToken(payload: Omit<IDTokenPayload, 'iss' | 'iat' | 'exp'>): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    const fullPayload = {
      ...payload,
      iss: this.issuer,
      iat: now,
      exp: now + (10 * 60) // 10 minutes
    };

    const privateKey = await importPKCS8(this.privateKey, 'RS256');
    return await new SignJWT(fullPayload)
      .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
      .sign(privateKey);
  }

  // Session Token (HS256 for internal use)
  createSessionToken(payload: Omit<SessionJWTPayload, 'iat' | 'exp'>): string {
    const now = Math.floor(Date.now() / 1000);
    const fullPayload: SessionJWTPayload = {
      ...payload,
      iat: now,
      exp: now + (10 * 60) // 10 minutes
    };

    return sign(fullPayload, process.env.SESSION_SECRET!, {
      algorithm: 'HS256'
    });
  }

  // Verify Access Token
  async verifyAccessToken(token: string): Promise<AccessTokenPayload> {
    const publicKey = await importSPKI(this.publicKey, 'RS256');
    const { payload } = await jwtVerify(token, publicKey, {
      issuer: this.issuer
    });
    return payload as unknown as AccessTokenPayload;
  }

  // Verify ID Token
  async verifyIDToken(token: string): Promise<IDTokenPayload> {
    const publicKey = await importSPKI(this.publicKey, 'RS256');
    const { payload } = await jwtVerify(token, publicKey, {
      issuer: this.issuer
    });
    return payload as unknown as IDTokenPayload;
  }

  // Verify Session Token
  verifySessionToken(token: string): SessionJWTPayload {
    return verify(token, process.env.SESSION_SECRET!, {
      algorithms: ['HS256']
    }) as SessionJWTPayload;
  }

  // Get public key for JWKS endpoint
  async getPublicKeyJWK(): Promise<JsonWebKey> {
    const publicKey = await importSPKI(this.publicKey, 'RS256');
    const jwk = await exportJWK(publicKey);
    return {
      ...jwk,
      use: 'sig',
      alg: 'RS256',
      kty: 'RSA'
    };
  }
}

export const jwtService = new JWTService();