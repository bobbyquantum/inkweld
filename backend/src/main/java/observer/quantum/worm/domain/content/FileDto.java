package observer.quantum.worm.domain.content;

import io.swagger.v3.oas.annotations.media.Schema;
import java.time.OffsetDateTime;
import java.util.UUID;
import lombok.*;
import observer.quantum.worm.domain.user.UserDto;

@AllArgsConstructor
@NoArgsConstructor
@Getter
@Setter
@Schema(name = "File", description = "File Data")
public class FileDto {
  @Schema(description = "File ID", example = "66c8e88630d2507bab875d28")
  private UUID id;

  @Schema(description = "File name", example = "filename.png")
  private String name;

  @Schema(description = "Date when the file was created", example = "2024-08-23T19:52:38.690Z")
  private OffsetDateTime created;

  @Schema(description = "Summary or description of the file")
  private String summary;

  @Schema(description = "Length of the file content in bytes", example = "1999693")
  private long contentLength;

  @Schema(description = "MIME type of the file content", example = "image/png")
  private String contentMimeType;

  @Schema(description = "User who owns the file")
  private UserDto owner;

  public FileDto(File file) {
    this.id = file.getId();
    this.name = file.getName();
    this.created = file.getCreated();
    this.summary = file.getSummary();
    this.contentLength = file.getContentLength();
    this.contentMimeType = file.getContentMimeType();
    this.owner = new UserDto(file.getOwner());
  }

  public File toFile() {
    File file = new File();
    file.setId(this.id);
    file.setName(this.name);
    file.setCreated(this.created);
    file.setSummary(this.summary);
    file.setContentLength(this.contentLength);
    file.setContentMimeType(this.contentMimeType);
    return file;
  }
}
