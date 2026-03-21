import React, { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const NAV = [
  { to: '/',           label: 'Dashboard',  end: true },
  { to: '/staff',      label: 'Staff' },
  { to: '/properties', label: 'Properties' },
  { to: '/training',   label: 'Training' },
  { to: '/kpis',       label: 'KPIs' },
  { to: '/settings',   label: 'Settings' },
];

export default function Layout() {
  const { manager, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const handleLogout = () => { logout(); navigate('/login'); };
  const close = () => setOpen(false);

  return (
    <div className="app-shell">
      {open && (
        <div
          onClick={close}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', zIndex: 99 }}
        />
      )}

      <aside className={`sidebar${open ? ' sidebar-open' : ''}`}>
        <div className="sidebar-logo">
          <div className="brand">LCA</div>
          <div className="sub">Cleaning Services</div>
        </div>
        <nav className="sidebar-nav">
          {NAV.map(n => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              onClick={close}
              className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
            >
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="manager-chip">
            Logged in as<strong>{manager?.name}</strong>
          </div>
          <button className="btn-logout" onClick={handleLogout}>Logout</button>
        </div>
      </aside>

      <main className="main-area">
        <div className="mobile-topbar">
          <button className="hamburger" onClick={() => setOpen(o => !o)} aria-label="Menu">
            <span /><span /><span />
          </button>
          <div style={{ fontWeight: 800, fontSize: 18, color: 'var(--cyan)' }}>LCA</div>
          <div style={{ width: 40 }} />
        </div>
        <Outlet />
      </main>
    </div>
  );
}
