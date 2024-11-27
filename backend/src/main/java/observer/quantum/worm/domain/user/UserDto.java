package observer.quantum.worm.domain.user;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@AllArgsConstructor
@NoArgsConstructor
@Getter
@Setter
@Schema(name = "User", description = "User information")
public class UserDto {

  @Schema(description = "Username", example = "johnDoe")
  private String username;

  @Schema(description = "User's name", example = "John Doe")
  private String name;

  @Schema(
      description = "URL of the user's avatar image",
      example = "https://example.com/avatar.jpg")
  private String avatarImageUrl;

  public UserDto(User user) {
    username = user.getUsername();
    name = user.getName();
    avatarImageUrl = user.getAvatarImageUrl();
  }
}
