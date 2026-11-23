import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { getUser } from '../../services/dataService';
import type { Units } from './types';

export function useSettingsProfile() {
  const { user, displayName } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [location, setLocation] = useState('');
  const [units, setUnits] = useState<Units>('metric');
  const [notifications, setNotifications] = useState(true);
  const [threshold, setThreshold] = useState(100);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!user) return;
    getUser(user.uid)
      .then(profile => {
        if (profile) {
          const p = profile as {
            name?: string;
            email?: string;
            location?: string;
            preferences?: {
              units?: Units;
              notificationsEnabled?: boolean;
              alertThreshold?: number;
            };
          };
          setName(p.name || displayName || '');
          setEmail(p.email || user.email || '');
          setLocation(p.location || '');
          const prefs = p.preferences;
          if (prefs) {
            setUnits(prefs.units || 'metric');
            setNotifications(prefs.notificationsEnabled !== false);
            setThreshold(prefs.alertThreshold || 100);
          }
        } else {
          setName(displayName || '');
          setEmail(user.email || '');
        }
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [user, displayName]);

  return {
    name,
    setName,
    email,
    location,
    setLocation,
    units,
    setUnits,
    notifications,
    setNotifications,
    threshold,
    setThreshold,
    loaded,
  };
}

export type SettingsProfileController = ReturnType<typeof useSettingsProfile>;
