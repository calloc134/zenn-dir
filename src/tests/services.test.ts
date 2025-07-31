import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getDb, closeDb } from '../lib/db';
import { getRedis, closeRedis } from '../lib/redis';
import { CryptoService } from '../lib/crypto';

describe('Core Services', () => {
  beforeAll(async () => {
    // Setup test environment
    process.env.POSTGRES_USER = 'postgres';
    process.env.POSTGRES_PASSWORD = 'postgres';
    process.env.POSTGRES_DB = 'yamaten_test';
    process.env.POSTGRES_HOST = 'localhost';
    process.env.POSTGRES_PORT = '5432';
    process.env.REDIS_URL = 'redis://localhost:6379';
    process.env.JWT_PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC7VJTUt9Us8cKB
wfpktGHuWqApD+qrNggJdqAZLSGOXdVhD7MFwOK+3zqQg+qbFKxeLgAOgU4X6CtS
fOCQlHw8nQSw2iV1SZq7QKdHOJGHzQJ+JmHFdDpOgFYzNT6yQdvZKkNmVHqR1xYY
QkhFrqE0WbIwlXzCd0L8Wz8xVzw1QeNIJy4t1xYG4lCdJYUOBtX2xwZJKoGNuVQH
UqJvRiTKlOOGpnZtMvdP+KnE+Y2L4z9KjVg2QFqNT9gCnVz1BuqyTnGMq0z6h8
ePdVQ/example-private-key`;
    process.env.JWT_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAu1SU1LfVLPHCgcH6ZLRh
7lqgKQ/qqzYICXagGS0hjl3VYQ+zBcDivt86kIPqmxSsXi4ADoFOF+grUnzgkJR8
PJ0EsNoldUmau0CnRziRh80CfiZhxXQ6ToBWMzU+skHb2SpDZlR6kdcWGEJIRa6h
NFmyMJV8wndC/Fs/MVc8NUHjSCcuLdcWBuJQnSWFDgbV9scGSSqBjblUB1Kib0Yk
ypTjhqZ2bTL3T/ipxPmNi+M/So1YNkBajU/YAp1c9QbqskST6/example-public-key`;
    process.env.ISSUER_URL = 'http://localhost:3000';
    process.env.SESSION_SECRET = 'test-session-secret';
  });

  afterAll(async () => {
    await closeDb();
    await closeRedis();
  });

  describe('CryptoService', () => {
    it('should hash and verify passwords', async () => {
      const password = 'testpassword123';
      const hash = await CryptoService.hashPassword(password);
      
      expect(hash).toBeTruthy();
      expect(hash.length).toBeGreaterThan(50);
      
      const isValid = await CryptoService.verifyPassword(password, hash);
      expect(isValid).toBe(true);
      
      const isInvalid = await CryptoService.verifyPassword('wrongpassword', hash);
      expect(isInvalid).toBe(false);
    });

    it('should hash and verify tokens', async () => {
      const token = 'test-token-12345';
      const hash = await CryptoService.hashToken(token);
      
      expect(hash).toBeTruthy();
      expect(hash).toContain(':');
      
      const isValid = await CryptoService.verifyToken(token, hash);
      expect(isValid).toBe(true);
      
      const isInvalid = await CryptoService.verifyToken('wrong-token', hash);
      expect(isInvalid).toBe(false);
    });

    it('should generate and verify PKCE challenge', async () => {
      const verifier = CryptoService.generateCodeVerifier();
      expect(verifier).toBeTruthy();
      expect(verifier.length).toBeGreaterThan(40);
      
      const challenge = await CryptoService.generateCodeChallenge(verifier);
      expect(challenge).toBeTruthy();
      expect(challenge.length).toBeGreaterThan(40);
      
      const isValid = await CryptoService.verifyCodeChallenge(verifier, challenge, 'S256');
      expect(isValid).toBe(true);
      
      const isInvalid = await CryptoService.verifyCodeChallenge('wrong-verifier', challenge, 'S256');
      expect(isInvalid).toBe(false);
    });
  });

  describe('Database Connection', () => {
    it('should connect to database', async () => {
      const db = getDb();
      expect(db).toBeTruthy();
      
      // Test basic query
      const result = await db`SELECT 1 as test`;
      expect(result[0]?.test).toBe(1);
    });
  });

  describe('Redis Connection', () => {
    it('should connect to Redis', async () => {
      const redis = await getRedis();
      expect(redis).toBeTruthy();
      
      // Test basic operations
      await redis.set('test-key', 'test-value');
      const value = await redis.get('test-key');
      expect(value).toBe('test-value');
      
      await redis.del('test-key');
    });
  });
});