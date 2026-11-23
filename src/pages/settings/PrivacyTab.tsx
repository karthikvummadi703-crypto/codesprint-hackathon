import { CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { useAuth } from '../../context/AuthContext';

export function PrivacyTab() {
  const { user } = useAuth();

  return (
    <div className="space-y-6">
      <CardHeader className="px-0 pt-0 pb-5">
        <CardTitle>Privacy Settings</CardTitle>
      </CardHeader>
      <CardContent className="px-0 py-0 space-y-4">
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-800">Data & Access</h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            Your data (air quality history, chats, uploaded documents, carbon trips) is stored under
            your account only.{' '}
            {user?.isDev
              ? 'You are currently in dev mode, so data is stored locally in this browser.'
              : 'Data is stored in your private Firestore collections.'}
          </p>
        </div>
      </CardContent>
    </div>
  );
}
