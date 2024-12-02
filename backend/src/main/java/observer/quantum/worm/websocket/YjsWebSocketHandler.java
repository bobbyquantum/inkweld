package observer.quantum.worm.websocket;

import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.ArrayList;
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
import org.springframework.web.util.UriTemplate;

@Slf4j
@Component
public class YjsWebSocketHandler extends AbstractWebSocketHandler {

  private static final UriTemplate DOCUMENT_URI_TEMPLATE = new UriTemplate("/ws/yjs/{documentId}");

  private final Map<String, List<WebSocketSession>> documentSessions = new ConcurrentHashMap<>();
  // Store all updates for each document
  private final Map<String, List<byte[]>> documentUpdates = new ConcurrentHashMap<>();
  // Store awareness information for each document
  private final Map<String, byte[]> documentAwareness = new ConcurrentHashMap<>();

  @Override
  public void afterConnectionEstablished(@NonNull WebSocketSession session) {
    String documentId = getDocumentIdFromSession(session);
    log.info(
        "WebSocket connection established - Session ID: {}, Document ID: {}, URI: {}",
        session.getId(),
        documentId,
        session.getUri());

    documentSessions.computeIfAbsent(documentId, _ -> new CopyOnWriteArrayList<>()).add(session);
    log.info(
        "Added session to document {} - Total sessions for document: {}",
        documentId,
        documentSessions.get(documentId).size());

    // Send all updates to the new client
    List<byte[]> updates = documentUpdates.get(documentId);
    if (updates != null && !updates.isEmpty()) {
      try {
        for (byte[] update : updates) {
          session.sendMessage(new BinaryMessage(update));
        }
        log.info("Sent {} updates to new client for document {}", 
            updates.size(), documentId);
      } catch (IOException e) {
        log.error("Failed to send updates to new client", e);
      }
    } else {
      log.info("No existing updates found for document {}", documentId);
    }

    // Send current awareness state if it exists
    byte[] awarenessState = documentAwareness.get(documentId);
    if (awarenessState != null) {
      try {
        session.sendMessage(new BinaryMessage(awarenessState));
        log.info("Sent awareness state to new client for document {}", documentId);
      } catch (IOException e) {
        log.error("Failed to send awareness state to new client", e);
      }
    }
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
    byte[] payload = message.getPayload().array();
    
    log.debug(
        "Received binary message from session {} for document {} - Message length: {}, First byte: {}",
        session.getId(),
        documentId,
        message.getPayloadLength(),
        payload.length > 0 ? String.format("%02X", payload[0]) : "N/A");

    // Check message type from Y-protocol
    if (payload.length > 0) {
      int messageType = payload[0] & 0xff;
      // Y-protocol message types:
      // 0 = sync step 1 (client request)
      // 1 = sync step 2 (server response with state)
      // 2 = update
      // 3 = awareness
      if (messageType == 2) {
        // Store update message
        documentUpdates.computeIfAbsent(documentId, _ -> new ArrayList<>()).add(payload);
        log.info("Stored update ({} bytes) for document {} - Total updates: {}", 
            payload.length, documentId, documentUpdates.get(documentId).size());
      } else if (messageType == 3) {
        // Store awareness update
        documentAwareness.put(documentId, payload);
        log.debug("Stored awareness update for document {}", documentId);
      } else {
        log.debug("Received sync message type {} for document {}", messageType, documentId);
      }
    }

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
        log.info("All clients disconnected from document: {} (state preserved)", documentId);
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

      // Try to extract documentId from path variables first
      Map<String, String> pathVariables = DOCUMENT_URI_TEMPLATE.match(uri.getPath());
      if (pathVariables != null && pathVariables.containsKey("documentId")) {
        return pathVariables.get("documentId");
      }

      // Fallback to query parameter
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
