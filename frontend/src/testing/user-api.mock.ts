import { HttpHeaders, HttpParameterCodec } from "@angular/common/http";
import { Configuration } from "@inkweld/configuration";
import { UserDto, UserControllerCheckUsernameAvailability200Response, UserRegisterDto } from "@inkweld/index";
import { Observable } from "rxjs";



export const userServiceMock = {
  defaultHeaders: new HttpHeaders(),
  configuration: new Configuration(),
  encoder: {} as HttpParameterCodec,
  userControllerCheckUsernameAvailability: jest.fn<Observable<UserControllerCheckUsernameAvailability200Response>, [string]>(),
  userControllerGetMe: jest.fn<Observable<UserDto>, []>(),
  userControllerGetOAuthProviders: jest.fn<Observable<string[]>, []>(),
  userControllerRegister: jest.fn<Observable<UserDto>, [UserRegisterDto]>()
};
