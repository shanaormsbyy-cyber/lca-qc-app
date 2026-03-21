import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import TeamMembers from './pages/TeamMembers';
import StaffProfile from './pages/StaffProfile';
import Training from './pages/Training';
import TrainingSession from './pages/TrainingSession';
import QCChecks from './pages/QCChecks';
import QCCheckForm from './pages/QCCheckForm';
import Scheduling from './pages/Scheduling';
import KPIs from './pages/KPIs';
import ManagerProfile from './pages/ManagerProfile';
import Settings from './pages/Settings';

function RequireAuth({ children }) {
  const { manager, loading } = useAuth();
  if (loading) return <div className="loading"><div className="spinner" /><span>Loading…</span></div>;
  return manager ? children : <Navigate to="/login" replace />;
}

export default function App() {
  const { loading } = useAuth();
  if (loading) return <div className="loading"><div className="spinner" /><span>Loading…</span></div>;

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<RequireAuth><Layout /></RequireAuth>}>
        <Route index element={<Dashboard />} />
        <Route path="team" element={<TeamMembers />} />
        <Route path="team/:id" element={<StaffProfile />} />
        <Route path="training" element={<Training />} />
        <Route path="training/sessions/:id" element={<TrainingSession />} />
        <Route path="qc" element={<QCChecks />} />
        <Route path="qc/checks/:id" element={<QCCheckForm />} />
        <Route path="scheduling" element={<Scheduling />} />
        <Route path="kpis" element={<KPIs />} />
        <Route path="kpis/:managerId" element={<ManagerProfile />} />
        <Route path="settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
