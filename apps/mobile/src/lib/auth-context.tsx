import type { Session } from "@supabase/supabase-js";
import { createContext, useCallback, useContext, useEffect, useState } from "react";

import { supabase } from "./supabase";

interface AuthContextValue {
  session: Session | null;
  isLoading: boolean;
  /** True between redeeming a recovery link and saving the new password.
   *
   * A recovery link mints an ordinary full session, so `session` alone cannot
   * tell this state apart from being signed in normally — and `_layout.tsx`
   * would otherwise swap straight to the `(app)` stack and unmount the reset
   * screen underneath the reader. See `docs/architecture/password-reset.md`
   * §5.
   */
  isRecovering: boolean;
  beginRecovery: () => void;
  endRecovery: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRecovering, setIsRecovering] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setIsLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Set by whoever handled the deep link, never derived from an
  // `onAuthStateChange` event name: with `detectSessionInUrl: false` we redeem
  // the token ourselves, and which event supabase-js emits for that is an
  // implementation detail navigation should not hang on.
  //
  // In-memory only, deliberately. Killing the app mid-reset lands the reader
  // in `(app)` with their old password still working, which is a clean
  // failure -- nothing is half-changed -- so this does not belong in
  // LargeSecureStore.
  const beginRecovery = useCallback(() => setIsRecovering(true), []);
  const endRecovery = useCallback(() => setIsRecovering(false), []);

  return (
    <AuthContext.Provider value={{ session, isLoading, isRecovering, beginRecovery, endRecovery }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
