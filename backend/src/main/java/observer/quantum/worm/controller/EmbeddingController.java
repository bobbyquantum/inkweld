package observer.quantum.worm.controller;

import org.springframework.web.bind.annotation.*;
import observer.quantum.worm.service.EmbeddingService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.List;

@RestController
@RequestMapping("/api/v1/embeddings")
public class EmbeddingController {

    private static final Logger logger = LoggerFactory.getLogger(EmbeddingController.class);
    private final EmbeddingService embeddingService;

    public EmbeddingController(EmbeddingService embeddingService) {
        this.embeddingService = embeddingService;
    }

    @PostMapping
    public List<List<Float>> generateEmbeddings(@RequestBody List<String> texts) {
        logger.info("Received request to generate embeddings for {} texts", texts.size());
        List<List<Float>> embeddings = embeddingService.generateEmbeddings(texts);
        logger.info("Generated embeddings for {} texts", embeddings.size());
        return embeddings;
    }
}