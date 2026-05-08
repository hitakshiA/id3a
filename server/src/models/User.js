import mongoose from 'mongoose';

const UserSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    displayName: { type: String, trim: true, maxlength: 50 },
    lastLoginAt: { type: Date },
  },
  { timestamps: true }
);

UserSchema.methods.toPublic = function () {
  return { id: String(this._id), email: this.email, displayName: this.displayName || this.email.split('@')[0] };
};

export default mongoose.model('User', UserSchema);
