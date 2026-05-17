import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import Onboarding from './pages/Onboarding.jsx';
import Dashboard from './pages/Dashboard.jsx';
import AffordThis from './pages/AffordThis.jsx';
import Simulate from './pages/Simulate.jsx';
import Chat from './pages/Chat.jsx';
import Profile from './pages/Profile.jsx';
import SpendingBreakdown from './pages/SpendingBreakdown.jsx';
import Grow from './pages/Grow.jsx';
import Social from './pages/Social.jsx';
import AuthPage from './pages/AuthPage.jsx';
import BottomNav from './components/BottomNav.jsx';
import FloatingChat from './components/FloatingChat.jsx';

export default function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-surface-900 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <Routes>
        <Route path="*" element={<AuthPage />} />
      </Routes>
    );
  }

  return (
    <div className="max-w-md mx-auto relative">
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/onboarding" element={<Onboarding />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/afford" element={<AffordThis />} />
        <Route path="/simulate" element={<Simulate />} />
        <Route path="/chat" element={<Chat />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/spending" element={<SpendingBreakdown />} />
        <Route path="/grow" element={<Grow />} />
        <Route path="/social" element={<Social />} />
        <Route path="/afford" element={<AffordThis />} />
        <Route path="/simulate" element={<Simulate />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>

      {/* Bottom nav and floating chat shown on all main screens */}
      <BottomNav />
      <FloatingChat />
    </div>
  );
}
