import { UserDto } from "@worm/index";
import { Observable, of } from "rxjs";

export const userServiceMock = {
  userControllerGetMe: jest.fn<Observable<UserDto>, []>().mockReturnValue(
          of({
            username: 'testuser',
            name: 'Test User',
            avatarImageUrl: 'https://example.com/avatar.png',
          } as UserDto)
        )
}
