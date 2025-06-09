import { HttpHeaders, HttpParameterCodec } from "@angular/common/http";
import { Configuration } from "@inkweld/configuration";
import { UserDto, UserControllerCheckUsernameAvailability200Response, UserRegisterDto } from "@inkweld/index";
import { Observable } from "rxjs";



export const userServiceMock = {
  defaultHeaders: new HttpHeaders(),
  configuration: new Configuration(),
  encoder: {} as HttpParameterCodec,
  userControllerCheckUsernameAvailability: vi.fn<Observable<UserControllerCheckUsernameAvailability200Response>, [string]>(),
  userControllerGetMe: vi.fn<Observable<UserDto>, []>(),
  userControllerGetOAuthProviders: vi.fn<Observable<string[]>, []>(),
  userControllerRegister: vi.fn<Observable<UserDto>, [UserRegisterDto]>()
};
