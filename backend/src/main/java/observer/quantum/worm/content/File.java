package observer.quantum.worm.content;

import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import observer.quantum.worm.user.User;
import org.springframework.content.commons.annotations.ContentId;
import org.springframework.content.commons.annotations.ContentLength;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.DBRef;
import org.springframework.data.mongodb.core.mapping.Document;

import java.util.Date;

@Document
@Getter
@Setter
@NoArgsConstructor
public class File {

    @Id
    @ContentId
    @GeneratedValue(strategy = GenerationType.AUTO)
    private String id;

    private String name;
    private Date created = new Date();
    private String summary;

    @ContentLength
    private long contentLength;
    private String contentMimeType = "text/plain";

    @DBRef
    private User owner;
}