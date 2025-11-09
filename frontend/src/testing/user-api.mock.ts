import { vi } from 'vitest';

import { HttpHeaders, HttpParameterCodec } from "@angular/common/http";
import { Configuration } from "@inkweld/configuration";
import { User, GetApiV1UsersCheckUsername200Response, PostApiV1UsersRegisterRequest } from "@inkweld/index";
import { Observable } from "rxjs";

export const userServiceMock = {
  defaultHeaders: new HttpHeaders(),
  configuration: new Configuration(),
  encoder: {} as HttpParameterCodec,
  userControllerCheckUsernameAvailability: vi.fn<(username: string) => Observable<GetApiV1UsersCheckUsername200Response>>(),
  userControllerGetMe: vi.fn<() => Observable<User>>(),
  userControllerGetOAuthProviders: vi.fn<() => Observable<string[]>>(),
  userControllerRegister: vi.fn<(dto: PostApiV1UsersRegisterRequest) => Observable<User>>()
};



