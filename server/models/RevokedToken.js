import mongoose from 'mongoose';

// Sessions ended by Logout. Each login token carries a unique id (jti); once it is listed here the
// token is refused even though it has not expired. MongoDB deletes each row when the token would
// have expired anyway (TTL index), so the collection stays small.
const revokedTokenSchema = new mongoose.Schema(
  {
    jti: { type: String, required: true, unique: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

revokedTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const RevokedToken = mongoose.model('RevokedToken', revokedTokenSchema);
export default RevokedToken;
