import mongoose from 'mongoose';

const ShareSchema = new mongoose.Schema(
  {
    slug: { type: String, required: true, unique: true, index: true },
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project' },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true },

    // Snapshot of project context at render time — used by the public viewer
    // sidebar so the page reads as a self-contained artifact even if the
    // underlying project changes or is deleted.
    seedPrompt: { type: String, default: '' },        // "what this is about"
    sceneCount: { type: Number, default: 0 },
    voiceName: { type: String, default: '' },

    durationSec: { type: Number, default: 0 },
    fileSizeBytes: { type: Number, default: 0 },
    filePath: { type: String, required: true },
    posterPath: { type: String, required: true },
    viewCount: { type: Number, default: 0 },
    lastViewedAt: { type: Date },
  },
  { timestamps: true }
);

ShareSchema.index({ userId: 1, createdAt: -1 });

export default mongoose.model('Share', ShareSchema);
