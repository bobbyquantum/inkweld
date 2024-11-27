package observer.quantum.worm.domain.user;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class UpdatePasswordRequest {

  @NotBlank(message = "Old password is required")
  private String oldPassword;

  @NotBlank(message = "New password is required")
  @Size(min = 8, message = "New password must be at least 8 characters long")
  private String newPassword;
}
