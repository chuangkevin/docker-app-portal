import jwt from 'jsonwebtoken';
import crypto from 'crypto';

export interface TokenPayload {
  userId: number;
  username: string;
  role: 'admin' | 'user';
}

export interface AccessTokenResult {
  token: string;
  expiresAt: number;
}

export interface RefreshTokenResult {
  token: string;
  expiresAt: number;
}

export function generateAccessToken(
  payload: TokenPayload,
  secret: string,
): AccessTokenResult {
  const expiresIn = 15 * 60; // 15 minutes in seconds
  const expiresAt = Math.floor(Date.now() / 1000) + expiresIn;
  const token = jwt.sign(
    { userId: payload.userId, username: payload.username, role: payload.role },
    secret,
    { expiresIn: `${expiresIn}s` },
  );
  return { token, expiresAt: expiresAt * 1000 };
}

export function verifyAccessToken(token: string, secret: string): TokenPayload {
  const decoded = jwt.verify(token, secret) as TokenPayload & {
    iat?: number;
    exp?: number;
  };
  return {
    userId: decoded.userId,
    username: decoded.username,
    role: decoded.role,
  };
}

export function generateRefreshToken(): RefreshTokenResult {
  const token = crypto.randomBytes(64).toString('hex');
  const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days in ms
  return { token, expiresAt };
}
