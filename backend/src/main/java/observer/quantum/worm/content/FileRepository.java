package observer.quantum.worm.content;

import observer.quantum.worm.user.User;

import java.util.UUID;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface FileRepository extends JpaRepository<File, UUID> {
  Page<File> findByOwnerAndNameContainingIgnoreCase(User owner, String name, Pageable pageable);
}
