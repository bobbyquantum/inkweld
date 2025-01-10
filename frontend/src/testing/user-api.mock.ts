import { UserDto } from "@worm/index";
import { Observable } from "rxjs";

export const userServiceMock = {
  userControllerGetMe: jest.fn<Observable<UserDto>, []>(),
}
