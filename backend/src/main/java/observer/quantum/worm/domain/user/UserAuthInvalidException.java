package observer.quantum.worm.domain.user;

public class UserAuthInvalidException extends RuntimeException {
  public UserAuthInvalidException() {
    super("Auth invalid.");
  }
}
