import { create } from 'zustand';
import { api } from '../lib/api.js';

export const useProject = create((set, get) => ({
  project: null,
  scenes: [],
  selectedSceneId: null,
  loading: false,
  error: '',

  async load(id) {
    set({ loading: true, error: '' });
    try {
      const { project, scenes } = await api.getProject(id);
      set({
        project, scenes,
        selectedSceneId: scenes[0]?._id || null,
        loading: false,
      });
    } catch (e) { set({ error: e.message, loading: false }); }
  },

  setSelected(id) { set({ selectedSceneId: id }); },

  async patchScene(id, body) {
    const { scene } = await api.patchScene(id, body);
    set({ scenes: get().scenes.map((s) => (s._id === id ? { ...s, ...scene } : s)) });
  },

  /** Optimistic local update + debounced save handled by caller. */
  setSceneLocal(id, patch) {
    set({ scenes: get().scenes.map((s) => (s._id === id ? { ...s, ...patch } : s)) });
  },

  async regenerate(id, target, direction) {
    const r = await api.regenerate(id, { target, direction });
    set({ scenes: get().scenes.map((s) => (s._id === id ? r.scene : s)) });
    return r;
  },

  async convertScene(id, toKind) {
    const { scene } = await api.convertScene(id, toKind);
    set({ scenes: get().scenes.map((s) => (s._id === id ? scene : s)) });
  },

  async appendScene(projectId) {
    const { scene } = await api.appendScene(projectId);
    set({ scenes: [...get().scenes, scene], selectedSceneId: scene._id });
  },

  async deleteScene(id) {
    await api.deleteScene(id);
    const remaining = get().scenes.filter((s) => s._id !== id);
    set({
      scenes: remaining.map((s, i) => ({ ...s, order: i })),
      selectedSceneId: remaining[0]?._id || null,
    });
  },

  async patchProject(id, body) {
    const { project } = await api.patchProject(id, body);
    set({ project });
  },
}));
