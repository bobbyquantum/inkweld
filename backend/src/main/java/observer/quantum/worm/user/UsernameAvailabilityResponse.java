package observer.quantum.worm.user;

import java.util.List;

public class UsernameAvailabilityResponse {
  private boolean available;
  private List<String> suggestions;

  public UsernameAvailabilityResponse(boolean available, List<String> suggestions) {
    this.available = available;
    this.suggestions = suggestions;
  }

  public boolean isAvailable() {
    return available;
  }

  public void setAvailable(boolean available) {
    this.available = available;
  }

  public List<String> getSuggestions() {
    return suggestions;
  }

  public void setSuggestions(List<String> suggestions) {
    this.suggestions = suggestions;
  }
}
