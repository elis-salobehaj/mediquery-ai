# Docker Deployment Guide

> **📌 Note**: For standard development workflow, see **[DEVELOPMENT.md](DEVELOPMENT.md)**. This guide covers advanced Docker-specific deployment scenarios.

Complete guide for running the Mediquery AI Data Agent with Docker Compose.

## Quick Start

### 1. Prerequisites

- **Docker** and **Docker Compose** installed:
  - **Linux**: Follow [Docker Engine installation](https://docs.docker.com/engine/install/) and [Docker Compose installation](https://docs.docker.com/compose/install/)
  - **Windows/Mac**: [Docker Desktop](https://www.docker.com/products/docker-desktop) (includes Docker Compose)
- **8GB RAM minimum** (for Ollama model)
- **NVIDIA GPU** (optional, for faster inference)

### 2. Setup Environment

```bash
# Copy environment template
cp .env.example .env


# Edit .env with your settings
# For local model (free): USE_LOCAL_MODEL=true
# For cloud API: USE_LOCAL_MODEL=false and add GEMINI_API_KEY or ANTHROPIC_API_KEY
```

### 3. Start All Services

```bash
# Build and start all containers
docker compose up -d --build

# View logs
docker compose logs -f

# Check status
docker compose ps
```

### 4. Pull Ollama Model (First Time Only)

```bash
# Pull the Qwen2.5 Coder model (~4.7GB)
docker exec -it mediquery-ai-ollama ollama pull qwen2.5-coder:7b

# Verify model is installed
docker exec -it mediquery-ai-ollama ollama list
```

### 5. Access the Application

- **Frontend**: http://localhost:3000
- **Backend API**: via frontend proxy at `http://localhost:3000/api/v1/*`
- **API Docs**: http://localhost:3000/api/docs
- **Ollama**: http://localhost:11434
- **PostgreSQL**: http://localhost:5432

---

---

## 🌐 Remote Access (SSH Port Forwarding)

Running Docker containers on a remote server? Access them locally using SSH port forwarding:

```bash
# Linux/Mac/Windows
ssh -L 3000:localhost:3000 -L 11434:localhost:11434 username@server_ip
```

This forwards:

- **Port 3000**: Frontend (React/Nginx)
- **Port 11434**: Ollama (optional, for model management)

After connecting, access on your local machine:

- Frontend: http://localhost:3000
- Ollama: http://localhost:11434

**Keep the SSH session open** while using the application.

## Services Overview

### 🤖 Ollama (Local LLM)

- **Container**: `mediquery-ai-ollama`
- **Port**: 11434
- **Volume**: `ollama_data` (persists models)
- **Model**: qwen2.5-coder:7b

### 🔧 Backend (TypeScript — Active)

- **Container**: `mediquery-backend`
- **Port**: 8001 (internal Docker network only; not published to host)
- **Volumes**:
  - `./backend` → `/app` (code)

### 🧱 Migrator (TypeScript Drizzle Runtime)

- **Container**: `mediquery-migrator`
- **Image Build**: `migrator.Dockerfile`
- **Package Source**: `packages/db`
- **Role**: Applies PostgreSQL migrations before backend startup

### 🎨 Frontend (React + Nginx)

- **Container**: `mediquery-frontend`
- **Port**: 3000
- **Built with**: Multi-stage Docker build

---

## Common Commands

### Start/Stop Services

```bash
# Start all services
docker compose up -d

# Stop all services
docker compose down

# Restart a specific service
docker compose restart backend

# Run migrations on demand
docker compose run --rm migrator

# View logs
docker compose logs -f backend
docker compose logs -f migrator
docker compose logs -f ollama
```

### Manage Ollama Models

```bash
# List installed models
docker exec -it mediquery-ai-ollama ollama list

# Pull a different model
docker exec -it mediquery-ai-ollama ollama pull phi3:mini

# Remove a model
docker exec -it mediquery-ai-ollama ollama rm qwen2.5:3b

# Test model
docker exec -it mediquery-ai-ollama ollama run qwen2.5:3b "SELECT * FROM patients LIMIT 1"
```

### Development Mode

```bash
# Backend hot-reload (already configured)
# Edit files in ./backend and changes auto-reload

# Frontend rebuild
docker compose build frontend
docker compose up -d frontend

# View backend logs
docker compose logs -f backend
```

### Database & Data

```bash
# Access backend container
docker exec -it mediquery-backend bash

# Verify database wait_time
docker exec -it mediquery-postgres psql -U mediquery -d mediquery_tokens -c "\dt"

# Backup data (PostgreSQL)
docker exec mediquery-postgres pg_dump -U mediquery mediquery_tokens > backup.sql
docker cp mediquery-backend:/app/data ./backup/
```

---

## Configuration

### Environment Variables (.env)

```bash
# Required for cloud mode
GEMINI_API_KEY=your_api_key_here

# Chat history retention (hours)
CHAT_HISTORY_RETENTION_HOURS=24

# Local model settings
USE_LOCAL_MODEL=true
LOCAL_MODEL_NAME=qwen2.5-coder:7b
```

### Switch Between Local and Cloud

**Use Local Ollama (Free):**

```bash
# In .env
USE_LOCAL_MODEL=true

# Restart backend
docker compose restart backend
```

**Use Google Gemini (Cloud):**

```bash
# In .env
USE_LOCAL_MODEL=false
GEMINI_API_KEY=your_actual_key

# Restart backend
docker compose restart backend
```

---

## GPU Support (Optional)

For faster Ollama inference with NVIDIA GPU:

### 1. Install NVIDIA Container Toolkit

```bash
# Ubuntu/Linux
distribution=$(. /etc/os-release;echo $ID$VERSION_ID)
curl -s -L https://nvidia.github.io/nvidia-docker/gpgkey | sudo apt-key add -
curl -s -L https://nvidia.github.io/nvidia-docker/$distribution/nvidia-docker.list | sudo tee /etc/apt/sources.list.d/nvidia-docker.list
sudo apt-get update && sudo apt-get install -y nvidia-container-toolkit
sudo systemctl restart docker
```

### 2. Uncomment GPU Section in docker-compose.yml

```yaml
ollama:
  deploy:
    resources:
      reservations:
        devices:
          - driver: nvidia
            count: 1
            capabilities: [gpu]
```

### 3. Restart Services

```bash
docker compose down
docker compose up -d
```

---

## Troubleshooting

### Ollama Model Not Found

The container will attempt to pull `qwen3:latest`, `qwen2.5-coder:7b`, `sqlcoder:7b`, and `llama3.1` automatically on startup.
If you need another model:

```bash
# Pull the model manually
docker exec -it mediquery-ai-ollama ollama pull llama3:8b

# Check installed models
docker exec -it mediquery-ai-ollama ollama list
```

### Backend Can't Connect to Ollama

```bash
# Check if Ollama is running
docker compose ps ollama

# Check Ollama health
docker exec -it mediquery-ai-ollama curl http://localhost:11434/api/tags

# Restart services in order
docker compose restart ollama
docker compose restart backend
```

### Frontend Not Loading

```bash
# Rebuild frontend
docker compose build frontend
docker compose up -d frontend

# Check logs
docker compose logs frontend
```

### Port Already in Use

```bash
# Change ports in docker-compose.yml
ports:
  - "3001:80"  # Frontend (was 3000)
  - "8001:8001"  # Backend (was 8001)
```

### Out of Memory

```bash
# Use a smaller model
docker exec -it mediquery-ai-ollama ollama pull gemma2:2b

# Update .env
LOCAL_MODEL_NAME=gemma2:2b

# Restart backend
docker compose restart backend
```

---

## Production Deployment

### 1. Build Optimized Images

```bash
# Build without cache
docker compose build --no-cache

# Use production .env
cp .env.production .env
```

### 2. Security Hardening

```bash
# Use secrets for API keys (Docker Swarm/Kubernetes)
# Enable HTTPS with reverse proxy (nginx/traefik)
# Set resource limits in docker-compose.yml
```

### 3. Resource Limits

Add to docker-compose.yml:

```yaml
services:
  ollama:
    deploy:
      resources:
        limits:
          memory: 8G
          cpus: "4"
  backend:
    deploy:
      resources:
        limits:
          memory: 2G
          cpus: "2"
```

---

## Backup & Restore

### Backup

```bash
# Create backup directory
mkdir -p backup

# Backup volumes
docker run --rm -v ollama_data:/data -v $(pwd)/backup:/backup alpine tar czf /backup/ollama_data.tar.gz -C /data .

# Backup Database (PostgreSQL)
docker exec -t mediquery-postgres pg_dump -U mediquery mediquery_tokens > backup/mediquery_tokens.sql

# Backup CSV data
docker cp mediquery-backend:/app/data ./backup/
```

### Restore

```bash
# Restore Ollama data
docker run --rm -v ollama_data:/data -v $(pwd)/backup:/backup alpine tar xzf /backup/ollama_data.tar.gz -C /data

# Restore Database
cat backup/mediquery_tokens.sql | docker exec -i mediquery-postgres psql -U mediquery mediquery_tokens

# Restart services
docker compose restart
```

---

## Monitoring

### View Resource Usage

```bash
# All containers
docker stats

# Specific container
docker stats mediquery-ai-ollama
```

### Health Checks

```bash
# Check all services
docker compose ps

# Test endpoints
curl http://localhost:11434/api/tags
curl http://localhost:3000
```

---

## Clean Up

```bash
# Stop and remove containers
docker compose down

# Remove volumes (WARNING: deletes data)
docker compose down -v

# Remove images
docker compose down --rmi all

# Full cleanup
docker system prune -a --volumes
```

---

## Benefits of Docker Deployment

✅ **Isolated Environment** - No conflicts with system packages
✅ **Easy Setup** - One command to start everything
✅ **Consistent** - Works the same on any OS
✅ **Portable** - Easy to deploy anywhere
✅ **Scalable** - Can add more services easily
✅ **Version Control** - Infrastructure as code

---

## Next Steps

1. ✅ Start services: `docker compose up -d`
2. ✅ Pull model: `docker exec -it mediquery-ai-ollama ollama pull qwen2.5:3b`
3. ✅ Access app: http://localhost:3000
4. ✅ Test queries and visualizations
5. ✅ Monitor logs: `docker compose logs -f`

**Your mediquery AI Data Agent is now running in Docker!** 🚀
