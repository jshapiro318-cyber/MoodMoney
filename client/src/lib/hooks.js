import { useState, useEffect, useCallback } from 'react';
import { api } from './api.js';

// Fetches and caches the user's profile
export function useProfile() {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getProfile()
      .then(setProfile)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const refresh = useCallback(() => {
    api.getProfile().then(setProfile).catch(console.error);
  }, []);

  return { profile, loading, refresh };
}

// Fetches gamification status with auto-refresh
export function useGamification() {
  const [status, setStatus] = useState(null);

  useEffect(() => {
    api.getGamificationStatus().then(setStatus).catch(console.error);
  }, []);

  const awardXP = useCallback(async (action) => {
    const result = await api.awardXP(action);
    setStatus(prev => prev ? { ...prev, xp: result.totalXP } : prev);
    return result;
  }, []);

  return { status, awardXP };
}
