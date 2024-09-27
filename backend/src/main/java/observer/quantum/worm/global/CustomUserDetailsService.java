package observer.quantum.worm.global;

import observer.quantum.worm.user.UserService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;

@Service
public class CustomUserDetailsService implements UserDetailsService {

  private UserService userService;

  @Autowired
  public void setUserService(UserService userService) {
    this.userService = userService;
  }

  @Override
  public UserDetails loadUserByUsername(String username) throws UsernameNotFoundException {
    return userService
        .getUser(username)
        .map(user -> new UserDetailsWrapper(user.getUsername(), user.getPassword()))
        .orElseThrow(
            () -> new UsernameNotFoundException("User not found with username: " + username));
  }
}
