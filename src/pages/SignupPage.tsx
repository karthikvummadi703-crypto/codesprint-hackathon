import { Link } from 'react-router-dom';
import { GoogleSignInButton } from './signup/GoogleSignInButton';
import { SignupForm } from './signup/SignupForm';
import { SignupLayout } from './signup/SignupLayout';
import { useSignupForm } from './signup/useSignupForm';

export default function SignupPage() {
  const controller = useSignupForm();

  return (
    <SignupLayout>
      <SignupForm controller={controller} />
      <div className="relative my-5">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-slate-200" />
        </div>
        <div className="relative flex justify-center text-xs text-slate-400">
          <span className="bg-white px-3">or</span>
        </div>
      </div>
      <GoogleSignInButton
        loading={controller.loading}
        googleAvailable={controller.googleAvailable}
        onClick={controller.handleGoogle}
      />
      <p className="mt-6 text-center text-sm text-slate-500">
        Already have an account?{' '}
        <Link to="/login" className="font-semibold text-brand-600 hover:text-brand-700">
          Sign in
        </Link>
      </p>
    </SignupLayout>
  );
}
