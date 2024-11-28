package observer.quantum.worm.domain.content;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class FileContentPatchDto {
  @Schema(description = "New name for the file")
  private String name;

  @Schema(description = "New summary for the file")
  private String summary;
}
