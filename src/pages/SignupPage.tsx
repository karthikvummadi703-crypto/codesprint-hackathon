/**
 * Signup route for creating Firebase accounts and navigating to the app.
 */
import SignupForm from './signup/SignupForm';
import { useSignupForm } from './signup/useSignupForm';

export default function SignupPage() {
  return <SignupForm {...useSignupForm()} />;
}
