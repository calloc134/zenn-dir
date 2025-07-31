import { genSalt, hash, compare } from 'bcrypt-ts';
import { randomBytes } from 'crypto';

export class CryptoService {
  // Password hashing with bcrypt
  static async hashPassword(password: string): Promise<string> {
    const salt = await genSalt(12);
    return await hash(password, salt);
  }

  static async verifyPassword(password: string, hash: string): Promise<boolean> {
    return await compare(password, hash);
  }

  // Token hashing with PBKDF2 (for opaque tokens like authorization codes and refresh tokens)
  static async hashToken(token: string): Promise<string> {
    const salt = randomBytes(16);
    const iterations = 10000;
    const keyLength = 64;
    
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(token),
      { name: 'PBKDF2' },
      false,
      ['deriveBits']
    );
    
    const derivedBits = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: iterations,
        hash: 'SHA-256'
      },
      key,
      keyLength * 8
    );
    
    const saltHex = Array.from(salt).map(b => b.toString(16).padStart(2, '0')).join('');
    const derivedHex = Array.from(new Uint8Array(derivedBits)).map(b => b.toString(16).padStart(2, '0')).join('');
    
    return `${saltHex}:${derivedHex}`;
  }

  static async verifyToken(token: string, hash: string): Promise<boolean> {
    const [saltHex, expectedHex] = hash.split(':');
    if (!saltHex || !expectedHex) {
      return false;
    }
    const salt = new Uint8Array(saltHex.match(/.{2}/g)!.map(byte => parseInt(byte, 16)));
    const iterations = 10000;
    const keyLength = 64;
    
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(token),
      { name: 'PBKDF2' },
      false,
      ['deriveBits']
    );
    
    const derivedBits = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: iterations,
        hash: 'SHA-256'
      },
      key,
      keyLength * 8
    );
    
    const derivedHex = Array.from(new Uint8Array(derivedBits)).map(b => b.toString(16).padStart(2, '0')).join('');
    
    return derivedHex === expectedHex;
  }

  // Generate random tokens
  static generateToken(length: number = 32): string {
    return randomBytes(length).toString('hex');
  }

  // Generate authorization code
  static generateAuthorizationCode(): string {
    return this.generateToken(32);
  }

  // Generate refresh token
  static generateRefreshToken(): string {
    return this.generateToken(64);
  }

  // Generate state parameter
  static generateState(): string {
    return this.generateToken(32);
  }

  // Generate request URI for PAR
  static generateRequestURI(): string {
    return `urn:ietf:params:oauth:request_uri:${this.generateToken(32)}`;
  }

  // Generate PKCE code verifier
  static generateCodeVerifier(): string {
    return randomBytes(32).toString('base64url');
  }

  // Generate PKCE code challenge
  static async generateCodeChallenge(verifier: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return btoa(String.fromCharCode(...new Uint8Array(digest)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }

  // Verify PKCE code challenge
  static async verifyCodeChallenge(verifier: string, challenge: string, method: string): Promise<boolean> {
    if (method !== 'S256') {
      return false;
    }
    
    const calculatedChallenge = await this.generateCodeChallenge(verifier);
    return calculatedChallenge === challenge;
  }
}