import { useState } from 'react';
import { SEED_ACCOUNTS } from '../../shared/constants.ts';
import { api, ApiError } from '../api.ts';
import type { User } from '../../shared/types.ts';
import { Avatar } from './Avatar.tsx';

export function LoginScreen({ onSignedIn }: { onSignedIn: (user: User) => void }) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function signIn(withEmail: string) {
    setBusy(true);
    setError(null);
    try {
      const { user } = await api.login(withEmail);
      onSignedIn(user);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not sign in. Please try again.');
      setBusy(false);
    }
  }

  return (
    <div className="app-canvas flex min-h-full items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-accent text-base font-bold text-white">
            A
          </span>
          <div>
            <h1 className="text-title-3 font-semibold tracking-tight text-label-primary">Ajaia Docs</h1>
            <p className="text-subhead text-label-secondary">Collaborative documents, kept small.</p>
          </div>
        </div>

        <div className="glass rounded-panel p-5">
          <h2 className="text-headline font-semibold text-label-primary">Sign in</h2>
          <p className="mt-1 text-subhead text-label-secondary">
            This demo uses seeded accounts instead of passwords. Pick one to continue.
          </p>

          <ul className="surface-grouped mt-4 divide-y divide-separator">
            {SEED_ACCOUNTS.map((account) => (
              <li key={account.email}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => signIn(account.email)}
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition hover:bg-fill-tertiary disabled:opacity-60"
                >
                  <Avatar name={account.name} color={account.color} size={32} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-medium text-label-primary">
                      {account.name}
                    </span>
                    <span className="block truncate text-caption text-label-secondary">{account.email}</span>
                  </span>
                  <span className="shrink-0 text-[15px] font-medium text-accent">Sign in</span>
                </button>
              </li>
            ))}
          </ul>

          <div className="my-4 flex items-center gap-3 text-caption text-label-secondary">
            <span className="h-px flex-1 bg-separator" />
            or use an email
            <span className="h-px flex-1 bg-separator" />
          </div>

          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (email.trim()) signIn(email.trim());
            }}
          >
            <label htmlFor="login-email" className="sr-only">
              Email address
            </label>
            <input
              id="login-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              className="min-w-0 flex-1 rounded-control bg-fill-tertiary px-3 py-2 text-[15px] text-label-primary outline-none placeholder:text-label-tertiary focus:bg-bg-primary focus:ring-2 focus:ring-accent/30"
            />
            <button
              type="submit"
              disabled={busy}
              className="rounded-control bg-accent px-3.5 py-2 text-[15px] font-medium text-white transition hover:bg-accent-pressed disabled:opacity-60"
            >
              Go
            </button>
          </form>

          {error ? (
            <p role="alert" className="mt-3 rounded-control bg-destructive/10 px-3 py-2 text-subhead text-destructive">
              {error}
            </p>
          ) : null}
        </div>

        <p className="mt-4 text-center text-caption text-label-secondary">
          Sessions are mocked on purpose — see the README for the security model.
        </p>
      </div>
    </div>
  );
}
