import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation as useRouterLocation } from 'react-router-dom';
import AppLayout from './components/layout/AppLayout';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LocationProvider, useLocation } from './context/LocationContext';
import LocationPicker from './components/LocationPicker';
// Signed-out visitors land on Login, so the auth pages stay in the entry chunk.
import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';

// The authenticated pages are split out. Each one pulls in charts, maps and
// Firebase queries, and loading them all up front put 1.3 MB in front of first
// paint; now they arrive on navigation instead.
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const AIAssistantPage = lazy(() => import('./pages/AIAssistantPage'));
const PredictionsPage = lazy(() => import('./pages/PredictionsPage'));
const CarbonFootprintPage = lazy(() => import('./pages/CarbonFootprintPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const WeatherReportPage = lazy(() => import('./pages/WeatherReportPage'));

function PageSpinner({ label }: { label: string }) {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <svg className="animate-spin h-8 w-8 text-brand-600" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <span className="text-sm text-slate-500">{label}</span>
      </div>
    </div>
  );
}

/** Keeps the sidebar and header on screen while a split page chunk arrives. */
function LazyPage({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<PageSpinner label="Loading…" />}>{children}</Suspense>;
}

function RequireLocation({ children }: { children: React.ReactNode }) {
  const { location } = useLocation();
  if (!location) return <LocationPicker />;
  return <>{children}</>;
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, initializing } = useAuth();
  const location = useRouterLocation();

  if (initializing) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <svg className="animate-spin h-8 w-8 text-brand-600" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span className="text-sm text-slate-500">Loading AirGuard AI…</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <>{children}</>;
}

function PublicOnlyRoute({ children }: { children: React.ReactNode }) {
  const { user, initializing } = useAuth();
  if (initializing) return null;
  if (user) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<PublicOnlyRoute><LoginPage /></PublicOnlyRoute>} />
      <Route path="/signup" element={<PublicOnlyRoute><SignupPage /></PublicOnlyRoute>} />
      <Route path="/forgot-password" element={<PublicOnlyRoute><ForgotPasswordPage /></PublicOnlyRoute>} />

      {/* Authenticated Routes */}
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <RequireLocation>
              <AppLayout />
            </RequireLocation>
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<LazyPage><DashboardPage /></LazyPage>} />
        <Route path="ai" element={<LazyPage><AIAssistantPage /></LazyPage>} />
        <Route path="predictions" element={<LazyPage><PredictionsPage /></LazyPage>} />
        <Route path="weather" element={<LazyPage><WeatherReportPage /></LazyPage>} />
        <Route path="carbon" element={<LazyPage><CarbonFootprintPage /></LazyPage>} />
        <Route path="settings" element={<LazyPage><SettingsPage /></LazyPage>} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Route>
    </Routes>
  );
}

function App() {
  return (
    <AuthProvider>
      <LocationProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </LocationProvider>
    </AuthProvider>
  );
}

export default App;
