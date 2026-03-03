import React, { useState } from 'react';
import axios from 'axios';
import { getApiUrl } from '../config/api';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

interface LoginProps {
  onLogin: (token: string, username: string, role?: string) => void;
}

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isRegistering) {
        await axios.post(getApiUrl('/auth/register'), {
          username,
          password,
        });
        // Auto login after register
        const res = await axios.post(
          getApiUrl('/auth/token'),
          new URLSearchParams({
            username: username,
            password: password,
            grant_type: 'password',
          }),
          { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
        );
        onLogin(
          res.data.access_token,
          res.data.username || username,
          res.data.role,
        );
      } else {
        const res = await axios.post(
          getApiUrl('/auth/token'),
          new URLSearchParams({
            username: username,
            password: password,
            grant_type: 'password',
          }),
          { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
        );
        onLogin(
          res.data.access_token,
          res.data.username || username,
          res.data.role,
        );
      }
    } catch (err: unknown) {
      const apiErr = err as { response?: { data?: { detail?: string; message?: string } } };
      if (apiErr.response) {
        setError(
          apiErr.response.data?.message ||
            apiErr.response.data?.detail ||
            'Authentication failed',
        );
      } else {
        setError('Network error. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGuestLogin = async () => {
    setLoading(true);
    try {
      const res = await axios.post(getApiUrl('/auth/guest'));
      onLogin(
        res.data.access_token,
        res.data.username || 'Guest',
        res.data.role,
      );
    } catch {
      setError('Guest Login Failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="@container absolute top-0 left-0 z-50 flex h-full w-full flex-col items-center justify-center bg-(--bg-primary)">
      <div className="absolute inset-0 bg-(--bg-primary)/80 backdrop-blur-sm"></div>

      {/* Login Card - Responsive with Container Queries */}
      <Card className="relative w-[90%] border-(--accent-primary)/30 bg-(--bg-secondary)/90 p-6 shadow-xl backdrop-blur-md @sm:w-100 @sm:p-8">
        {/* Header */}
        <div className="mb-8 text-center">
          <h1 className="font-heading mb-1 text-2xl font-bold tracking-widest text-(--text-primary) @sm:text-3xl">
            MEDIQUERY<span className="text-(--accent-primary)">.AI</span>
          </h1>
          <div className="my-2 h-px w-full bg-linear-to-r from-transparent via-(--accent-primary)/50 to-transparent"></div>
          <h2 className="font-mono text-xs tracking-[0.3em] text-(--accent-primary) @sm:text-sm">
            {isRegistering ? 'INITIALIZE IDENTITY' : 'IDENTITY VERIFICATION'}
          </h2>
        </div>

        {error && (
          <div className="border-destructive/50 bg-destructive/20 text-destructive-foreground mb-6 border p-2 text-center font-mono text-xs">
            [ ALERT: {error} ]
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div className="group space-y-2">
            <Label className="font-mono text-[10px] tracking-wider text-(--accent-primary)/60 transition-colors group-focus-within:text-(--accent-primary)">
              USER_ID
            </Label>
            <Input
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="border-(--border-subtle) bg-(--bg-input) font-mono text-(--text-primary) focus-visible:border-(--accent-primary) focus-visible:ring-(--accent-primary)/20"
              placeholder="ENTER USERNAME"
              required
            />
          </div>
          <div className="group space-y-2">
            <Label className="font-mono text-[10px] tracking-wider text-(--accent-primary)/60 transition-colors group-focus-within:text-(--accent-primary)">
              ACCESS_CODE
            </Label>
            <Input
              type="password"
              autoComplete={isRegistering ? 'new-password' : 'current-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="border-(--border-subtle) bg-(--bg-input) font-mono text-(--text-primary) focus-visible:border-(--accent-primary) focus-visible:ring-(--accent-primary)/20"
              placeholder="ENTER PASSWORD"
              required
            />
          </div>

          <Button
            type="submit"
            disabled={loading}
            className="font-heading mt-6 w-full bg-(--accent-primary) py-6 text-base font-bold tracking-widest text-white uppercase hover:bg-(--accent-hover) hover:shadow-lg @sm:text-lg"
          >
            {loading
              ? 'PROCESSING...'
              : isRegistering
                ? 'ESTABLISH LINK'
                : 'AUTHENTICATE'}
          </Button>
        </form>

        <div className="mt-8 flex w-full flex-col items-center gap-4">
          <button
            onClick={() => setIsRegistering(!isRegistering)}
            className="cursor-pointer border-b border-(--accent-primary)/30 pb-1 font-mono text-sm tracking-wider text-(--accent-primary) transition-colors hover:text-(--accent-hover)"
          >
            {isRegistering ? '<< RETURN TO LOGIN' : '>> CREATE NEW IDENTITY'}
          </button>

          <div className="my-2 flex w-full items-center gap-4">
            <Separator className="flex-1 bg-(--border-subtle)" />
            <div className="font-mono text-[10px] text-(--text-tertiary)">
              OR
            </div>
            <Separator className="flex-1 bg-(--border-subtle)" />
          </div>

          <Button
            type="button"
            variant="outline"
            onClick={handleGuestLogin}
            disabled={loading}
            className="font-heading w-full border-(--accent-primary) bg-transparent py-6 text-sm tracking-widest text-(--accent-primary) hover:bg-(--accent-primary)/10 hover:shadow-md"
          >
            INITIATE GUEST PROTOCOL
          </Button>
        </div>

        {/* Footer / SSO Placeholders */}
        <div className="mt-6 text-center">
          <div className="mb-2 font-mono text-[10px] tracking-widest text-(--text-tertiary)">
            - SECURE WAIT_TIME -
          </div>
          <div className="flex justify-center gap-3 opacity-50">
            <span className="rounded border border-(--border-subtle) px-2 py-1 text-[10px] text-(--text-tertiary)">
              ENTRA
            </span>
            <span className="rounded border border-(--border-subtle) px-2 py-1 text-[10px] text-(--text-tertiary)">
              AWS
            </span>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default Login;
