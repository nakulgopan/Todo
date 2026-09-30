import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of } from 'rxjs';

import { AuthService } from '../../core/services/auth.service';
import { Login } from './login';

describe('Login', () => {
  const auth = jasmine.createSpyObj<AuthService>('AuthService', ['login']);

  beforeEach(async () => {
    auth.login.and.returnValue(of({ id: '1', name: 'Nakul', email: 'nakul@example.com', created_at: '', updated_at: '' }));
    await TestBed.configureTestingModule({
      imports: [Login],
      providers: [provideRouter([]), { provide: AuthService, useValue: auth }],
    }).compileComponents();
  });

  it('signs in through Supabase and opens the app', () => {
    const fixture = TestBed.createComponent(Login);
    const router = TestBed.inject(Router);
    spyOn(router, 'navigate').and.resolveTo(true);
    fixture.detectChanges();
    fixture.componentInstance.form.setValue({ email: 'nakul@example.com', password: 'Password1' });
    fixture.componentInstance.submit();

    expect(auth.login).toHaveBeenCalledWith({ email: 'nakul@example.com', password: 'Password1' });
    expect(router.navigate).toHaveBeenCalledWith(['/']);
  });
});
