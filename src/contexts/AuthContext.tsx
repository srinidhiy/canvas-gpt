import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { AuthModel } from 'pocketbase';

import { pb } from '../lib/pocketbaseClient';

interface AuthContextValue {
  user: AuthModel | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthModel | null>(pb.authStore.isValid ? pb.authStore.model : null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setUser(pb.authStore.isValid ? pb.authStore.model : null);
    setLoading(false);

    const unsubscribe = pb.authStore.onChange((_token, model) => {
      setUser(model);
    });

    return () => unsubscribe();
  }, []);

  const value = useMemo(() => ({ user, loading }), [user, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
