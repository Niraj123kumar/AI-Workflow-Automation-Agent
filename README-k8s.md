# Kubernetes Deployment Guide

## Prerequisites
- minikube
- kubectl
- Docker

## Setup Commands

1. Start minikube with sufficient resources:
   ```bash
   minikube start --cpus=4 --memory=8192
   ```

2. Point your shell to minikube's Docker daemon:
   ```bash
   eval $(minikube docker-env)
   ```

3. Build images locally inside minikube:
   ```bash
   docker build -t backend:latest ./backend
   docker build -t worker:latest ./worker
   docker build -t frontend:latest ./frontend
   ```

4. Apply manifests:
   ```bash
   kubectl apply -f k8s/
   ```

5. Verify deployment:
   ```bash
   kubectl get pods -w
   ```

6. Access the application:
   ```bash
   minikube tunnel
   ```
   Open `http://localhost` in your browser.
