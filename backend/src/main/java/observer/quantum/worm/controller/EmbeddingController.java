package observer.quantum.worm.controller;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.enums.ParameterIn;
import io.swagger.v3.oas.annotations.media.ArraySchema;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.*;
import observer.quantum.worm.service.EmbeddingService;
import observer.quantum.worm.error.ErrorResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.annotation.Secured;

import java.util.List;

@RestController
@RequestMapping("/api/v1/embeddings")
@Tag(name = "Embedding API", description = "The embedding controller supports generating text embeddings using Ollama.")
public class EmbeddingController {

    private static final Logger logger = LoggerFactory.getLogger(EmbeddingController.class);
    private final EmbeddingService embeddingService;

    public EmbeddingController(EmbeddingService embeddingService) {
        this.embeddingService = embeddingService;
    }

    @Operation(
        summary = "Generate embeddings for given texts",
        description = "Generates embeddings for a list of input texts using the Ollama model specified in the configuration. " +
                      "Each text is transformed into a single embedding vector of 384 dimensions. " +
                      "The response is a list of embedding vectors, where each vector corresponds to an input text. " +
                      "Requires a valid CSRF token."
    )
    @ApiResponses(value = {
        @ApiResponse(
            responseCode = "200",
            description = "Successfully generated embeddings",
            content = @Content(
                mediaType = MediaType.APPLICATION_JSON_VALUE,
                array = @ArraySchema(schema = @Schema(implementation = List.class, 
                                    description = "List of embedding vectors, each vector is an array of 384 float values"))
            )
        ),
        @ApiResponse(
            responseCode = "400",
            description = "Invalid input",
            content = @Content(
                mediaType = MediaType.APPLICATION_JSON_VALUE,
                schema = @Schema(implementation = ErrorResponse.class)
            )
        ),
        @ApiResponse(
            responseCode = "401",
            description = "Invalid or missing authentication",
            content = @Content(
                mediaType = MediaType.APPLICATION_JSON_VALUE,
                schema = @Schema(implementation = ErrorResponse.class)
            )
        ),
        @ApiResponse(
            responseCode = "403",
            description = "Invalid CSRF token",
            content = @Content(
                mediaType = MediaType.APPLICATION_JSON_VALUE,
                schema = @Schema(implementation = ErrorResponse.class)
            )
        ),
        @ApiResponse(
            responseCode = "500",
            description = "Internal server error",
            content = @Content(
                mediaType = MediaType.APPLICATION_JSON_VALUE,
                schema = @Schema(implementation = ErrorResponse.class)
            )
        )
    })
    @PostMapping(
        produces = MediaType.APPLICATION_JSON_VALUE,
        consumes = MediaType.APPLICATION_JSON_VALUE
    )
    @Secured({"USER", "OAUTH2_USER"})
    public ResponseEntity<List<List<Float>>> generateEmbeddings(
        @Parameter(
            in = ParameterIn.HEADER,
            name = "X-XSRF-TOKEN",
            description = "CSRF token",
            required = true,
            schema = @Schema(type = "string")
        )
        @RequestHeader(name = "X-XSRF-TOKEN") String csrfToken,
        @io.swagger.v3.oas.annotations.parameters.RequestBody(
            description = "List of texts to generate embeddings for",
            required = true,
            content = @Content(
                mediaType = MediaType.APPLICATION_JSON_VALUE,
                array = @ArraySchema(schema = @Schema(implementation = String.class))
            )
        )
        @RequestBody List<String> texts
    ) {
        logger.info("Received request to generate embeddings for {} texts", texts.size());
        List<List<Float>> embeddings = embeddingService.generateEmbeddings(texts);
        logger.info("Generated {} embedding vectors, each with {} dimensions", embeddings.size(), embeddings.get(0).size());
        return ResponseEntity.ok(embeddings);
    }
}