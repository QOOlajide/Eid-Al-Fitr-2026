const request = require('supertest');
const { sequelize } = require('../config/database');
const app = require('../index');

describe('RAG API', () => {
  let authToken;

  beforeAll(async () => {
    // Set up test database
    await sequelize.sync({ force: true });
    
    // Create a test user and get token
    const registerResponse = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Test User',
        email: 'test@example.com',
        password: 'password123'
      });
    
    authToken = registerResponse.body.token;
  });

  afterAll(async () => {
    await sequelize.close();
  });

  describe('POST /api/rag/search', () => {
    it('should search Islamic knowledge successfully', async () => {
      const searchQuery = {
        query: 'What is the meaning of Eid al-Fitr?'
      };

      const response = await request(app)
        .post('/api/rag/search')
        .set('Authorization', `Bearer ${authToken}`)
        .send(searchQuery)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('query');
      expect(response.body.data).toHaveProperty('answer');
      expect(response.body.data).toHaveProperty('sources');
      expect(response.body.data).toHaveProperty('confidence');
    });

    it('should validate query length', async () => {
      const shortQuery = {
        query: 'Hi'
      };

      const response = await request(app)
        .post('/api/rag/search')
        .set('Authorization', `Bearer ${authToken}`)
        .send(shortQuery)
        .expect(400);

      expect(response.body.message).toContain('Validation failed');
    });

    it('should require authentication', async () => {
      const searchQuery = {
        query: 'What is the meaning of Eid al-Fitr?'
      };

      const response = await request(app)
        .post('/api/rag/search')
        .send(searchQuery)
        .expect(401);

      expect(response.body.message).toContain('Access token required');
    });
  });

  describe('POST /api/rag/related', () => {
    it('should get related questions', async () => {
      const topic = {
        topic: 'Eid al-Fitr'
      };

      const response = await request(app)
        .post('/api/rag/related')
        .send(topic)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
    });
  });

  describe('GET /api/rag/history', () => {
    it('should get search history for authenticated user', async () => {
      const response = await request(app)
        .get('/api/rag/history')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should require authentication for history', async () => {
      const response = await request(app)
        .get('/api/rag/history')
        .expect(401);

      expect(response.body.message).toContain('Access token required');
    });
  });
});
