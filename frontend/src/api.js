import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

api.interceptors.request.use(config => {
  // Staff portal login/me/my-* endpoints use the staff token; everything else uses manager token
  const url = config.url || '';
  const isStaffSession = url === '/staff-portal/login' || url === '/staff-portal/me'
    || url.startsWith('/staff-portal/my-');
  const token = isStaffSession
    ? localStorage.getItem('staff_token')
    : localStorage.getItem('lca_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  r => r,
  err => {
    const url = err.config?.url || '';
    // Don't redirect staff portal login failures to the manager login
    if (err.response?.status === 401 && url !== '/staff-portal/login') {
      localStorage.removeItem('lca_token');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export default api;
