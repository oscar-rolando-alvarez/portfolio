import { computed } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';

import { storage } from './storage';

export interface Learner {
  name: string;
  email: string;
}

interface AuthState {
  learner: Learner | null;
}

export const AUTH_STORAGE_KEY = 'lms.learner';

/**
 * Demo authentication. The public build has no identity provider, so a learner
 * "signs in" with a display name and email that stay in this browser only.
 * Swap `signIn` for an OIDC flow when a backend is introduced.
 */
export const AuthStore = signalStore(
  { providedIn: 'root' },
  withState<AuthState>(() => ({ learner: storage.read<Learner>(AUTH_STORAGE_KEY) })),
  withComputed(({ learner }) => ({
    isSignedIn: computed(() => learner() !== null),
    initials: computed(() =>
      (learner()?.name ?? '')
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]!.toUpperCase())
        .join(''),
    ),
  })),
  withMethods((store) => ({
    signIn(learner: Learner): void {
      const normalized = { name: learner.name.trim(), email: learner.email.trim().toLowerCase() };
      storage.write(AUTH_STORAGE_KEY, normalized);
      patchState(store, { learner: normalized });
    },
    signOut(): void {
      storage.remove(AUTH_STORAGE_KEY);
      patchState(store, { learner: null });
    },
  })),
);
