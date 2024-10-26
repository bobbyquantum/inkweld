package observer.quantum.worm.error;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.List;
import lombok.Data;

@Data
@JsonInclude(JsonInclude.Include.NON_NULL)
public class ErrorResponse {
  private final String type;
  private final int status;
  private final String message;
  private List<String> errors;

  public ErrorResponse(String type, int status, String message) {
    this.type = type;
    this.status = status;
    this.message = message;
  }

  public ErrorResponse(int status, String message) {
    this("Error", status, message);
  }

  public ErrorResponse(int status, String message, List<String> errors) {
    this("Error", status, message);
    this.errors = errors;
  }
}
