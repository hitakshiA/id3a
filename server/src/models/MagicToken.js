import mongoose from 'mongoose';

/**
 * One-time magic-link token. Issued when a user enters their email; consumed
 * when they click the email link. Mongo TTL index removes expired tokens.
 */
const MagicTokenSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    token: { type: String, required: true, unique: true, index: true },
    expiresAt: { type: Date, required: true },
    consumed: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// TTL: documents auto-delete 1 minute after expiresAt (Mongo runs the
// expiry sweep every ~60s; tokens still valid for full lifetime).
MagicTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 60 });

export default mongoose.model('MagicToken', MagicTokenSchema);
