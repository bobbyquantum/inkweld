import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import {
  Component,
  Input,
  provideZonelessChangeDetection,
  signal,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { User } from '@inkweld/model/user';
import { UnifiedUserService } from '@services/user/unified-user.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { UserMenuComponent } from '../../components/user-menu/user-menu.component';
import { AdminComponent } from './admin.component';

// Mock UserMenuComponent to avoid UserAvatarComponent's HTTP calls
@Component({
  selector: 'app-user-menu',
  template: '',
  standalone: true,
})
class MockUserMenuComponent {
  @Input() miniMode?: boolean;
  @Input() user?: User | null;
}

const CURRENT_USER: User = {
  id: '1',
  username: 'admin',
  name: 'Admin User',
  enabled: true,
};

describe('AdminComponent', () => {
  let component: AdminComponent;
  let userServiceMock: {
    currentUser: ReturnType<typeof signal<User | null>>;
    getMode: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    userServiceMock = {
      currentUser: signal<User | null>(CURRENT_USER),
      getMode: vi.fn().mockReturnValue('online'),
    };

    await TestBed.configureTestingModule({
      imports: [AdminComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideZonelessChangeDetection(),
        provideNoopAnimations(),
        provideRouter([
          { path: '', redirectTo: 'users', pathMatch: 'full' },
          { path: 'users', component: AdminComponent },
          { path: 'settings', component: AdminComponent },
        ]),
        { provide: UnifiedUserService, useValue: userServiceMock },
      ],
    })
      .overrideComponent(AdminComponent, {
        remove: { imports: [UserMenuComponent] },
        add: { imports: [MockUserMenuComponent] },
      })
      .compileComponents();

    const fixture = TestBed.createComponent(AdminComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have current user from service', () => {
    expect(component.currentUser()).toEqual(CURRENT_USER);
  });

  it('should handle null current user', () => {
    userServiceMock.currentUser.set(null);
    expect(component.currentUser()).toBeNull();
  });
});
