const BASE = '/api';

async function req(path, opts = {}) {
  const isJson = !(opts.body instanceof FormData);
  let res;
  try {
    res = await fetch(BASE + path, {
      credentials: 'include',
      headers: isJson ? { 'Content-Type': 'application/json' } : undefined,
      ...opts,
      body: isJson && opts.body ? JSON.stringify(opts.body) : opts.body,
    });
  } catch {
    throw new Error('couldn’t reach the server. check your connection.');
  }
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j.error || `request failed (${res.status})`);
  }
  // some endpoints return non-json (e.g. audio buffer)
  const ct = res.headers.get('content-type') || '';
  return ct.includes('application/json') ? res.json() : res;
}

export const api = {
  // auth (magic link)
  sendMagic: (email) => req('/auth/magic', { method: 'POST', body: { email } }),
  verifyMagic: (token, displayName) => req('/auth/verify', { method: 'POST', body: { token, displayName } }),
  logout: () => req('/auth/logout', { method: 'POST' }),
  me:     () => req('/auth/me'),

  // projects
  listProjects: () => req('/projects'),
  createProject: (seedPrompt) => req('/projects', { method: 'POST', body: { seedPrompt } }),
  getProject: (id) => req(`/projects/${id}`),
  patchProject: (id, body) => req(`/projects/${id}`, { method: 'PATCH', body }),
  deleteProject: (id) => req(`/projects/${id}`, { method: 'DELETE' }),

  // voices catalog
  listVoices: () => req('/voices'),

  // music samples
  generateMusicSamples: (id) => req(`/projects/${id}/music/samples`, { method: 'POST' }),
  selectMusicSample: (id, sampleId) => req(`/projects/${id}/music/select`, { method: 'POST', body: { sampleId } }),

  // wizard
  getWizard:        (id)        => req(`/projects/${id}/wizard`),
  answerWizard:     (id, body)  => req(`/projects/${id}/wizard/answer`, { method: 'POST', body }),
  restartWizard:    (id)        => req(`/projects/${id}/wizard/restart`, { method: 'POST' }),
  finalizeWizard:   (id)        => req(`/projects/${id}/finalize`, { method: 'POST' }),

  // scenes
  patchScene: (id, body) => req(`/scenes/${id}`, { method: 'PATCH', body }),
  regenerate: (id, body) => req(`/scenes/${id}/regenerate`, { method: 'POST', body }),
  rewriteNarration: (id, direction) => req(`/scenes/${id}/narration/rewrite`, { method: 'POST', body: { direction } }),
  rewriteMotion: (id, direction) => req(`/scenes/${id}/motion/rewrite`, { method: 'POST', body: { direction } }),
  convertScene: (id, toKind) => req(`/scenes/${id}/convert`, { method: 'POST', body: { toKind } }),
  deleteScene: (id) => req(`/scenes/${id}`, { method: 'DELETE' }),
  appendScene: (projectId) => req(`/scenes/project/${projectId}/append`, { method: 'POST' }),
  reorderScenes: (projectId, sceneIds) =>
    req(`/scenes/project/${projectId}/reorder`, { method: 'POST', body: { sceneIds } }),

  // shares
  listShares: () => req('/shares'),
  patchShare: (slug, body) => req(`/shares/${slug}`, { method: 'PATCH', body }),
  deleteShare: (slug) => req(`/shares/${slug}`, { method: 'DELETE' }),

  // public share metadata
  getShare: (slug) => req(`/share/${slug}`),

  // render: async queue
  startRender: (projectId) => req(`/projects/${projectId}/render`, { method: 'POST' }),
  getRenderJob: (jobId) => req(`/render-jobs/${jobId}`),
  listRenderJobs: () => req(`/render-jobs`),
};
