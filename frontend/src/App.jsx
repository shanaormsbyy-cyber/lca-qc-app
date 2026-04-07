import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Staff from './pages/Staff';
import StaffProfile from './pages/StaffProfile';
import Properties from './pages/Properties';
import PropertyProfile from './pages/PropertyProfile';
import Training from './pages/Training';
import TrainingSession from './pages/TrainingSession';
import QCChecks from './pages/QCChecks';
import QCCheckForm from './pages/QCCheckForm';
import Checklists from './pages/Checklists';
import KPIs from './pages/KPIs';
import ManagerProfile from './pages/ManagerProfile';
import Settings from './pages/Settings';
import InductionTraining from './pages/InductionTraining';
import HeatPumpTracker from './pages/HeatPumpTracker';
import HeatPumpDetail from './pages/HeatPumpDetail';
import StaffLogins from './pages/StaffLogins';
import StaffPortalLogin from './pages/StaffPortalLogin';
import StaffPortalDashboard from './pages/StaffPortalDashboard';
import StaffPortalCheck from './pages/StaffPortalCheck';

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
        <Route path="staff" element={<Staff />} />
        <Route path="staff/:id" element={<StaffProfile />} />
        {/* legacy redirect */}
        <Route path="team" element={<Navigate to="/staff" replace />} />
        <Route path="team/:id" element={<StaffProfile />} />
        <Route path="properties" element={<Properties />} />
        <Route path="properties/:id" element={<PropertyProfile />} />
        <Route path="training" element={<Training />} />
        <Route path="training/sessions/:id" element={<TrainingSession />} />
        <Route path="training/induction" element={<InductionTraining />} />
        <Route path="qc" element={<QCChecks />} />
        <Route path="qc/checks/:id" element={<QCCheckForm />} />
        <Route path="checklists" element={<Checklists />} />
        <Route path="kpis" element={<KPIs />} />
        <Route path="kpis/:managerId" element={<ManagerProfile />} />
        <Route path="heatpump" element={<HeatPumpTracker />} />
        <Route path="heatpump/:id" element={<HeatPumpDetail />} />
        <Route path="staff-logins" element={<StaffLogins />} />
        <Route path="settings" element={<Settings />} />
      </Route>
      {/* Staff Portal (no manager auth required) */}
      <Route path="/portal/login" element={<StaffPortalLogin />} />
      <Route path="/portal" element={<StaffPortalDashboard />} />
      <Route path="/portal/check/:id" element={<StaffPortalCheck />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
