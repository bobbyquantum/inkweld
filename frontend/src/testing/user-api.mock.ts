import { vi } from 'vitest';

import { HttpHeaders, HttpParameterCodec } from "@angular/common/http";
import { Configuration } from "@inkweld/configuration";
import { User, GetApiV1UsersCheckUsername200Response, PostApiV1UsersRegisterRequest } from "@inkweld/index";
import { Observable } from "rxjs";

export const userServiceMock = {
  defaultHeaders: new HttpHeaders(),
  configuration: new Configuration(),
  encoder: {} as HttpParameterCodec,
  getApiV1UsersCheckUsername: vi.fn<(username: string) => Observable<GetApiV1UsersCheckUsername200Response>>(),
  getApiV1UsersMe: vi.fn<() => Observable<User>>(),
  getApiV1AuthProviders: vi.fn<() => Observable<string[]>>(),
  postApiV1UsersRegister: vi.fn<(dto: PostApiV1UsersRegisterRequest) => Observable<User>>()
};
