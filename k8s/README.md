# Kubernetes Deployment

This directory contains the manual deployment assets for running the game on the
single-node Hetzner k3s cluster.

## What reaches the public internet

- The Hetzner k3s server public IPv4 is the public IP
- `ingress-nginx` binds directly to ports `80` and `443` on that node via
  `hostNetwork`
- Porkbun DNS points `clipped.chat` to that node IP
- The `Ingress` routes `clipped.chat` to the `clipped` service
- `cert-manager` obtains and renews the TLS certificate with Let's Encrypt

## 1. Build and publish the image

```bash
./scripts/publish-image.sh
```

For repeatable deploys, also publish an immutable tag:

```bash
./scripts/publish-image.sh
```

The script publishes both:

- `docker.io/bandpassednoise/clipped:latest`
- `docker.io/bandpassednoise/clipped:<git-sha>`

## 2. Point DNS at the Hetzner node

Get the public IPv4 from the Hetzner environment:

```bash
cd cloud_infrastructure/environments/hetzner/minimal/k3s
terragrunt output -raw k3s_public_ip
```

In Porkbun, create this DNS record:

- Type: `A`
- Host: `@`
- Answer: `<hetzner-node-ip>`

Wait until `clipped.chat` resolves publicly before requesting certificates.

## 3. Install ingress-nginx

Install the chart with `hostNetwork` enabled so the controller binds directly
to ports `80` and `443` on the Hetzner node:

```bash
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm repo update
helm upgrade --install ingress-nginx ingress-nginx/ingress-nginx \
  --namespace ingress-nginx \
  --create-namespace \
  -f k8s/helm/ingress-nginx-values.yaml
kubectl rollout status deployment/ingress-nginx-controller -n ingress-nginx
```

The firewall already allows inbound ports `80` and `443`, so once the
controller is ready, the node public IP can answer HTTP and HTTPS traffic.

## 4. Install cert-manager

```bash
helm repo add jetstack https://charts.jetstack.io
helm repo update
helm upgrade --install cert-manager jetstack/cert-manager \
  --namespace cert-manager \
  --create-namespace \
  -f k8s/helm/cert-manager-values.yaml
kubectl rollout status deployment/cert-manager -n cert-manager
kubectl rollout status deployment/cert-manager-webhook -n cert-manager
kubectl rollout status deployment/cert-manager-cainjector -n cert-manager
```

Then apply the ACME issuer:

```bash
kubectl apply -f k8s/cluster-issuer.yaml
```

## 5. Deploy the app

Apply the namespace, app, service, and ingress:

```bash
kubectl apply -f k8s/namespace.yaml
# Copy k8s/openai-api.secret.example.yaml to k8s/openai-api.secret.yaml,
# set the real key, then:
kubectl apply -f k8s/openai-api.secret.yaml
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml
kubectl apply -f k8s/ingress.yaml
```

Watch the rollout:

```bash
kubectl rollout status deployment/clipped -n clipped
kubectl get ingress -n clipped
kubectl get certificate -n clipped
```

## 6. Verify

```bash
curl -sS http://clipped.chat/state
curl -sS https://clipped.chat/state
```

Open `https://clipped.chat` in the browser once the certificate is issued.

## Notes

- The app state is in memory only. Restarting the pod resets the room.
- The ingress timeout annotations in `ingress.yaml` keep SSE connections open
  longer for `/events`.
- This is a single-node deployment. If you later add nodes or a managed
  load balancer, the ingress exposure strategy should change.
- `clipped.chat` must resolve to the Hetzner node public IPv4 before
  Let's Encrypt can issue `clipped-chat-tls`.

## GitHub Actions deploy

The repo includes [deploy.yml](/Users/doom/Documents/_projects/clipped/.github/workflows/deploy.yml:1)
to build and deploy on every push to `main`.

Required GitHub repository secrets:

- `DOCKERHUB_USERNAME`: Docker Hub username with push access to `bandpassednoise/clipped`
- `DOCKERHUB_TOKEN`: Docker Hub access token or password
- `KUBE_CONFIG`: the full contents of a kubeconfig that can reach the Hetzner cluster
- `OPENAI_API_KEY`: runtime OpenAI API key injected into the `openai-api` Kubernetes secret

Manual secret manifest files matching `k8s/*.secret.yaml` are gitignored. Use
[openai-api.secret.example.yaml](/Users/doom/Documents/_projects/clipped/k8s/openai-api.secret.example.yaml:1)
as the template for your local `k8s/openai-api.secret.yaml`.

The workflow:

- builds and pushes `linux/amd64` images tagged as `latest` and `<git-sha>`
- creates or updates the `openai-api` Kubernetes secret in namespace `clipped`
- applies `k8s/namespace.yaml`, `k8s/service.yaml`, `k8s/ingress.yaml`, and `k8s/deployment.yaml`
- updates the deployment image to the pushed SHA tag
- waits for the rollout to complete
