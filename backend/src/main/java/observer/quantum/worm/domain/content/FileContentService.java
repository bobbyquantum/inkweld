package observer.quantum.worm.domain.content;

import java.io.IOException;
import java.util.Optional;
import java.util.UUID;
import observer.quantum.worm.domain.user.User;
import observer.quantum.worm.domain.user.UserAuthInvalidException;
import observer.quantum.worm.domain.user.UserService;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

@Service
public class FileContentService {

  private final FileContentRepository fileRepository;
  private final FileContentStore contentStore;
  private final UserService userService;

  public FileContentService(
      FileContentRepository fileRepository,
      FileContentStore contentStore,
      UserService userService) {
    this.fileRepository = fileRepository;
    this.contentStore = contentStore;
    this.userService = userService;
  }

  public FileContent createFile(MultipartFile file) throws IOException {
    User currentUser = userService.getCurrentUser().orElseThrow(UserAuthInvalidException::new);

    FileContent newFile = new FileContent();
    newFile.setName(file.getOriginalFilename());
    newFile.setContentMimeType(file.getContentType());
    newFile.setContentLength(file.getSize());
    newFile.setOwner(currentUser);

    newFile = fileRepository.save(newFile);
    contentStore.setContent(newFile, file.getInputStream());

    return newFile;
  }

  public Optional<FileContent> getFile(UUID fileId) {
    User currentUser = userService.getCurrentUser().orElseThrow(UserAuthInvalidException::new);
    Optional<FileContent> file = fileRepository.findById(fileId);
    if (file.isPresent() && !file.get().getOwner().getId().equals(currentUser.getId())) {
      throw new AccessDeniedException("Access denied.");
    }
    return file;
  }

  @Transactional
  public Optional<FileContent> patchFile(UUID fileId, FileContentPatchDto patchDto) {
    return getFile(fileId)
        .map(
            file -> {
              if (patchDto.getName() != null && !patchDto.getName().isEmpty()) {
                file.setName(patchDto.getName());
              }
              if (patchDto.getSummary() != null) {
                file.setSummary(patchDto.getSummary());
              }
              return fileRepository.save(file);
            });
  }

  public boolean updateFileContent(UUID fileId, MultipartFile file) throws IOException {
    Optional<FileContent> existingFile = getFile(fileId);
    if (existingFile.isPresent()) {
      FileContent updatedFile = existingFile.get();
      updatedFile.setContentMimeType(file.getContentType());
      updatedFile.setContentLength(file.getSize());
      contentStore.setContent(updatedFile, file.getInputStream());
      fileRepository.save(updatedFile);
      return true;
    }
    return false;
  }

  public boolean deleteFile(UUID fileId) {
    Optional<FileContent> fileOptional = getFile(fileId);
    if (fileOptional.isPresent()) {
      FileContent file = fileOptional.get();
      contentStore.unsetContent(file);
      fileRepository.delete(file);
      return true;
    }
    return false;
  }

  public Page<FileContent> searchFiles(String nameQuery, Pageable pageable) {
    User currentUser = userService.getCurrentUser().orElseThrow(UserAuthInvalidException::new);
    return fileRepository.findByOwnerAndNameContainingIgnoreCase(currentUser, nameQuery, pageable);
  }

  public boolean saveFileContent(UUID fileId, String content) throws IOException {
    Optional<FileContent> existingFile = getFile(fileId);
    if (existingFile.isPresent()) {
      FileContent file = existingFile.get();
      contentStore.setContent(file, content.getBytes());
      fileRepository.save(file);
      return true;
    }
    return false;
  }
}
