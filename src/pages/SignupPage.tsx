import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Wind, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Input, Label } from '../components/ui/Input';
import { useAuth, firebaseErrorMessage } from '../context/AuthContext';
import { isGoogleSignInAvailable } from '../services/authService';

interface FormState {
  name: string;
  email: string;
  password: string;
  confirm: string;
}

interface FormErrors {
  name?: string;
  email?: string;
  password?: string;
  confirm?: string;
}

function validate(form: FormState): FormErrors {
  const errors: FormErrors = {};
  if (!form.name.trim()) errors.name = 'Name is required';
  if (!form.email.includes('@')) errors.email = 'Enter a valid email';
  if (form.password.length < 8) errors.password = 'Password must be at least 8 characters';
  if (form.password !== form.confirm) errors.confirm = 'Passwords do not match';
  return errors;
}

export default function SignupPage() {
  const [form, setForm] = useState<FormState>({ name: '', email: '', password: '', confirm: '' });
  const [errors, setErrors] = useState<FormErrors>({});
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState('');
  const { signup, loginWithGoogle } = useAuth();
  const googleAvailable = isGoogleSignInAvailable();
  const navigate = useNavigate();

  const set = (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validate(form);
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    setLoading(true);
    setFormError('');
    try {
      await signup(form.name, form.email, form.password);
      navigate('/dashboard');
    } catch (err) {
      setFormError(firebaseErrorMessage(err));
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setLoading(true);
    setFormError('');
    try {
      await loginWithGoogle();
      navigate('/dashboard');
    } catch (err) {
      setFormError(firebaseErrorMessage(err));
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

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8">
          <div className="mb-6 text-center">
            <h1 className="text-2xl font-bold text-slate-900">Create your account</h1>
            <p className="text-slate-500 text-sm mt-1">Start monitoring your environment today</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="name">Full Name</Label>
              <Input id="name" placeholder="Karthik Reddy" value={form.name} onChange={set('name')} className="h-11" />
              {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name}</p>}
            </div>

            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" placeholder="you@example.com" value={form.email} onChange={set('email')} className="h-11" />
              {errors.email && <p className="text-xs text-red-500 mt-1">{errors.email}</p>}
            </div>

            <div>
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPass ? 'text' : 'password'}
                  placeholder="Min. 8 characters"
                  value={form.password}
                  onChange={set('password')}
                  className="h-11 pr-10"
                />
                <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                  {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.password && <p className="text-xs text-red-500 mt-1">{errors.password}</p>}
            </div>

            <div>
              <Label htmlFor="confirm">Confirm Password</Label>
              <Input id="confirm" type="password" placeholder="Re-enter password" value={form.confirm} onChange={set('confirm')} className="h-11" />
              {errors.confirm && <p className="text-xs text-red-500 mt-1">{errors.confirm}</p>}
            </div>

            <Button type="submit" className="w-full h-11 mt-2" loading={loading}>
              Create Account
            </Button>
            {formError && (
              <div className="flex items-start gap-2 rounded-xl bg-red-50 border border-red-200 p-3 text-xs text-red-700">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{formError}</span>
              </div>
            )}
          </form>

          <div className="relative my-5">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-200" /></div>
            <div className="relative flex justify-center text-xs text-slate-400"><span className="bg-white px-3">or</span></div>
          </div>

          <button
            type="button"
            onClick={handleGoogle}
            disabled={loading || !googleAvailable}
            title={googleAvailable ? undefined : 'Google sign-up requires Firebase configuration'}
            className="flex w-full items-center justify-center gap-3 rounded-xl border border-slate-200 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 h-11 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
            Continue with Google
          </button>

          <p className="mt-6 text-center text-sm text-slate-500">
            Already have an account?{' '}
            <Link to="/login" className="font-semibold text-brand-600 hover:text-brand-700">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
