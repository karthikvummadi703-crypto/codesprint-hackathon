/** Signup form state, validation, and auth handlers. */
import { useState } from 'react';
import type React from 'react';
import { useNavigate } from 'react-router-dom';

import { firebaseErrorMessage, useAuth } from '../../context/AuthContext';
import { isGoogleSignInAvailable } from '../../services/authService';

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

export function useSignupForm() {
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
      const completed = await loginWithGoogle();
      if (completed) navigate('/dashboard');
    } catch (err) {
      setFormError(firebaseErrorMessage(err));
      setLoading(false);
    }
  };

  return {
    form,
    errors,
    showPass,
    setShowPass,
    loading,
    formError,
    googleAvailable,
    set,
    handleSubmit,
    handleGoogle,
  };
}
