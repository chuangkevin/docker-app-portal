import { describe, it, expect } from 'vitest';
import jwt from 'jsonwebtoken';
import {
  generateAccessToken,
  verifyAccessToken,
  generateRefreshToken,
  type TokenPayload,
} from '../../src/services/token';

const TEST_SECRET = 'test-jwt-secret-for-unit-tests';

const testPayload: TokenPayload = {
  userId: 1,
  username: 'testuser',
  role: 'user',
};

describe('generateAccessToken', () => {
  it('should generate a valid JWT token', () => {
    const { token } = generateAccessToken(testPayload, TEST_SECRET);
    expect(token).toBeTruthy();
    expect(typeof token).toBe('string');
    // JWT has 3 parts
    expect(token.split('.')).toHaveLength(3);
  });

  it('should contain correct payload', () => {
    const { token } = generateAccessToken(testPayload, TEST_SECRET);
    const decoded = jwt.decode(token) as any;
    expect(decoded.userId).toBe(testPayload.userId);
    expect(decoded.username).toBe(testPayload.username);
    expect(decoded.role).toBe(testPayload.role);
  });

  it('should expire in approximately 15 minutes', () => {
    const { token } = generateAccessToken(testPayload, TEST_SECRET);
    const decoded = jwt.decode(token) as any;
    const now = Math.floor(Date.now() / 1000);
    const expectedExpiry = now + 15 * 60;
    // Allow 5 second tolerance
    expect(decoded.exp).toBeGreaterThanOrEqual(expectedExpiry - 5);
    expect(decoded.exp).toBeLessThanOrEqual(expectedExpiry + 5);
  });

  it('should return expiresAt in milliseconds', () => {
    const before = Date.now();
    const { expiresAt } = generateAccessToken(testPayload, TEST_SECRET);
    const after = Date.now();
    const expectedExpiry = before + 15 * 60 * 1000;
    expect(expiresAt).toBeGreaterThanOrEqual(expectedExpiry - 5000);
    expect(expiresAt).toBeLessThanOrEqual(expectedExpiry + 5000);
  });

  it('should generate different tokens for different payloads', () => {
    const adminPayload: TokenPayload = { userId: 2, username: 'admin', role: 'admin' };
    const { token: token1 } = generateAccessToken(testPayload, TEST_SECRET);
    const { token: token2 } = generateAccessToken(adminPayload, TEST_SECRET);
    expect(token1).not.toBe(token2);
  });
});

describe('verifyAccessToken', () => {
  it('should verify and return payload from a valid token', () => {
    const { token } = generateAccessToken(testPayload, TEST_SECRET);
    const payload = verifyAccessToken(token, TEST_SECRET);
    expect(payload.userId).toBe(testPayload.userId);
    expect(payload.username).toBe(testPayload.username);
    expect(payload.role).toBe(testPayload.role);
  });

  it('should throw on invalid token', () => {
    expect(() => verifyAccessToken('invalid.token.here', TEST_SECRET)).toThrow();
  });

  it('should throw on wrong secret', () => {
    const { token } = generateAccessToken(testPayload, TEST_SECRET);
    expect(() => verifyAccessToken(token, 'wrong-secret')).toThrow();
  });

  it('should throw on expired token', async () => {
    // Generate a token that expires in 1 second
    const token = jwt.sign(
      { userId: 1, username: 'test', role: 'user' },
      TEST_SECRET,
      { expiresIn: '1ms' },
    );
    // Wait a bit to ensure expiry
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(() => verifyAccessToken(token, TEST_SECRET)).toThrow();
  });

  it('should throw on tampered token', () => {
    const { token } = generateAccessToken(testPayload, TEST_SECRET);
    const parts = token.split('.');
    // Tamper with the payload
    const tamperedPayload = Buffer.from(
      JSON.stringify({ userId: 999, username: 'hacker', role: 'admin' }),
    ).toString('base64url');
    const tamperedToken = `${parts[0]}.${tamperedPayload}.${parts[2]}`;
    expect(() => verifyAccessToken(tamperedToken, TEST_SECRET)).toThrow();
  });
});

describe('generateRefreshToken', () => {
  it('should generate a token string', () => {
    const { token } = generateRefreshToken();
    expect(token).toBeTruthy();
    expect(typeof token).toBe('string');
    // 64 bytes = 128 hex chars
    expect(token.length).toBe(128);
  });

  it('should generate unique tokens', () => {
    const { token: token1 } = generateRefreshToken();
    const { token: token2 } = generateRefreshToken();
    expect(token1).not.toBe(token2);
  });

  it('should set expiry to approximately 7 days from now', () => {
    const before = Date.now();
    const { expiresAt } = generateRefreshToken();
    const after = Date.now();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    expect(expiresAt).toBeGreaterThanOrEqual(before + sevenDaysMs - 1000);
    expect(expiresAt).toBeLessThanOrEqual(after + sevenDaysMs + 1000);
  });
});
