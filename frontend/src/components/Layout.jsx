import React from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const NAV = [
  { to: '/',           icon: '🏠', label: 'Dashboard',   end: true },
  { to: '/team',       icon: '👥', label: 'Team Members' },
  { to: '/training',   icon: '📋', label: 'Training' },
  { to: '/qc',         icon: '✅', label: 'QC Checks' },
  { to: '/scheduling', icon: '📅', label: 'Scheduling' },
  { to: '/kpis',       icon: '📊', label: 'KPIs' },
  { to: '/settings',   icon: '⚙️', label: 'Settings' },
];

export default function Layout() {
  const { manager, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => { logout(); navigate('/login'); };

  return (
    <div className="app-shell">
      <aside className="sidebar">
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
              className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
            >
              <span className="nav-icon">{n.icon}</span>
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
        <Outlet />
      </main>
    </div>
  );
}
