import React, { useEffect, useRef, useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { GraduationCap, Search, Home, Users, CalendarDays, Award, UserPlus, UsersRound, Layers, BookOpen, Lightbulb } from 'lucide-react';
import api from '../api';

// Hub pages live under /training-hub inside the QC app; QC's Layout provides the sidebar.
const TABS = [
  ['/training-hub/overview', 'Overview', Home],
  ['/training-hub/trainees', 'Trainees', Users],
  ['/training-hub/plans', 'Training Plans', CalendarDays],
  ['/training-hub/foundations', 'Foundations', Lightbulb],
  ['/training-hub/competencies', 'Competencies', Award],
  ['/training-hub/onboarding', 'Onboarding', UserPlus],
  ['/training-hub/shadow', 'Shadow Period', UsersRound],
  ['/training-hub/systems', 'Training Systems', Layers],
  ['/training-hub/resources', 'Resources', BookOpen],
];

function SearchBox() {
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const boxRef = useRef(null);

  useEffect(() => {
    if (q.trim().length < 2) { setResults([]); return undefined; }
    const t = setTimeout(() => {
      api.get('/search', { params: { q } }).then(r => { setResults(r.data); setOpen(true); }).catch(() => {});
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const close = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const go = (r) => { setOpen(false); setQ(''); navigate(r.link); };
  const LABEL = { trainee: 'Trainee', plan: 'Plan', skill: 'Skill', system: 'System' };

  return (
    <div className="hub-search" ref={boxRef}>
      <Search size={16} />
      <input value={q} onChange={e => setQ(e.target.value)} onFocus={() => results.length && setOpen(true)}
        placeholder="Search trainees, training plans, competencies..." />
      {open && q.trim().length >= 2 && (
        <div className="search-drop">
          {results.length === 0 ? <div className="search-empty">No matches</div> : results.map(r => (
            <button key={`${r.type}-${r.id}`} className="search-item" onClick={() => go(r)}>
              <span>{r.label}</span><span className="search-type">{LABEL[r.type]}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function HubLayout() {
  return (
    <div className="page hub-page hub-root">
      <header className="hub-header">
        <div className="hub-header-title">
          <div className="hub-header-icon"><GraduationCap size={26} /></div>
          <div>
            <div className="hub-h">Training Hub</div>
            <div className="hub-sub">Onboarding, training and competency development for new and existing cleaners.</div>
          </div>
        </div>
        <SearchBox />
      </header>
      <nav className="hub-tabs">
        {TABS.map(([to, label, IconCmp]) => (
          <NavLink key={to} to={to} className={({ isActive }) => `hub-tab${isActive ? ' active' : ''}`}>
            <IconCmp size={16} /> {label}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </div>
  );
}
