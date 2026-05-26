const BASE = '/api';

async function request(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    credentials: 'include',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) {
    // /auth/me is the bootstrap probe — let the caller branch on it.
    if (path !== '/auth/me') {
      window.location.hash = '#/login';
      window.location.reload();
    }
    throw new Error('Unauthorized');
  }
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export const api = {
  get:  (path)       => request('GET',    path),
  post: (path, body) => request('POST',   path, body),
  put:  (path, body) => request('PUT',    path, body),
  del:  (path, body) => request('DELETE', path, body),
};
