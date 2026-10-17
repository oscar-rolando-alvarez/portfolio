import { TestBed } from '@angular/core/testing';
import { MockStore, provideMockStore } from '@ngrx/store/testing';

import * as AuthActions from '@core/store/auth/auth.actions';
import { selectAuthError, selectAuthLoading } from '@core/store/auth/auth.selectors';
import { LoginComponent } from './login.component';

describe('LoginComponent', () => {
  async function setup() {
    TestBed.configureTestingModule({
      imports: [LoginComponent],
      providers: [
        provideMockStore({
          selectors: [
            { selector: selectAuthLoading, value: false },
            { selector: selectAuthError, value: null },
          ],
        }),
      ],
    });
    const fixture = TestBed.createComponent(LoginComponent);
    const store = TestBed.inject(MockStore);
    const dispatch = vi.spyOn(store, 'dispatch');
    await fixture.whenStable();
    return { fixture, dispatch, el: fixture.nativeElement as HTMLElement };
  }

  function type(el: HTMLElement, selector: string, value: string): void {
    const input = el.querySelector<HTMLInputElement>(selector)!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
  }

  it('does not dispatch when the form is invalid', async () => {
    const { el, dispatch } = await setup();
    el.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('dispatches login with the entered credentials', async () => {
    const { el, dispatch } = await setup();
    type(el, 'input[type="email"]', 'admin@erp.local');
    type(el, 'input[formcontrolname="password"]', 'secret-value');
    el.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();

    expect(dispatch).toHaveBeenCalledWith(
      AuthActions.login({ email: 'admin@erp.local', password: 'secret-value', rememberMe: false }),
    );
  });
});
