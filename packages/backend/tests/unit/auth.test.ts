import { describe, it, expect } from 'vitest';
import bcrypt from 'bcryptjs';

describe('bcrypt hash and verify logic', () => {
  it('should hash a password', async () => {
    const password = 'mySecretPassword123';
    const hash = await bcrypt.hash(password, 10);
    expect(hash).toBeTruthy();
    expect(hash).not.toBe(password);
    // bcrypt hashes start with $2b$ or $2a$
    expect(hash).toMatch(/^\$2[ab]\$/);
  });

  it('should verify correct password against hash', async () => {
    const password = 'correctPassword';
    const hash = await bcrypt.hash(password, 10);
    const result = await bcrypt.compare(password, hash);
    expect(result).toBe(true);
  });

  it('should reject incorrect password', async () => {
    const password = 'correctPassword';
    const hash = await bcrypt.hash(password, 10);
    const result = await bcrypt.compare('wrongPassword', hash);
    expect(result).toBe(false);
  });

  it('should generate different hashes for the same password', async () => {
    const password = 'samePassword';
    const hash1 = await bcrypt.hash(password, 10);
    const hash2 = await bcrypt.hash(password, 10);
    expect(hash1).not.toBe(hash2);
  });

  it('should still verify password against differently salted hash', async () => {
    const password = 'testPassword';
    const hash1 = await bcrypt.hash(password, 10);
    const hash2 = await bcrypt.hash(password, 10);
    expect(await bcrypt.compare(password, hash1)).toBe(true);
    expect(await bcrypt.compare(password, hash2)).toBe(true);
  });

  it('should handle empty password', async () => {
    const password = '';
    const hash = await bcrypt.hash(password, 10);
    const result = await bcrypt.compare(password, hash);
    expect(result).toBe(true);
  });

  it('should reject empty string against non-empty password hash', async () => {
    const password = 'realPassword';
    const hash = await bcrypt.hash(password, 10);
    const result = await bcrypt.compare('', hash);
    expect(result).toBe(false);
  });

  it('should use cost factor correctly', async () => {
    const password = 'testPassword';
    const hash = await bcrypt.hash(password, 10);
    // The cost factor (10) is encoded in the hash
    expect(hash).toContain('$10$');
  });
});
