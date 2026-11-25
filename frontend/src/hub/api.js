import axios from 'axios';

// Training Hub API inside the QC app: same manager login token as the rest of QC.
export const TOKEN_KEY = 'lca_token';

const api = axios.create({ baseURL: '/api/hub' });

api.interceptors.request.use(config => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  r => r,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem(TOKEN_KEY);
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export function errMsg(e, fallback = 'Something went wrong') {
  return e?.response?.data?.error || e?.message || fallback;
}

export default api;
