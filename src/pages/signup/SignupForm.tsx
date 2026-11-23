import React from 'react';
import { AlertCircle } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { PasswordField } from './PasswordField';
import { TextField } from './TextField';
import type { SignupFormController } from './useSignupForm';

export function SignupForm({ controller }: { controller: SignupFormController }) {
  const { form, errors, showPass, loading, formError, set, setShowPass, handleSubmit } = controller;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <TextField
        id="name"
        label="Full Name"
        placeholder="Karthik Reddy"
        value={form.name}
        onChange={set('name')}
        error={errors.name}
      />
      <TextField
        id="email"
        label="Email"
        type="email"
        placeholder="you@example.com"
        value={form.email}
        onChange={set('email')}
        error={errors.email}
      />
      <PasswordField
        value={form.password}
        onChange={set('password')}
        error={errors.password}
        showPass={showPass}
        onToggle={() => setShowPass(!showPass)}
      />
      <TextField
        id="confirm"
        label="Confirm Password"
        type="password"
        placeholder="Re-enter password"
        value={form.confirm}
        onChange={set('confirm')}
        error={errors.confirm}
      />
      <Button type="submit" className="w-full h-11 mt-2" loading={loading}>
        Create Account
      </Button>
      {formError && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl bg-red-50 border border-red-200 p-3 text-xs text-red-700"
        >
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{formError}</span>
        </div>
      )}
    </form>
  );
}
