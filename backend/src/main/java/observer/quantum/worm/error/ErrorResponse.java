package observer.quantum.worm.error;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Schema(description = "Standard error response")
public class ErrorResponse {

    @Schema(description = "Error message", example = "A description would be here")
    private String error;

    @Schema(description = "HTTP status code", example = "404")
    private int status;

    @Schema(description = "Error code for client-side error handling", example = "SOME_CLIENT_CODE")
    private String code;
}
