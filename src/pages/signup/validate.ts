import type { FormErrors, FormState } from './types';

export function validate(form: FormState): FormErrors {
  const errors: FormErrors = {};
  if (!form.name.trim()) errors.name = 'Name is required';
  if (!form.email.includes('@')) errors.email = 'Enter a valid email';
  if (form.password.length < 8) errors.password = 'Password must be at least 8 characters';
  if (form.password !== form.confirm) errors.confirm = 'Passwords do not match';
  return errors;
}
