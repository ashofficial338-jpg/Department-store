import jwt from 'jsonwebtoken';
import env from '../config/env.js';

export function generateToken(user) {
  return jwt.sign(
    { id: user._id, role: user.role },
    env.jwtSecret,
    { expiresIn: env.jwtExpiresIn }
  );
}

export default generateToken;
