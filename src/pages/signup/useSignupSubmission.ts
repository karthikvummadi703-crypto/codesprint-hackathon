import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { firebaseErrorMessage, useAuth } from '../../context/AuthContext';
import type { FormErrors, FormState } from './types';
import { validate } from './validate';

export interface SignupSubmissionState {
  errors: FormErrors;
  loading: boolean;
  formError: string;
  handleSubmit: (e: React.FormEvent) => Promise<void>;
  handleGoogle: () => Promise<void>;
}

export function useSignupSubmission(form: FormState): SignupSubmissionState {
  const [errors, setErrors] = useState<FormErrors>({});
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState('');
  const { signup, loginWithGoogle } = useAuth();
  const navigate = useNavigate();

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

  return { errors, loading, formError, handleSubmit, handleGoogle };
}
