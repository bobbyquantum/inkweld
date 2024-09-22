package observer.quantum.worm.error;

import observer.quantum.worm.project.ProjectNotFoundException;
import observer.quantum.worm.user.InvalidInputException;
import observer.quantum.worm.user.UserAuthInvalidException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.bind.MissingRequestHeaderException;
import org.springframework.web.bind.annotation.ControllerAdvice;
import org.springframework.web.bind.annotation.ExceptionHandler;

@SuppressWarnings("unused")
@ControllerAdvice
public class GlobalExceptionHandler {

  @ExceptionHandler(ProjectNotFoundException.class)
  public ResponseEntity<ErrorResponse> handleProjectNotFound(ProjectNotFoundException ex) {
    ErrorResponse error =
        new ErrorResponse(ex.getMessage(), HttpStatus.NOT_FOUND.value(), "PROJECT_NOT_FOUND");
    return new ResponseEntity<>(error, HttpStatus.NOT_FOUND);
  }

  @ExceptionHandler(UserAuthInvalidException.class)
  public ResponseEntity<ErrorResponse> handleUserAuthInvalid(UserAuthInvalidException ex) {
    ErrorResponse error =
        new ErrorResponse(ex.getMessage(), HttpStatus.UNAUTHORIZED.value(), "USER_AUTH_INVALID");
    return new ResponseEntity<>(error, HttpStatus.UNAUTHORIZED);
  }

  @ExceptionHandler(AccessDeniedException.class)
  public ResponseEntity<ErrorResponse> handleAccessDenied(AccessDeniedException ex) {
    ErrorResponse error =
        new ErrorResponse("Access denied", HttpStatus.FORBIDDEN.value(), "ACCESS_DENIED");
    return new ResponseEntity<>(error, HttpStatus.FORBIDDEN);
  }

  @ExceptionHandler(InvalidInputException.class)
  public ResponseEntity<ErrorResponse> handleInvalidInput(InvalidInputException ex) {
    ErrorResponse error =
        new ErrorResponse(ex.getMessage(), HttpStatus.BAD_REQUEST.value(), "INVALID_INPUT");
    return new ResponseEntity<>(error, HttpStatus.BAD_REQUEST);
  }

  @ExceptionHandler(Exception.class)
  public ResponseEntity<ErrorResponse> handleGeneralException(Exception ex) {
    ErrorResponse error =
        new ErrorResponse(
            "An unexpected error occurred: " + ex.getMessage(),
            HttpStatus.INTERNAL_SERVER_ERROR.value(),
            "INTERNAL_SERVER_ERROR");
    return new ResponseEntity<>(error, HttpStatus.INTERNAL_SERVER_ERROR);
  }

  @ExceptionHandler(MissingRequestHeaderException.class)
  public ResponseEntity<ErrorResponse> handleMissingRequestHeaderException(
      MissingRequestHeaderException ex) {
    ErrorResponse error =
        new ErrorResponse(
            "Missing required header: " + ex.getHeaderName(),
            HttpStatus.FORBIDDEN.value(),
            "MISSING_REQUIRED_HEADER");
    return new ResponseEntity<>(error, HttpStatus.FORBIDDEN);
  }
}
