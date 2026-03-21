import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [manager, setManager] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('lca_token');
    if (token) {
      api.get('/auth/me')
        .then(r => setManager(r.data))
        .catch(() => localStorage.removeItem('lca_token'))
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (username, password) => {
    const r = await api.post('/auth/login', { username, password });
    localStorage.setItem('lca_token', r.data.token);
    setManager(r.data.manager);
    return r.data.manager;
  };

  const logout = () => {
    localStorage.removeItem('lca_token');
    setManager(null);
  };

  return (
    <AuthContext.Provider value={{ manager, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() { return useContext(AuthContext); }
