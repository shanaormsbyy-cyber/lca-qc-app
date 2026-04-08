import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

api.interceptors.request.use(config => {
  // Staff portal endpoints use their own token
  const isStaffPortal = config.url?.startsWith('/staff-portal');
  const token = isStaffPortal
    ? localStorage.getItem('staff_token')
    : localStorage.getItem('lca_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  r => r,
  err => {
    const url = err.config?.url || '';
    // Don't redirect staff portal requests to the manager login
    if (err.response?.status === 401 && !url.startsWith('/staff-portal')) {
      localStorage.removeItem('lca_token');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export default api;
