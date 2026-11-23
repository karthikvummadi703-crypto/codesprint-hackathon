import React from 'react';
import { Wind } from 'lucide-react';

interface SignupLayoutProps {
  children: React.ReactNode;
}

export function SignupLayout({ children }: SignupLayoutProps) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50 via-white to-emerald-50 flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-8">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-600 shadow-md">
              <Wind className="h-6 w-6 text-white" />
            </div>
            <span className="text-2xl font-bold text-slate-900">AirGuard AI</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8">
          <div className="mb-6 text-center">
            <h1 className="text-2xl font-bold text-slate-900">Create your account</h1>
            <p className="text-slate-500 text-sm mt-1">Start monitoring your environment today</p>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
