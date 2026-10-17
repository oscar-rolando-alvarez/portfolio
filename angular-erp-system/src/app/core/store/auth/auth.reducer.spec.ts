import { DEMO_USERS } from '@core/mock/mock-data';
import * as AuthActions from './auth.actions';
import { authReducer, initialState } from './auth.reducer';

describe('authReducer', () => {
  const user = DEMO_USERS[0];

  it('flags loading on login and stores the session on success', () => {
    const loading = authReducer(
      initialState,
      AuthActions.login({ email: user.email, password: 'x' }),
    );
    expect(loading.isLoading).toBe(true);

    const state = authReducer(
      loading,
      AuthActions.loginSuccess({ user, token: 't1', refreshToken: 'r1' }),
    );
    expect(state).toMatchObject({
      user,
      token: 't1',
      refreshToken: 'r1',
      isAuthenticated: true,
      isLoading: false,
    });
  });

  it('keeps the error and clears credentials on failure', () => {
    const state = authReducer(
      initialState,
      AuthActions.loginFailure({ error: 'Invalid email or password' }),
    );
    expect(state.isAuthenticated).toBe(false);
    expect(state.error).toBe('Invalid email or password');
  });

  it('restores and clears a persisted session', () => {
    const restored = authReducer(initialState, AuthActions.sessionRestored({ user, token: 't2' }));
    expect(restored.isAuthenticated).toBe(true);
    expect(restored.token).toBe('t2');

    expect(authReducer(restored, AuthActions.sessionCleared())).toEqual(initialState);
  });
});
