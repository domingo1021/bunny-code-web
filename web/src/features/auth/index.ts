/**
 * Public surface of the auth feature.
 *
 * Other features import from here, never from the folders inside — the ESLint
 * boundary rule enforces it. That keeps the internals free to move without a
 * cascade of import edits across the app.
 */
export { AuthForm } from "./components/auth-form";
export {
  isAuthFailure,
  useRestoreSession,
  useSession,
  useSignIn,
  useSignOut,
  useSignUp,
  type Session,
} from "./hooks/use-session";
export { currentToken, useAuthStore } from "./model/auth-store";
