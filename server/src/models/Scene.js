import mongoose from 'mongoose';

const ImageSubdoc = new mongoose.Schema(
  { mime: { type: String, default: '' }, base64: { type: String, default: '' } },
  { _id: false }
);

/**
 * v4 schema: every scene now carries both the user's casual *direction* AND
 * the engineered prompt the rewriter actually sent the model. We persist both
 * so users can audit what the agent did and so regen-with-context works
 * without re-asking Gemini on every keystroke.
 */
const SceneSchema = new mongoose.Schema(
  {
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    order: { type: Number, required: true },
    durationSec: { type: Number, default: 6, min: 4, max: 15 },
    narration: { type: String, default: '' },
    visualKind: { type: String, enum: ['slide', 'video'], default: 'slide' },

    // Author intent (what the planner / user said in plain language)
    visualPrompt: { type: String, default: '' },
    visualDirection: { type: String, default: '' },        
    userDirection: { type: String, default: '' },           // most-recent casual nudge applied to this scene

    // Engineered prompts (what the rewriter actually sent to the model)
    engineeredVisualPrompt: { type: String, default: '' },
    engineeredFirstFramePrompt: { type: String, default: '' },
    engineeredLastFramePrompt: { type: String, default: '' },
    engineeredVideoMotionPrompt: { type: String, default: '' },

    slideImage: { type: ImageSubdoc, default: () => ({}) },

    firstFramePrompt: { type: String, default: '' },
    firstFrameImage: { type: ImageSubdoc, default: () => ({}) },
    lastFramePrompt: { type: String, default: '' },
    lastFrameImage: { type: ImageSubdoc, default: () => ({}) },
    videoMotionPrompt: { type: String, default: '' },

    status: { type: String, enum: ['planning', 'drafted', 'rendered'], default: 'planning' },
  },
  { timestamps: true }
);

SceneSchema.index({ projectId: 1, order: 1 });

export default mongoose.model('Scene', SceneSchema);
