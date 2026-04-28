import React from 'react';

import { useAuth } from '../../contexts/AuthContext';
import AuthForm from './AuthForm';

interface AuthGateProps {
  children: React.ReactNode;
}

const AuthGate: React.FC<AuthGateProps> = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-slate-50">
        <div className="text-slate-500">Loading account...</div>
      </div>
    );
  }

  if (!user) {
    return <AuthForm />;
  }

  return <>{children}</>;
};

export default AuthGate;
