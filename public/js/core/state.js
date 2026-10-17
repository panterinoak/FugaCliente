/** Estado de sesión y catálogos compartidos entre vistas. */
const TOKEN_KEY = 'fc_token';

const storage = {
  get(key) {
    try { return sessionStorage.getItem(key); } catch { return null; }
  },
  set(key, value) {
    try { sessionStorage.setItem(key, value); } catch { /* sesión solo en memoria */ }
  },
  remove(key) {
    try { sessionStorage.removeItem(key); } catch { /* nada que limpiar */ }
  }
};

export const session = {
  token: storage.get(TOKEN_KEY),
  user: null,
  mode: '',
  setToken(token) {
    this.token = token;
    if (token) storage.set(TOKEN_KEY, token);
    else storage.remove(TOKEN_KEY);
  },
  clear() {
    this.setToken(null);
    this.user = null;
  }
};

export const store = {
  catalogs: { roles: [], segments: [], services: [], categories: [] },
  users: []
};

export const can = {
  privileged: () => ['admin', 'analista'].includes(session.user?.role),
  admin: () => session.user?.role === 'admin',
  editClients: () => ['admin', 'analista'].includes(session.user?.role)
};
