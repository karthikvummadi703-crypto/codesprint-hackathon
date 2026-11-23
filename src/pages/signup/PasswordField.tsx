import React from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Input, Label } from '../../components/ui/Input';

interface PasswordFieldProps {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  error?: string;
  showPass: boolean;
  onToggle: () => void;
}

export function PasswordField({ value, onChange, error, showPass, onToggle }: PasswordFieldProps) {
  return (
    <div>
      <Label htmlFor="password">Password</Label>
      <div className="relative">
        <Input
          id="password"
          type={showPass ? 'text' : 'password'}
          placeholder="Min. 8 characters"
          value={value}
          onChange={onChange}
          className="h-11 pr-10"
        />
        <button
          type="button"
          aria-label={showPass ? 'Hide password' : 'Show password'}
          aria-pressed={showPass}
          onClick={onToggle}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
        >
          {showPass ? (
            <EyeOff className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Eye className="h-4 w-4" aria-hidden="true" />
          )}
        </button>
      </div>
      {error && (
        <p role="alert" className="text-xs text-red-500 mt-1">
          {error}
        </p>
      )}
    </div>
  );
}
