import { vi } from 'vitest';

import { HttpHeaders, HttpParameterCodec } from "@angular/common/http";
import { Configuration } from "@inkweld/configuration";
import { User, UsernameAvailability, RegisterRequest } from "@inkweld/index";
import { Observable } from "rxjs";

export const userServiceMock = {
  defaultHeaders: new HttpHeaders(),
  configuration: new Configuration(),
  encoder: {} as HttpParameterCodec,
  getApiV1UsersCheckUsername: vi.fn<(username: string) => Observable<UsernameAvailability>>(),
  getApiV1UsersMe: vi.fn<() => Observable<User>>(),
  getApiV1AuthProviders: vi.fn<() => Observable<string[]>>(),
  postApiV1UsersRegister: vi.fn<(dto: RegisterRequest) => Observable<User>>()
};
