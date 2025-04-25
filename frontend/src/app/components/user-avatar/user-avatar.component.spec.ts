import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { createComponentFactory, Spectator } from '@ngneat/spectator/jest';

import { UserAvatarComponent } from './user-avatar.component';

describe('UserAvatarComponent', () => {
  let spectator: Spectator<UserAvatarComponent>;

  const createComponent = createComponentFactory({
    component: UserAvatarComponent,
    imports: [],
    providers: [provideHttpClient(), provideHttpClientTesting()],
  });

  beforeEach(() => {
    spectator = createComponent();
  });

  it('should create', () => {
    expect(spectator.component).toBeTruthy();
  });
});
