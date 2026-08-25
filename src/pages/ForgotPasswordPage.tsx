import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Wind, ArrowLeft, CheckCircle, AlertCircle } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Input, Label } from '../components/ui/Input';
import { Card } from '../components/ui/Card';
import { useAuth, firebaseErrorMessage } from '../context/AuthContext';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { resetPassword } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setLoading(true);
    setError('');
    try {
      await resetPassword(email);
      setSubmitted(true);
      setLoading(false);
    } catch (err) {
      setError(firebaseErrorMessage(err));
      setLoading(false);
    }
  };

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

        <Card className="p-8">
          {!submitted ? (
            <>
              <div className="mb-6 text-center">
                <h1 className="text-2xl font-bold text-slate-900">Reset your password</h1>
                <p className="text-slate-500 text-sm mt-1">
                  We'll send you an email with password reset instructions.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="email">Email Address</Label>
                  <Input
                    id="email"
                    type="email"
                    required
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="h-11"
                  />
                </div>

                <Button type="submit" className="w-full h-11" loading={loading}>
                  Reset Password
                </Button>
                {error && (
                  <div className="flex items-start gap-2 rounded-xl bg-red-50 border border-red-200 p-3 text-xs text-red-700">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}
              </form>
            </>
          ) : (
            <div className="text-center py-4">
              <div className="flex justify-center mb-4">
                <div className="h-12 w-12 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600">
                  <CheckCircle className="h-6 w-6" />
                </div>
              </div>
              <h2 className="text-xl font-bold text-slate-900 mb-2">Check your email</h2>
              <p className="text-slate-500 text-sm mb-6 leading-relaxed">
                We have sent reset instructions to <span className="font-semibold text-slate-800">{email}</span>. Please check your inbox.
              </p>
            </div>
          )}

          <div className="mt-6 text-center border-t border-slate-100 pt-5">
            <Link to="/login" className="inline-flex items-center gap-2 text-sm font-semibold text-brand-600 hover:text-brand-700">
              <ArrowLeft className="h-4 w-4" /> Back to Sign In
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
