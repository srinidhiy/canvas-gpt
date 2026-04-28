import React, { useState } from 'react';

import { pb } from '../../lib/pocketbaseClient';

const AuthForm: React.FC = () => {
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!email || !password) {
      setError('Email and password are required.');
      return;
    }

    if (mode === 'signUp' && password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setIsSubmitting(true);

    try {
      if (mode === 'signIn') {
        await pb.collection('users').authWithPassword(email, password);
      } else {
        await pb.collection('users').create({ email, password, passwordConfirm: confirmPassword });
        await pb.collection('users').authWithPassword(email, password);
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unexpected authentication error.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleMode = () => {
    setMode((prev) => (prev === 'signIn' ? 'signUp' : 'signIn'));
    setError(null);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center px-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-8 border border-slate-200">
        <h1 className="text-2xl font-semibold text-slate-900 mb-2">Canvas GPT</h1>
        <p className="text-slate-500 mb-6">
          {mode === 'signIn' ? 'Sign in to access your conversations.' : 'Create an account to get started.'}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={8}
            />
          </div>

          {mode === 'signUp' ? (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1" htmlFor="confirmPassword">
                Confirm Password
              </label>
              <input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                required
                minLength={8}
              />
            </div>
          ) : null}

          {error ? <p className="text-sm text-rose-600">{error}</p> : null}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white rounded-lg py-2 font-medium transition"
          >
            {isSubmitting ? 'Processing…' : mode === 'signIn' ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        <div className="mt-6 text-center text-sm text-slate-600">
          {mode === 'signIn' ? "Don't have an account?" : 'Already have an account?'}{' '}
          <button type="button" onClick={toggleMode} className="text-indigo-600 font-medium hover:underline">
            {mode === 'signIn' ? 'Sign up' : 'Sign in'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AuthForm;
