import type {
  DocumentDetail,
  DocumentSummary,
  PublicUser,
  ShareEntry,
  ShareRole,
  User,
} from '../shared/types.ts';

export class ApiError extends Error {
  status: number;
  code: string;

  constructor(message: string, code: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    credentials: 'same-origin',
    ...init,
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers ?? {}),
    },
  });

  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  if (!res.ok) {
    const err = (data as { error?: { message?: string; code?: string } } | null)?.error;
    throw new ApiError(err?.message ?? `Request failed (${res.status})`, err?.code ?? 'error', res.status);
  }

  return data as T;
}

export const api = {
  me: () => request<{ user: User }>('/api/auth/me'),
  login: (email: string) => request<{ user: User }>('/api/auth/login', { method: 'POST', body: JSON.stringify({ email }) }),
  logout: () => request<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),
  listUsers: () => request<{ users: PublicUser[] }>('/api/users'),

  listDocuments: () =>
    request<{ owned: DocumentSummary[]; shared: DocumentSummary[] }>('/api/documents'),
  createDocument: (payload: { title?: string; content?: string }) =>
    request<{ document: DocumentDetail }>('/api/documents', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  getDocument: (id: string) => request<{ document: DocumentDetail }>(`/api/documents/${id}`),
  patchDocument: (id: string, patch: { title?: string; content?: string; plainText?: string }) =>
    request<{ document: DocumentDetail }>(`/api/documents/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  deleteDocument: (id: string) => request<{ ok: boolean }>(`/api/documents/${id}`, { method: 'DELETE' }),

  listShares: (id: string) =>
    request<{ owner: PublicUser; shares: ShareEntry[] }>(`/api/documents/${id}/shares`),
  addShare: (id: string, payload: { email: string; role: ShareRole }) =>
    request<{ shares: ShareEntry[] }>(`/api/documents/${id}/shares`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  removeShare: (id: string, userId: number) =>
    request<{ shares: ShareEntry[] }>(`/api/documents/${id}/shares/${userId}`, { method: 'DELETE' }),
};
