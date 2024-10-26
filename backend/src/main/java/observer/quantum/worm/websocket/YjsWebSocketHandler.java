package observer.quantum.worm.websocket;

import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import lombok.extern.slf4j.Slf4j;
import org.springframework.lang.NonNull;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.BinaryMessage;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.AbstractWebSocketHandler;

@Slf4j
@Component
public class YjsWebSocketHandler extends AbstractWebSocketHandler {

  private final Map<String, List<WebSocketSession>> documentSessions = new ConcurrentHashMap<>();

  @Override
  public void afterConnectionEstablished(@NonNull WebSocketSession session) {
    String documentId = getDocumentIdFromSession(session);
    log.info(
        "WebSocket connection established - Session ID: {}, Document ID: {}, URI: {}",
        session.getId(),
        documentId,
        session.getUri());

    documentSessions.computeIfAbsent(documentId, k -> new CopyOnWriteArrayList<>()).add(session);
    log.info(
        "Added session to document {} - Total sessions for document: {}",
        documentId,
        documentSessions.get(documentId).size());
  }

  @Override
  protected void handleTextMessage(@NonNull WebSocketSession session, @NonNull TextMessage message)
      throws IOException {
    String documentId = getDocumentIdFromSession(session);
    log.debug(
        "Received text message from session {} for document {} - Message length: {}",
        session.getId(),
        documentId,
        message.getPayloadLength());

    broadcastMessage(session, message, documentId);
  }

  @Override
  protected void handleBinaryMessage(
      @NonNull WebSocketSession session, @NonNull BinaryMessage message) throws IOException {
    String documentId = getDocumentIdFromSession(session);
    log.debug(
        "Received binary message from session {} for document {} - Message length: {}",
        session.getId(),
        documentId,
        message.getPayloadLength());

    broadcastMessage(session, message, documentId);
  }

  private void broadcastMessage(
      WebSocketSession sender,
      org.springframework.web.socket.WebSocketMessage<?> message,
      String documentId) {
    List<WebSocketSession> sessions = documentSessions.get(documentId);
    if (sessions != null) {
      int messagesSent = 0;
      for (WebSocketSession clientSession : sessions) {
        if (clientSession.isOpen() && !clientSession.getId().equals(sender.getId())) {
          try {
            clientSession.sendMessage(message);
            messagesSent++;
          } catch (IOException e) {
            log.error(
                "Failed to send message to session {} - Error: {}",
                clientSession.getId(),
                e.getMessage(),
                e);
          }
        }
      }
      log.debug("Broadcasted message to {} sessions for document {}", messagesSent, documentId);
    } else {
      log.warn("No sessions found for document {}", documentId);
    }
  }

  @Override
  public void handleTransportError(
      @NonNull WebSocketSession session, @NonNull Throwable exception) {
    String documentId = getDocumentIdFromSession(session);
    log.error(
        "Transport error for session {} in document {} - Error: {}",
        session.getId(),
        documentId,
        exception.getMessage(),
        exception);
  }

  @Override
  public void afterConnectionClosed(
      @NonNull WebSocketSession session, @NonNull CloseStatus status) {
    String documentId = getDocumentIdFromSession(session);
    log.info(
        "WebSocket connection closed - Session ID: {}, Document ID: {}, Status: {}",
        session.getId(),
        documentId,
        status);

    List<WebSocketSession> sessions = documentSessions.get(documentId);
    if (sessions != null) {
      sessions.remove(session);
      if (sessions.isEmpty()) {
        documentSessions.remove(documentId);
        log.info("Removed empty document: {}", documentId);
      } else {
        log.info(
            "Removed session from document {} - Remaining sessions: {}",
            documentId,
            sessions.size());
      }
    }
  }

  private String getDocumentIdFromSession(@NonNull WebSocketSession session) {
    try {
      var uri = session.getUri();
      if (uri == null) {
        throw new IllegalArgumentException("URI is null");
      }
      String query = uri.getQuery();
      if (query != null && query.contains("documentId=")) {
        return query.split("documentId=")[1].split("&")[0];
      }
    } catch (Exception e) {
      log.error(
          "Error extracting documentId from session - URI: {} - Error: {}",
          session.getUri(),
          e.getMessage(),
          e);
    }
    log.warn(
        "Using default documentId for session {} - URI: {}", session.getId(), session.getUri());
    return "default";
  }
}
