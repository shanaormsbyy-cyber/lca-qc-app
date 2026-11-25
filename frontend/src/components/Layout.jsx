import React, { useState, useEffect } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api';
import ChatAssistant from './ChatAssistant';

const NAV = [
  { to: '/',             label: 'Dashboard',   end: true },
  { to: '/staff',        label: 'Staff' },
  { to: '/complaints',  label: 'Complaints' },
  { to: '/properties',  label: 'Properties' },
  { to: '/qc',           label: 'QC Checks' },
  { to: '/checklists',   label: 'Checklists' },
  { to: '/training-hub', label: 'Training Hub' },
  { to: '/heatpump',     label: 'Heat Pumps' },
  { to: '/kpis',         label: 'KPIs' },
  { to: '/settings',     label: 'Settings' },
];

export default function Layout() {
  const { manager, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  // Location filter: remembered on this device; pages reload (remount) when it changes.
  const [loc, setLoc] = useState(() => { try { return localStorage.getItem('location_filter') || ''; } catch { return ''; } });
  const [locations, setLocations] = useState([]);
  useEffect(() => { api.get('/staff/locations').then(r => setLocations(r.data)).catch(() => {}); }, []);
  const changeLoc = v => {
    try { v ? localStorage.setItem('location_filter', v) : localStorage.removeItem('location_filter'); } catch { /* ignore */ }
    setLoc(v);
  };

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
          <div className="brand brand-name">Team Operations</div>
          <select
            className="location-filter"
            value={loc}
            onChange={e => changeLoc(e.target.value)}
            aria-label="Location"
          >
            <option value="">All locations</option>
            {locations.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
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
          <div style={{ fontWeight: 800, fontSize: 18, color: 'var(--cyan)' }}>Team Operations</div>
          <div style={{ width: 40 }} />
        </div>
        <Outlet key={loc || 'all'} />
      </main>
      <ChatAssistant />
    </div>
  );
}
