import mongoose from 'mongoose';

/**
 * v4 schema: adds wizard answers + locked styleSheet + per-edit-phase flow + music sample picker.
 *
 * Field groups:
 *  • Identity:      userId, title, seedPrompt
 *  • Wizard:        wizardAnswers (raw user answers), wizardStep, wizardComplete
 *  • Style:         styleSheet (frozen at wizard finalize; injected into every model call)
 *  • Edit phase:    editPhase (drives which UI panel shows)
 *  • Voice/music:   voiceName, musicSamples[], selectedMusicSampleId
 *  • Render:        captionsEnabled, status, lastRenderAt, totalSeconds
 */

const WizardAnswers = new mongoose.Schema(
  {
    audience: { type: String, default: '' },
    tone: { type: String, default: '' },
    lengthSec: { type: Number, default: 60, min: 30, max: 180 },
    keyPoints: { type: [String], default: [] },
    visualAesthetic: { type: String, default: '' },
    voiceMood: { type: String, default: '' },
    musicVibe: { type: String, default: '' },
  },
  { _id: false }
);

const StyleSheet = new mongoose.Schema(
  {
    palette: { type: String, default: '' },        // e.g. "muted ochre, charcoal shadows, warm gold accent"
    typography: { type: String, default: '' },     // e.g. "geometric sans-serif, Helvetica Neue Bold headers, tight tracking"
    filmRef: { type: String, default: '' },        // e.g. "Kodak Portra 400, 35mm, slight warm shift"
    lighting: { type: String, default: '' },       // e.g. "golden hour, soft diffused, three-point for products"
    texture: { type: String, default: '' },        // e.g. "subtle newsprint grain, halftone overlay"
    musicTempo: { type: String, default: '' },     // e.g. "72 BPM, building"
    musicKey: { type: String, default: '' },       // e.g. "A minor"
    voiceName: { type: String, default: 'Kore', enum: ['Kore', 'Charon', 'Puck', 'Aoede'] },
    pacing: { type: String, default: '' },         // e.g. "deliberate, conversational, no rush"
  },
  { _id: false }
);

const MusicSample = new mongoose.Schema(
  {
    sampleId: { type: String, required: true },           // short id, used in select call
    label: { type: String, default: '' },                 // human-friendly: "Warm acoustic"
    prompt: { type: String, default: '' },                // engineered Lyria prompt — used to expand to full track at render
    filePath: { type: String, default: '' },              // disk path under server/public/music-samples/
    url: { type: String, default: '' },                   // public URL like /music-samples/<file>.mp3
    durationSec: { type: Number, default: 10 },
    createdAt: { type: Date, default: () => new Date() },
  },
  { _id: false }
);

const ProjectSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    seedPrompt: { type: String, required: true, maxlength: 800 },

    // Wizard state
    wizardAnswers: { type: WizardAnswers, default: () => ({}) },
    wizardStep: { type: Number, default: 0 },
    wizardComplete: { type: Boolean, default: false },

    // Locked at wizard finalize
    styleSheet: { type: StyleSheet, default: () => ({}) },

    // Where in the editor flow the user is
    editPhase: {
      type: String,
      enum: ['wizard', 'slides', 'narration', 'broll', 'voice', 'music', 'render'],
      default: 'wizard',
    },

    // Convenience copies (also live in styleSheet but exposed here for queries)
    voiceName: { type: String, default: 'Kore', enum: ['Kore', 'Charon', 'Puck', 'Aoede'] },
    musicPrompt: { type: String, default: '' },         // populated by the planner
    musicSamples: { type: [MusicSample], default: [] },
    selectedMusicSampleId: { type: String, default: '' },

    // Render
    captionsEnabled: { type: Boolean, default: true },
    totalSeconds: { type: Number, default: 60 },
    status: { type: String, enum: ['draft', 'rendering', 'rendered'], default: 'draft' },
    lastRenderAt: { type: Date },
  },
  { timestamps: true }
);

ProjectSchema.index({ userId: 1, updatedAt: -1 });

export default mongoose.model('Project', ProjectSchema);
