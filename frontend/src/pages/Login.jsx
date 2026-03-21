import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async e => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      await login(form.username, form.password);
      navigate('/');
    } catch {
      setError('Invalid username or password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 400 }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{ fontSize: 36, fontWeight: 900, color: 'var(--cyan)', marginBottom: 4 }}>LCA</div>
          <div style={{ color: 'var(--t2)', fontSize: 15 }}>QC & Training Management</div>
        </div>
        <div className="card">
          <h2 style={{ marginBottom: 24, fontWeight: 700 }}>Manager Login</h2>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">Username</label>
              <input
                className="form-input"
                type="text"
                autoComplete="username"
                value={form.username}
                onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">Password</label>
              <input
                className="form-input"
                type="password"
                autoComplete="current-password"
                value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                required
              />
            </div>
            {error && <p style={{ color: 'var(--red)', marginBottom: 16, fontSize: 13 }}>{error}</p>}
            <button className="btn btn-primary w-full" type="submit" disabled={loading} style={{ justifyContent: 'center' }}>
              {loading ? <><span className="spinner" /> Logging in…</> : 'Login'}
            </button>
          </form>
        </div>
        <p style={{ textAlign: 'center', marginTop: 16, color: 'var(--t3)', fontSize: 12 }}>
          LCA Cleaning Services — Hamilton, NZ
        </p>
      </div>
    </div>
  );
}
