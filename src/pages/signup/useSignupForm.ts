import React, { useState } from 'react';
import { isGoogleSignInAvailable } from '../../services/authService';
import type { FormState } from './types';
import { useSignupSubmission } from './useSignupSubmission';

export interface SignupFormController {
  form: FormState;
  errors: ReturnType<typeof useSignupSubmission>['errors'];
  showPass: boolean;
  loading: boolean;
  formError: string;
  googleAvailable: boolean;
  set: (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) => void;
  setShowPass: React.Dispatch<React.SetStateAction<boolean>>;
  handleSubmit: (e: React.FormEvent) => Promise<void>;
  handleGoogle: () => Promise<void>;
}

export function useSignupForm(): SignupFormController {
  const [form, setForm] = useState<FormState>({ name: '', email: '', password: '', confirm: '' });
  const [showPass, setShowPass] = useState(false);
  const { errors, loading, formError, handleSubmit, handleGoogle } = useSignupSubmission(form);
  const googleAvailable = isGoogleSignInAvailable();

  const set = (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(prev => ({ ...prev, [key]: e.target.value }));

  return {
    form,
    errors,
    showPass,
    loading,
    formError,
    googleAvailable,
    set,
    setShowPass,
    handleSubmit,
    handleGoogle,
  };
}
