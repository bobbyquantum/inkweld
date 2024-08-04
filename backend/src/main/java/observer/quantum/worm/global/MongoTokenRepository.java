package observer.quantum.worm.global;

import observer.quantum.worm.user.UserService;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.security.web.authentication.rememberme.PersistentRememberMeToken;
import org.springframework.security.web.authentication.rememberme.PersistentTokenRepository;

import java.util.Date;

@Configuration
public class MongoTokenRepository implements PersistentTokenRepository {

    private final UserService userService;

    private final MongoTemplate mongoTemplate;

    public MongoTokenRepository(UserService userService, MongoTemplate mongoTemplate) {
        this.userService = userService;
        this.mongoTemplate = mongoTemplate;
    }

    @Override
    public void createNewToken(PersistentRememberMeToken token) {
        var userRecord = userService.getCurrentUser();
        userRecord.ifPresent(user -> mongoTemplate.save(new PersistentToken(user.getUsername(), token)));
    }

    @Override
    public void updateToken(String series, String tokenValue, Date lastUsed) {
        Query query = Query.query(Criteria.where("series").is(series));
        PersistentToken token = mongoTemplate.findOne(query, PersistentToken.class);
        if (token != null) {
            token.setSeries(series);
            token.setTokenValue(tokenValue);
            token.setLastUsed(lastUsed);
            mongoTemplate.save(token);
        }
    }

    @Override
    public PersistentRememberMeToken getTokenForSeries(String seriesId) {
        Query query = Query.query(Criteria.where("series").is(seriesId));
        PersistentToken token = mongoTemplate.findOne(query, PersistentToken.class);
        if (token != null) {
            return new PersistentRememberMeToken(token.getUsername(), token.getSeries(), token.getTokenValue(), token.getLastUsed());
        } else {
            return null;
        }
    }

    @Override
    public void removeUserTokens(String username) {
        mongoTemplate.remove(new Query(Criteria.where("username").is(username)), PersistentToken.class);
    }
}