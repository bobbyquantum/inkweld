package observer.quantum.worm.content;

import org.springframework.content.mongo.store.MongoContentStore;

public interface FileContentStore extends MongoContentStore<File, String> {
}