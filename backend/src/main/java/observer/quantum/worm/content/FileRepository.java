package observer.quantum.worm.content;

import observer.quantum.worm.user.User;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface FileRepository extends JpaRepository<File, String> {
  Page<File> findByOwnerAndNameContainingIgnoreCase(User owner, String name, Pageable pageable);
}
