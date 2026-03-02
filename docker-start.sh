#!/bin/bash
# Quick Start Script for Docker Deployment (Linux/Mac)

echo "========================================="
echo "  Mediquery AI Data Agent - Docker Setup"
echo "========================================="
echo ""

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed"
    echo "Please install Docker from: https://www.docker.com/products/docker-desktop"
    exit 1
fi
echo "✓ Docker is installed"

# Check if Docker Compose is available
if ! docker compose version &> /dev/null; then
    echo "❌ Docker Compose is not available"
    exit 1
fi
echo "✓ Docker Compose is available"

echo ""

# Copy environment file if it doesn't exist
if [ ! -f ".env" ]; then
    echo "Creating .env file from template..."
    cp .env.docker .env
    echo "✓ .env file created"
    echo ""
    echo "⚠️  Please edit .env and configure:"
    echo "   - USE_LOCAL_MODEL=true (for free local model)"
    echo "   - Or set USE_LOCAL_MODEL=false and add GEMINI_API_KEY or ANTHROPIC_API_KEY for cloud mode"
    echo ""
    read -p "Press Enter to continue..."
fi

# Check if using local model (handle inline comments)
USE_LOCAL=$(grep "USE_LOCAL_MODEL" .env | head -n 1 | cut -d '#' -f1 | cut -d '=' -f2 | xargs)

echo "Starting Docker services..."
echo ""

if [ "$USE_LOCAL" = "true" ]; then
    echo "🤖 Local model mode detected - starting with Ollama..."
    docker compose --profile local-model up -d --build
else
    echo "☁️  Cloud mode detected - starting without Ollama..."
    docker compose up -d --build
fi

echo ""
echo "========================================="
echo "  Setup Complete! 🚀"
echo "========================================="
echo ""
echo "Services:"
echo "  Frontend:  http://localhost:3000"
echo "  Backend:   http://localhost:8000"
echo "  API Docs:  http://localhost:8000/docs"
if [ "$USE_LOCAL" = "true" ]; then
    echo "  Ollama:    http://localhost:11434"
fi
echo ""
echo "Useful commands:"
echo "  docker compose logs -f          # View logs"
echo "  docker compose ps               # Check status"
echo "  docker compose down             # Stop all services"
echo "  docker compose restart backend  # Restart backend"
echo ""
echo "Happy querying! 🎉"
