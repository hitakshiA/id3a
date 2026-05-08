import { Router } from 'express';
import { voiceCatalog } from '../services/voiceLibrary.js';

const router = Router();

// Public — no auth needed. The catalog is the same for every user.
router.get('/', (req, res) => {
  res.json({ voices: voiceCatalog() });
});

export default router;
