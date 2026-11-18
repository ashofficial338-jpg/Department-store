import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import env from '../config/env.js';

// Every login gets its own session id (jti) so Logout can revoke exactly this session.
export function generateToken(user) {
  return jwt.sign(
    { id: user._id, role: user.role },
    env.jwtSecret,
    { expiresIn: env.jwtExpiresIn, jwtid: crypto.randomUUID() }
  );
}

export default generateToken;
