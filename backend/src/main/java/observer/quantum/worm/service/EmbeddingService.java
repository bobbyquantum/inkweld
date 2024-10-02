package observer.quantum.worm.service;

import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.ai.embedding.EmbeddingModel;
import org.springframework.stereotype.Service;

@Service
public class EmbeddingService {

  private static final Logger logger = LoggerFactory.getLogger(EmbeddingService.class);
  private final EmbeddingModel embeddingModel;

  public EmbeddingService(EmbeddingModel embeddingModel) {
    this.embeddingModel = embeddingModel;
  }

  public List<List<Float>> generateEmbeddings(List<String> texts) {
    try {
      logger.info("Generating embeddings for {} texts", texts.size());
      List<List<Float>> embeddings =
          texts.stream()
              .map(
                  text -> {
                    float[] embedding = embeddingModel.embed(text);
                    return convertToList(embedding);
                  })
              .collect(Collectors.toList());
      logger.info("Successfully generated {} embeddings", embeddings.size());
      return embeddings;
    } catch (Exception e) {
      logger.error("Error generating embeddings: {}", e.getMessage(), e);
      throw new RuntimeException("Failed to generate embeddings", e);
    }
  }

  private List<Float> convertToList(float[] array) {
    List<Float> list = new ArrayList<>(array.length);
    for (float value : array) {
      list.add(value);
    }
    return list;
  }
}
