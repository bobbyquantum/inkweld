package observer.quantum.worm.content;

import io.swagger.v3.oas.annotations.media.Schema;
import java.util.List;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class PageFileResponse {

  @Schema(description = "List of files in the current page")
  private List<FileDto> content;

  @Schema(description = "Pagination information")
  private PageInfo page;

  @Getter
  @Setter
  public static class PageInfo {
    @Schema(description = "Number of elements in the current page")
    private int size;

    @Schema(description = "Current page number")
    private int number;

    @Schema(description = "Total number of elements across all pages")
    private long totalElements;

    @Schema(description = "Total number of pages")
    private int totalPages;
  }
}
