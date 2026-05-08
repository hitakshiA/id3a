import { create } from 'zustand';
import { api } from '../lib/api.js';

export const useAuth = create((set) => ({
  user: null,
  loading: true,
  async refresh() {
    try {
      const { user } = await api.me();
      set({ user, loading: false });
    } catch {
      set({ user: null, loading: false });
    }
  },
  async sendMagic(email) {
    return api.sendMagic(email);
  },
  async verifyMagic(token, displayName) {
    const { user, isNew } = await api.verifyMagic(token, displayName);
    set({ user });
    return { user, isNew };
  },
  async logout() {
    await api.logout();
    set({ user: null });
  },
}));
