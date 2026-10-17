import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';

import { AuthStore } from '@core/auth.store';
import { SignInComponent, safeReturnUrl } from './sign-in.component';

describe('safeReturnUrl', () => {
  it('accepts app-relative paths only', () => {
    expect(safeReturnUrl('/courses/x')).toBe('/courses/x');
    expect(safeReturnUrl('//evil.example')).toBe('/my-learning');
    expect(safeReturnUrl('https://evil.example')).toBe('/my-learning');
    expect(safeReturnUrl(undefined)).toBe('/my-learning');
  });
});

describe('SignInComponent', () => {
  beforeEach(() => localStorage.clear());

  it('signs the learner in and navigates to the return URL', async () => {
    TestBed.configureTestingModule({
      imports: [SignInComponent],
      providers: [provideRouter([])],
    });
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const fixture = TestBed.createComponent(SignInComponent);
    fixture.componentRef.setInput('returnUrl', '/courses/c-1');
    await fixture.whenStable();

    const el = fixture.nativeElement as HTMLElement;
    const [name, email] = [...el.querySelectorAll<HTMLInputElement>('input')];
    name.value = '  Grace Hopper ';
    name.dispatchEvent(new Event('input'));
    email.value = 'Grace@Example.com';
    email.dispatchEvent(new Event('input'));
    el.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();

    expect(TestBed.inject(AuthStore).learner()).toEqual({
      name: 'Grace Hopper',
      email: 'grace@example.com',
    });
    expect(navigate).toHaveBeenCalledWith('/courses/c-1');
  });
});
