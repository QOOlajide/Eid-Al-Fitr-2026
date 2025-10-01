# Testing Guide for Eid al-Fitr 2025 Website

This guide will help you test the complete full-stack application.

## 🚀 Quick Start Testing

### Prerequisites
- Node.js 18+
- PostgreSQL 13+
- Redis 6+
- Docker (optional)

## 📋 Step-by-Step Testing Instructions

### 1. Environment Setup

```bash
# 1. Install dependencies
npm run install-all

# 2. Set up environment variables
cp server/env.example server/.env
cp client/env.example client/.env

# 3. Edit the .env files with your configuration
```

### 2. Database Setup

```bash
# Create PostgreSQL database
createdb eid_website

# Or using Docker
docker run --name eid-postgres -e POSTGRES_DB=eid_website -e POSTGRES_PASSWORD=password -p 5432:5432 -d postgres:15
```

### 3. Start the Application

```bash
# Start both frontend and backend
npm run dev

# Or start individually
npm run server  # Backend on http://localhost:5000
npm run client  # Frontend on http://localhost:3000
```

## 🧪 Running Tests

### Backend Tests

```bash
cd server
npm test                    # Run all tests
npm test -- --watch        # Run tests in watch mode
npm test -- --coverage     # Run with coverage report
```

### Frontend Tests

```bash
cd client
npm test                   # Run all tests
npm test -- --watch       # Run tests in watch mode
npm test -- --coverage    # Run with coverage report
```

### Integration Tests

```bash
# Run all tests from root
npm test
```

## 🔍 Manual Testing Checklist

### 1. Authentication Testing

#### Registration
- [ ] Navigate to `/register` (if implemented)
- [ ] Fill in valid user details
- [ ] Submit form
- [ ] Verify success message
- [ ] Check database for new user

#### Login
- [ ] Navigate to login page
- [ ] Enter valid credentials
- [ ] Submit form
- [ ] Verify JWT token is received
- [ ] Check user session

#### Protected Routes
- [ ] Try accessing protected route without token
- [ ] Verify redirect to login
- [ ] Access with valid token
- [ ] Verify access granted

### 2. RAG System Testing

#### Search Functionality
- [ ] Navigate to `/islamic-qa`
- [ ] Enter a question: "What is Eid al-Fitr?"
- [ ] Click search
- [ ] Verify answer is displayed
- [ ] Check sources are listed
- [ ] Verify confidence score

#### Related Questions
- [ ] Search for a topic
- [ ] Check if related questions appear
- [ ] Click on related question
- [ ] Verify new search is performed

#### Search History
- [ ] Perform multiple searches
- [ ] Check search history section
- [ ] Verify previous searches are listed
- [ ] Test clear history functionality

### 3. Payment System Testing

#### Zakat al-Fitr Payment
- [ ] Navigate to `/zakat`
- [ ] Fill in donor information
- [ ] Set family size and amount
- [ ] Verify total calculation
- [ ] Test Stripe payment flow (use test cards)
- [ ] Verify payment confirmation

#### Test Credit Cards
```
Visa: 4242 4242 4242 4242
Mastercard: 5555 5555 5555 4444
Declined: 4000 0000 0000 0002
```

### 4. Forum Testing

#### Create Post
- [ ] Navigate to `/forum`
- [ ] Click "Ask a Question"
- [ ] Fill in title and content
- [ ] Submit post
- [ ] Verify post appears in list

#### Reply to Post
- [ ] Click on existing post
- [ ] Add a reply
- [ ] Submit reply
- [ ] Verify reply appears

### 5. Real-time Updates Testing

#### WebSocket Connection
- [ ] Open browser developer tools
- [ ] Check Network tab for WebSocket connection
- [ ] Verify connection status in console
- [ ] Test real-time updates banner

#### Live Updates
- [ ] Send test update from server
- [ ] Verify banner updates
- [ ] Check update rotation

### 6. Responsive Design Testing

#### Mobile Testing
- [ ] Open Chrome DevTools
- [ ] Set device to mobile view
- [ ] Test all pages on mobile
- [ ] Verify navigation works
- [ ] Check form usability

#### Tablet Testing
- [ ] Test on tablet viewport
- [ ] Verify layout adapts correctly
- [ ] Check touch interactions

## 🐳 Docker Testing

### Build and Run with Docker

```bash
# Build all services
docker-compose build

# Start all services
docker-compose up -d

# Check service health
docker-compose ps

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

### Test Individual Services

```bash
# Test database connection
docker-compose exec postgres psql -U postgres -d eid_website -c "SELECT 1;"

# Test Redis connection
docker-compose exec redis redis-cli ping

# Test backend health
curl http://localhost:5000/health

# Test frontend
curl http://localhost:3000
```

## 🔧 API Testing with Postman/Insomnia

### Import API Collection

Create a collection with these endpoints:

#### Authentication
```
POST /api/auth/register
POST /api/auth/login
GET /api/auth/me
```

#### RAG System
```
POST /api/rag/search
POST /api/rag/related
GET /api/rag/history
```

#### Payments
```
POST /api/payment/create-intent
POST /api/payment/confirm
GET /api/payment/history
```

#### Forum
```
GET /api/forum/posts
POST /api/forum/posts
POST /api/forum/posts/:id/replies
```

### Test Scenarios

1. **Register → Login → Search → Payment**
2. **Create Forum Post → Reply → View History**
3. **Test Error Handling (invalid data, network errors)**

## 🚨 Common Issues and Solutions

### Database Connection Issues
```bash
# Check PostgreSQL is running
pg_isready -h localhost -p 5432

# Reset database
dropdb eid_website && createdb eid_website
```

### Redis Connection Issues
```bash
# Check Redis is running
redis-cli ping

# Start Redis with Docker
docker run -d -p 6379:6379 redis:7
```

### Port Conflicts
```bash
# Check what's using ports
netstat -tulpn | grep :3000
netstat -tulpn | grep :5000

# Kill processes if needed
kill -9 <PID>
```

### Environment Variables
```bash
# Verify .env files exist and have correct values
cat server/.env
cat client/.env
```

## 📊 Performance Testing

### Load Testing with Artillery

```bash
# Install Artillery
npm install -g artillery

# Run load test
artillery quick --count 10 --num 5 http://localhost:5000/health
```

### Frontend Performance

```bash
# Build production version
cd client && npm run build

# Serve with nginx or serve
npx serve -s build -l 3000
```

## 🐛 Debugging Tips

### Backend Debugging
```bash
# Enable debug logging
DEBUG=* npm run server

# Check database queries
# Add logging to your models
```

### Frontend Debugging
```bash
# Enable React DevTools
# Check browser console for errors
# Use React Profiler for performance
```

### Network Debugging
```bash
# Check API responses
curl -v http://localhost:5000/api/health

# Test WebSocket connection
wscat -c ws://localhost:5000
```

## ✅ Test Completion Checklist

- [ ] All unit tests pass
- [ ] Integration tests pass
- [ ] Manual testing completed
- [ ] Docker deployment works
- [ ] API endpoints respond correctly
- [ ] Frontend renders properly
- [ ] Database operations work
- [ ] Payment flow completes
- [ ] RAG system returns results
- [ ] Real-time updates function
- [ ] Responsive design works
- [ ] Error handling works
- [ ] Security measures active

## 📞 Getting Help

If you encounter issues:

1. Check the logs: `docker-compose logs -f`
2. Verify environment variables
3. Check database connectivity
4. Review the README.md
5. Check GitHub Issues (if applicable)

Happy Testing! 🎉
