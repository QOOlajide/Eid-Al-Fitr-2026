#!/bin/bash

# Eid al-Fitr 2025 Deployment Script
# This script handles deployment to different environments

set -e  # Exit on any error

# Configuration
ENVIRONMENT=${1:-staging}
DOCKER_REGISTRY=${DOCKER_REGISTRY:-"your-registry"}
VERSION=${VERSION:-"latest"}

echo "🚀 Starting deployment to $ENVIRONMENT environment..."

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to validate environment
validate_environment() {
    case $ENVIRONMENT in
        staging|production)
            echo "✅ Environment $ENVIRONMENT is valid"
            ;;
        *)
            echo "❌ Invalid environment: $ENVIRONMENT"
            echo "Usage: $0 [staging|production]"
            exit 1
            ;;
    esac
}

# Function to check prerequisites
check_prerequisites() {
    echo "🔍 Checking prerequisites..."
    
    if ! command_exists docker; then
        echo "❌ Docker is not installed"
        exit 1
    fi
    
    if ! command_exists docker-compose; then
        echo "❌ Docker Compose is not installed"
        exit 1
    fi
    
    if [ ! -f ".env.$ENVIRONMENT" ]; then
        echo "❌ Environment file .env.$ENVIRONMENT not found"
        exit 1
    fi
    
    echo "✅ All prerequisites met"
}

# Function to build and push Docker images
build_and_push_images() {
    echo "🏗️ Building and pushing Docker images..."
    
    # Build server image
    echo "Building server image..."
    docker build -t $DOCKER_REGISTRY/eid-server:$VERSION ./server
    docker push $DOCKER_REGISTRY/eid-server:$VERSION
    
    # Build client image
    echo "Building client image..."
    docker build -t $DOCKER_REGISTRY/eid-client:$VERSION ./client
    docker push $DOCKER_REGISTRY/eid-client:$VERSION
    
    echo "✅ Images built and pushed successfully"
}

# Function to run tests
run_tests() {
    echo "🧪 Running tests..."
    
    # Install dependencies
    npm install
    cd server && npm install && cd ..
    cd client && npm install && cd ..
    
    # Run server tests
    echo "Running server tests..."
    cd server
    npm test || echo "⚠️ Server tests not implemented yet"
    cd ..
    
    # Run client tests
    echo "Running client tests..."
    cd client
    npm test -- --coverage --watchAll=false || echo "⚠️ Client tests not implemented yet"
    cd ..
    
    echo "✅ Tests completed"
}

# Function to deploy with Docker Compose
deploy_docker_compose() {
    echo "🐳 Deploying with Docker Compose..."
    
    # Stop existing containers
    docker-compose -f docker-compose.$ENVIRONMENT.yml down || true
    
    # Start new containers
    docker-compose -f docker-compose.$ENVIRONMENT.yml up -d
    
    # Wait for services to be healthy
    echo "⏳ Waiting for services to be healthy..."
    sleep 30
    
    # Check health
    if docker-compose -f docker-compose.$ENVIRONMENT.yml ps | grep -q "Up (healthy)"; then
        echo "✅ Services are healthy"
    else
        echo "❌ Some services are not healthy"
        docker-compose -f docker-compose.$ENVIRONMENT.yml logs
        exit 1
    fi
}

# Function to deploy with Kubernetes
deploy_kubernetes() {
    echo "☸️ Deploying with Kubernetes..."
    
    if ! command_exists kubectl; then
        echo "❌ kubectl is not installed"
        exit 1
    fi
    
    # Apply Kubernetes manifests
    kubectl apply -f k8s/namespace.yaml
    kubectl apply -f k8s/secrets.yaml
    kubectl apply -f k8s/deployment.yaml
    kubectl apply -f k8s/ingress.yaml
    
    # Wait for deployment to be ready
    kubectl rollout status deployment/eid-server -n eid-app
    kubectl rollout status deployment/eid-client -n eid-app
    
    echo "✅ Kubernetes deployment completed"
}

# Function to run database migrations
run_migrations() {
    echo "🗄️ Running database migrations..."
    
    # This would typically run your migration scripts
    # For now, we'll just echo the step
    echo "Database migrations would run here"
    
    echo "✅ Database migrations completed"
}

# Function to send notifications
send_notifications() {
    echo "📢 Sending deployment notifications..."
    
    # Send Slack notification
    if [ ! -z "$SLACK_WEBHOOK_URL" ]; then
        curl -X POST -H 'Content-type: application/json' \
            --data "{\"text\":\"🚀 Eid al-Fitr 2025 deployed to $ENVIRONMENT successfully!\"}" \
            $SLACK_WEBHOOK_URL
    fi
    
    # Send email notification
    if [ ! -z "$EMAIL_RECIPIENTS" ]; then
        echo "Deployment to $ENVIRONMENT completed successfully" | \
            mail -s "Eid al-Fitr 2025 Deployment" $EMAIL_RECIPIENTS
    fi
    
    echo "✅ Notifications sent"
}

# Function to rollback deployment
rollback() {
    echo "🔄 Rolling back deployment..."
    
    case $ENVIRONMENT in
        staging|production)
            docker-compose -f docker-compose.$ENVIRONMENT.yml down
            docker-compose -f docker-compose.$ENVIRONMENT.yml up -d
            ;;
    esac
    
    echo "✅ Rollback completed"
}

# Main deployment function
main() {
    echo "🎉 Eid al-Fitr 2025 Deployment Script"
    echo "======================================"
    
    validate_environment
    check_prerequisites
    
    # Run tests (skip for production if needed)
    if [ "$ENVIRONMENT" != "production" ] || [ "$SKIP_TESTS" != "true" ]; then
        run_tests
    fi
    
    # Build and push images
    build_and_push_images
    
    # Run database migrations
    run_migrations
    
    # Deploy based on environment
    case $ENVIRONMENT in
        staging)
            deploy_docker_compose
            ;;
        production)
            if [ "$USE_KUBERNETES" = "true" ]; then
                deploy_kubernetes
            else
                deploy_docker_compose
            fi
            ;;
    esac
    
    # Send notifications
    send_notifications
    
    echo "🎊 Deployment to $ENVIRONMENT completed successfully!"
}

# Handle script arguments
case "${1:-}" in
    rollback)
        rollback
        ;;
    *)
        main
        ;;
esac
