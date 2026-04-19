#!/bin/bash 
set -e 
 
 echo "======================================" 
 echo " AI Workflow Agent — Kubernetes Demo" 
 echo "======================================" 
 
 echo "" 
 echo "[1/6] Starting Minikube..." 
 minikube start --cpus=4 --memory=8192 
 
 echo "" 
 echo "[2/6] Pointing Docker to Minikube registry..." 
 eval $(minikube docker-env) 
 
 echo "" 
 echo "[3/6] Building images..." 
 docker build -t backend:latest ./backend 
 docker build -t worker:latest ./worker 
 docker build -t frontend:latest ./frontend 
 
 echo "" 
 echo "[4/6] Applying Kubernetes manifests..." 
 kubectl apply -f k8s/ 
 
 echo "" 
 echo "[5/6] Waiting for all pods to be ready..." 
 kubectl wait --for=condition=ready pod --all --timeout=180s 
 
 echo "" 
 echo "[6/6] Starting tunnel for LoadBalancer access..." 
 minikube tunnel & 
 
 echo "" 
 echo "======================================" 
 echo " Stack is running on Kubernetes" 
 echo "======================================" 
 kubectl get pods 
 echo "" 
 echo "Frontend:   http://localhost:3000" 
 echo "API docs:   http://localhost:8000/docs" 
 echo "Grafana:    http://localhost:3001" 
 echo "Prometheus: http://localhost:9090" 
 echo "" 
 echo "To watch pods: kubectl get pods -w" 
 echo "To view logs:  kubectl logs -f deployment/backend" 
