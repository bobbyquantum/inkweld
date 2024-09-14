package observer.quantum.worm.content;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import observer.quantum.worm.user.User;
import org.springframework.content.commons.annotations.ContentId;
import org.springframework.content.commons.annotations.ContentLength;

import java.time.OffsetDateTime;

@Entity
@Table(name = "files")
@Getter
@Setter
@NoArgsConstructor
public class File {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ContentId
    private String contentId;

    @Column(nullable = false)
    private String name;

    @Column(nullable = false)
    private OffsetDateTime created;

    @Column(length = 1000)
    private String summary;

    @ContentLength
    private long contentLength;

    @Column(name = "content_mime_type")
    private String contentMimeType = "text/plain";

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "owner_id")
    private User owner;

    @PrePersist
    protected void onCreate() {
        created = OffsetDateTime.now();
    }
}
