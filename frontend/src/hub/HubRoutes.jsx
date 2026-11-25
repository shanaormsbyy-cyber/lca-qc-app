import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import HubLayout from './components/HubLayout';
import Overview from './pages/Overview';
import Trainees from './pages/Trainees';
import TraineeProfile from './pages/TraineeProfile';
import Plans from './pages/Plans';
import PlanBuilder from './pages/PlanBuilder';
import PlanDetail from './pages/PlanDetail';
import Foundations from './pages/Foundations';
import Competencies from './pages/Competencies';
import ManageSkills from './pages/ManageSkills';
import CompetencyDetail from './pages/CompetencyDetail';
import Onboarding from './pages/Onboarding';
import OnboardingDetail from './pages/OnboardingDetail';
import ShadowPeriod from './pages/ShadowPeriod';
import Systems from './pages/Systems';
import SystemDetail from './pages/SystemDetail';
import Resources from './pages/Resources';
import Caddy from './pages/Caddy';
import './hub.css';

// Mounted at /training-hub/* in the QC app's router.
export default function HubRoutes() {
  return (
    <Routes>
      <Route element={<HubLayout />}>
        <Route index element={<Navigate to="/training-hub/overview" replace />} />
        <Route path="overview" element={<Overview />} />
        <Route path="trainees" element={<Trainees />} />
        <Route path="trainees/:staffId" element={<TraineeProfile />} />
        <Route path="plans" element={<Plans />} />
        <Route path="plans/new" element={<PlanBuilder />} />
        <Route path="plans/:id" element={<PlanDetail />} />
        <Route path="plans/:id/edit" element={<PlanBuilder />} />
        <Route path="foundations" element={<Foundations />} />
        <Route path="competencies" element={<Competencies />} />
        <Route path="competencies/skills" element={<ManageSkills />} />
        <Route path="competency/:id" element={<CompetencyDetail />} />
        <Route path="onboarding" element={<Onboarding />} />
        <Route path="onboarding/:id" element={<OnboardingDetail />} />
        <Route path="shadow" element={<ShadowPeriod />} />
        <Route path="systems" element={<Systems />} />
        <Route path="systems/:id" element={<SystemDetail />} />
        <Route path="resources" element={<Resources />} />
        <Route path="caddy" element={<Caddy />} />
        <Route path="*" element={<Navigate to="/training-hub/overview" replace />} />
      </Route>
    </Routes>
  );
}
