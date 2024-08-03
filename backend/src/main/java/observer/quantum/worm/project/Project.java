package observer.quantum.worm.project;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;

import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;
import java.util.Date;

@Data
@NoArgsConstructor
@Document(collection = "projects")
public class Project {
    @Id
    private String id;

    private String title;

    private String description;

    @Indexed
    private String userId;

    private String status; // Consider using an Enum for better type safety.

    private Date createdDate;

    private Date updatedDate;

    private List<String> chapters; // List of chapter IDs

    private List<String> tags; // Tags for the project
}