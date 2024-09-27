package observer.quantum.worm.user;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.enums.ParameterIn;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.extern.slf4j.Slf4j;
import observer.quantum.worm.error.ErrorResponse;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.annotation.Secured;
import org.springframework.web.bind.annotation.*;

@RequestMapping("/api/v1/users")
@RestController
@Slf4j
@Tag(
    name = "User API",
    description = "The user controller allows accessing and updating details for the current user.")
public class UserController {

  private final UserService userService;

  public UserController(UserService userService) {
    this.userService = userService;
  }

  @Operation(
      summary = "Register a new user",
      description = "Registers a new user with the provided details.")
  @ApiResponses(
      value = {
        @ApiResponse(
            responseCode = "201",
            description = "User registered successfully",
            content =
                @Content(
                    mediaType = MediaType.APPLICATION_JSON_VALUE,
                    schema = @Schema(implementation = UserDto.class))),
        @ApiResponse(
            responseCode = "400",
            description = "Invalid input or username already exists",
            content =
                @Content(
                    mediaType = MediaType.APPLICATION_JSON_VALUE,
                    schema = @Schema(implementation = ErrorResponse.class)))
      })
  @PostMapping(
      path = "/register",
      consumes = MediaType.APPLICATION_JSON_VALUE,
      produces = MediaType.APPLICATION_JSON_VALUE)
  public ResponseEntity<UserDto> registerUser(
      @io.swagger.v3.oas.annotations.parameters.RequestBody(
              description = "User registration details",
              required = true,
              content =
                  @Content(
                      mediaType = MediaType.APPLICATION_JSON_VALUE,
                      schema = @Schema(implementation = RegisterUserRequest.class)))
          @Valid
          @RequestBody
          RegisterUserRequest registerUserRequest) {
    User newUser =
        userService.registerUser(
            registerUserRequest.getUsername(),
            registerUserRequest.getPassword(),
            registerUserRequest.getName());
    log.info("New user registered: {}", newUser.getUsername());
    return ResponseEntity.status(201).body(new UserDto(newUser));
  }

  @Operation(
      summary = "Get the currently authenticated user",
      description = "Retrieves information about the currently authenticated user.")
  @ApiResponses(
      value = {
        @ApiResponse(
            responseCode = "200",
            description = "User information retrieved successfully",
            content =
                @Content(
                    mediaType = MediaType.APPLICATION_JSON_VALUE,
                    schema = @Schema(implementation = UserDto.class))),
        @ApiResponse(
            responseCode = "401",
            description = "Invalid or missing authentication",
            content =
                @Content(
                    mediaType = MediaType.APPLICATION_JSON_VALUE,
                    schema = @Schema(implementation = ErrorResponse.class)))
      })
  @GetMapping(path = "/me", produces = MediaType.APPLICATION_JSON_VALUE)
  @Secured({"USER", "OAUTH2_USER"})
  public ResponseEntity<UserDto> getCurrentUser() {
    var userOptional = userService.getCurrentUser();
    if (userOptional.isPresent()) {
      var user = userOptional.get();
      log.trace("User info request for {}", user.getUsername());
      return ResponseEntity.ok(new UserDto(user));
    }
    throw new UserAuthInvalidException();
  }

  @Operation(
      summary = "Update user details",
      description =
          "Updates the details of the currently authenticated user. Requires a valid CSRF token.")
  @ApiResponses(
      value = {
        @ApiResponse(
            responseCode = "200",
            description = "User details updated successfully",
            content =
                @Content(
                    mediaType = MediaType.APPLICATION_JSON_VALUE,
                    schema = @Schema(implementation = UserDto.class))),
        @ApiResponse(
            responseCode = "400",
            description = "Invalid input",
            content =
                @Content(
                    mediaType = MediaType.APPLICATION_JSON_VALUE,
                    schema = @Schema(implementation = ErrorResponse.class))),
        @ApiResponse(
            responseCode = "401",
            description = "Invalid or missing authentication",
            content =
                @Content(
                    mediaType = MediaType.APPLICATION_JSON_VALUE,
                    schema = @Schema(implementation = ErrorResponse.class))),
        @ApiResponse(
            responseCode = "403",
            description = "Invalid CSRF token",
            content =
                @Content(
                    mediaType = MediaType.APPLICATION_JSON_VALUE,
                    schema = @Schema(implementation = ErrorResponse.class)))
      })
  @PutMapping(
      path = "/me",
      consumes = MediaType.APPLICATION_JSON_VALUE,
      produces = MediaType.APPLICATION_JSON_VALUE)
  @Secured("USER")
  public ResponseEntity<UserDto> updateUserDetails(
      @Parameter(
              in = ParameterIn.HEADER,
              name = "X-XSRF-TOKEN",
              description = "CSRF token",
              required = true,
              schema = @Schema(type = "string"))
          @RequestHeader(name = "X-XSRF-TOKEN")
          String csrfToken,
      @io.swagger.v3.oas.annotations.parameters.RequestBody(
              description = "User details to update",
              required = true,
              content =
                  @Content(
                      mediaType = MediaType.APPLICATION_JSON_VALUE,
                      schema = @Schema(implementation = UpdateUserRequest.class)))
          @Valid
          @RequestBody
          UpdateUserRequest updateUserRequest) {
    if (updateUserRequest.getName() == null && updateUserRequest.getAvatarImageUrl() == null) {
      throw new InvalidInputException(
          "At least one field (name or avatarImageUrl) must be provided");
    }
    var updatedUser = userService.updateUserDetails(updateUserRequest);
    log.info("User details updated for {}", updatedUser.getUsername());
    return ResponseEntity.ok(new UserDto(updatedUser));
  }

  @Operation(
      summary = "Update user password",
      description =
          "Updates the password of the currently authenticated user. Requires a valid CSRF token.")
  @ApiResponses(
      value = {
        @ApiResponse(responseCode = "204", description = "Password updated successfully"),
        @ApiResponse(
            responseCode = "400",
            description = "Invalid input or incorrect old password",
            content =
                @Content(
                    mediaType = MediaType.APPLICATION_JSON_VALUE,
                    schema = @Schema(implementation = ErrorResponse.class))),
        @ApiResponse(
            responseCode = "401",
            description = "Invalid or missing authentication",
            content =
                @Content(
                    mediaType = MediaType.APPLICATION_JSON_VALUE,
                    schema = @Schema(implementation = ErrorResponse.class))),
        @ApiResponse(
            responseCode = "403",
            description = "Invalid CSRF token",
            content =
                @Content(
                    mediaType = MediaType.APPLICATION_JSON_VALUE,
                    schema = @Schema(implementation = ErrorResponse.class)))
      })
  @PutMapping(path = "/me/password", consumes = MediaType.APPLICATION_JSON_VALUE)
  @Secured("USER")
  public ResponseEntity<Void> updatePassword(
      @Parameter(
              in = ParameterIn.HEADER,
              name = "X-XSRF-TOKEN",
              description = "CSRF token",
              required = true,
              schema = @Schema(type = "string"))
          @RequestHeader(name = "X-XSRF-TOKEN")
          String csrfToken,
      @io.swagger.v3.oas.annotations.parameters.RequestBody(
              description = "Password update details",
              required = true,
              content =
                  @Content(
                      mediaType = MediaType.APPLICATION_JSON_VALUE,
                      schema = @Schema(implementation = UpdatePasswordRequest.class)))
          @Valid
          @RequestBody
          UpdatePasswordRequest updatePasswordRequest) {
    userService.updatePassword(
        updatePasswordRequest.getOldPassword(), updatePasswordRequest.getNewPassword());
    log.info("Password updated for current user");
    return ResponseEntity.noContent().build();
  }

  @Operation(
      summary = "Delete user account",
      description =
          "Deletes the account of the currently authenticated user. Requires a valid CSRF token.")
  @ApiResponses(
      value = {
        @ApiResponse(responseCode = "204", description = "User account deleted successfully"),
        @ApiResponse(
            responseCode = "401",
            description = "Invalid or missing authentication",
            content =
                @Content(
                    mediaType = MediaType.APPLICATION_JSON_VALUE,
                    schema = @Schema(implementation = ErrorResponse.class))),
        @ApiResponse(
            responseCode = "403",
            description = "Invalid CSRF token",
            content =
                @Content(
                    mediaType = MediaType.APPLICATION_JSON_VALUE,
                    schema = @Schema(implementation = ErrorResponse.class)))
      })
  @DeleteMapping(path = "/me")
  @Secured({"USER", "OAUTH2_USER"})
  public ResponseEntity<Void> deleteAccount(
      @Parameter(
              in = ParameterIn.HEADER,
              name = "X-XSRF-TOKEN",
              description = "CSRF token",
              required = true,
              schema = @Schema(type = "string"))
          @RequestHeader(name = "X-XSRF-TOKEN")
          String csrfToken) {
    userService.deleteAccount();
    log.info("User account deleted");
    return ResponseEntity.noContent().build();
  }
}
