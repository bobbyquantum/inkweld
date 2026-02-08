import { vi } from 'vitest';

import { HttpHeaders, HttpParameterCodec } from "@angular/common/http";
import { Configuration } from "@inkweld/configuration";
import { UpdateProfileRequest, User, UsernameAvailability, RegisterRequest } from "@inkweld/index";
import { Observable } from "rxjs";

export const userServiceMock = {
  defaultHeaders: new HttpHeaders(),
  configuration: new Configuration(),
  encoder: {} as HttpParameterCodec,
  checkUsernameAvailability: vi.fn<(username: string) => Observable<UsernameAvailability>>(),
  getCurrentUser: vi.fn<() => Observable<User>>(),
  listOAuthProviders: vi.fn<() => Observable<string[]>>(),
  registerUser: vi.fn<(dto: RegisterRequest) => Observable<User>>(),
  updateProfile: vi.fn<(dto: UpdateProfileRequest) => Observable<User>>()
};
