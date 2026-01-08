# Eid al-Fitr 2025 Community Website

A comprehensive full-stack web application for the Eid al-Fitr 2025 community celebration, featuring a RAG (Retrieval-Augmented Generation) pipeline for Islamic knowledge Q&A.

## 🚀 Features

### Core Features
- **Event Information**: Complete schedule, venue details, and prayer guide
- **Zakat al-Fitr Payment**: Secure online payment processing with Stripe
- **Community Forum**: Q&A platform for community interaction
- **Real-time Updates**: Live announcements and event updates via WebSocket
- **Islamic Q&A**: AI-powered knowledge system with RAG pipeline

### RAG Pipeline
- **Trusted Sources**: Crawls and indexes verified Islamic websites into a vector database (Qdrant), then retrieves relevant chunks at query time:
  - abukhadeejah.com
  - abuiyaad.com
  - mpubs.org
  - bakkah.net
  - troid.org
- **Vector Retrieval**: Uses embeddings + Qdrant similarity search (top‑k chunks) as the retrieval layer
- **AI-Powered Answers**: Uses Gemini for generating responses grounded in retrieved chunks
- **Source Attribution**: Each retrieved chunk includes `url`, `domain`, and `title` for citations; the UI also displays sources + confidence

### Technical Features
- **Responsive Design**: Mobile-first approach with modern UI/UX
- **Authentication**: JWT-based user authentication and authorization
- **Real-time Communication**: WebSocket integration for live updates
- **Payment Processing**: Stripe integration for secure transactions
- **Database**: PostgreSQL with Sequelize ORM
- **Caching**: Redis for improved performance

## 🛠 Technology Stack

### Frontend
- **React 18** with functional components and hooks
- **React Router** for client-side routing
- **Framer Motion** for animations
- **Stripe Elements** for payment processing
- **Socket.io Client** for real-time communication
- **Lucide React** for icons

### Backend
- **Node.js** with Express.js
- **PostgreSQL** database with Sequelize ORM
- **Redis** for caching and session management
- **Socket.io** for WebSocket communication
- **Stripe** for payment processing
- **OpenAI API** for AI-powered responses
- **JWT** for authentication

### DevOps & Deployment
- **Docker** containerization
- **Docker Compose** for local development
- **Nginx** reverse proxy
- **AWS/Google Cloud/Azure** ready for deployment

## 📁 Project Structure

```
eid-al-fitr-2025/
├── client/                 # React frontend
│   ├── src/
│   │   ├── components/     # Reusable components
│   │   ├── pages/          # Page components
│   │   ├── contexts/       # React contexts
│   │   └── App.js          # Main app component
│   └── package.json
├── server/                 # Node.js backend
│   ├── routes/             # API routes
│   ├── models/             # Database models
│   ├── services/           # Business logic
│   ├── middleware/         # Express middleware
│   ├── socket/             # WebSocket handlers
│   └── index.js            # Server entry point
├── docker-compose.yml      # Docker configuration
└── README.md
```

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- PostgreSQL 13+
- Redis 6+
- Docker (optional)

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd eid-al-fitr-2025
   ```

2. **Install dependencies**
   ```bash
   npm run install-all
   ```

3. **Set up environment variables**
   ```bash
   # Copy example files
   cp server/env.example server/.env
   cp client/env.example client/.env
   
   # Edit the .env files with your configuration
   ```

4. **Set up the database**
   ```bash
   # Create PostgreSQL database
   createdb eid_website
   
   # Run migrations (if any)
   cd server && npm run seed
   ```

5. **Start the development servers**
   ```bash
   npm run dev
   ```

   This will start:
   - Frontend: http://localhost:3000
   - Backend: http://localhost:5000

### Docker Setup (Alternative)

1. **Build and start with Docker Compose**
   ```bash
   docker-compose up --build
   ```

## 🔎 Vector RAG (Qdrant) Setup

### 1) Start Qdrant (via Docker Compose)

- Qdrant is included in `docker-compose.yml` as the `qdrant` service and listens on `http://localhost:6333`.

### 2) Configure the server

Add these to `server/.env` (see `server/env.example`):

- `QDRANT_URL=http://localhost:6333`
- `RAG_VECTOR_COLLECTION=islamic_chunks`
- `RAG_RETRIEVER=vector`
- `RAG_TOP_K=6`

### 3) Ingest (crawl + chunk + embed + upsert)

Set a few seed URLs on the allowed domains:

- `RAG_SEED_URLS=https://troid.org/some-page,https://bakkah.net/some-page`

Then run:

```bash
cd server
npm run rag:ingest
```

Notes:
- The ingest script only follows links on these domains: `abukhadeejah.com`, `abuiyaad.com`, `troid.org`, `mpubs.org`, `bakkah.net`.
- Tune `RAG_MAX_PAGES`, `RAG_CRAWL_DELAY_MS`, and `RAG_MIN_CHUNK_CHARS` in your env as needed.

## 📏 RAG Metrics (defensible)

Once you have an indexed corpus, you can report:
- **Corpus size**: number of pages fetched, number of chunks indexed (Qdrant points), and domain coverage
- **Retrieval quality (offline eval)**: Recall@k / Hit@k on a small gold set of questions with expected domains/URLs
- **Grounding**: citation coverage (answers that include at least 1 retrieved source URL), and “no sources” rate
- **Latency**: p50/p95 retrieval + end-to-end response time

## 🔧 Configuration

### Environment Variables

#### Server (.env)
```env
# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=eid_website
DB_USER=postgres
DB_PASSWORD=your_password

# JWT
JWT_SECRET=your_jwt_secret

# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# OpenAI
OPENAI_API_KEY=sk-...

# Server
PORT=5000
NODE_ENV=development
CLIENT_URL=http://localhost:3000
```

#### Client (.env)
```env
REACT_APP_SERVER_URL=http://localhost:5000
REACT_APP_STRIPE_PUBLISHABLE_KEY=pk_test_...
```

## 📚 API Documentation

### Authentication
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `GET /api/auth/me` - Get current user
- `PUT /api/auth/profile` - Update profile

### RAG System
- `POST /api/rag/search` - Search Islamic knowledge
- `POST /api/rag/related` - Get related questions
- `GET /api/rag/history` - Get search history

### Payments
- `POST /api/payment/create-intent` - Create payment intent
- `POST /api/payment/confirm` - Confirm payment
- `GET /api/payment/history` - Get payment history

### Forum
- `GET /api/forum/posts` - Get forum posts
- `POST /api/forum/posts` - Create new post
- `POST /api/forum/posts/:id/replies` - Reply to post

### Events
- `GET /api/events` - Get all events
- `GET /api/events/updates/all` - Get real-time updates

## 🔒 Security Features

- **HTTPS Enforcement**: All communication encrypted
- **Input Validation**: Comprehensive validation on all inputs
- **Rate Limiting**: Protection against abuse
- **JWT Authentication**: Secure token-based auth
- **CORS Configuration**: Proper cross-origin setup
- **Helmet.js**: Security headers
- **SQL Injection Protection**: Sequelize ORM protection

## 🎨 UI/UX Features

- **Responsive Design**: Works on all device sizes
- **Accessibility**: WCAG compliant
- **Modern UI**: Clean, Islamic-themed design
- **Smooth Animations**: Framer Motion integration
- **Loading States**: User feedback for all actions
- **Error Handling**: Graceful error management

## 🚀 Deployment

### Production Deployment

1. **Build the application**
   ```bash
   npm run build
   ```

2. **Set production environment variables**

3. **Deploy using Docker**
   ```bash
   docker-compose -f docker-compose.prod.yml up -d
   ```

### Cloud Deployment Options

- **AWS**: ECS, RDS, ElastiCache
- **Google Cloud**: Cloud Run, Cloud SQL, Memorystore
- **Azure**: Container Instances, Database, Cache

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🙏 Acknowledgments

- Islamic scholars and websites for providing authentic content
- Open source community for the amazing tools and libraries
- Community members for feedback and suggestions



