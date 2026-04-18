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

Apply the upstream bare-metal manifest, then patch the controller to use the
node network directly:

```bash
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.12.1/deploy/static/provider/baremetal/deploy.yaml
kubectl apply -f k8s/ingress-nginx-hostnetwork-patch.yaml
kubectl rollout status deployment/ingress-nginx-controller -n ingress-nginx
```

The firewall already allows inbound ports `80` and `443`, so once the
controller is ready, the node public IP can answer HTTP and HTTPS traffic.

## 4. Install cert-manager

```bash
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.17.2/cert-manager.yaml
kubectl rollout status deployment/cert-manager -n cert-manager
kubectl rollout status deployment/cert-manager-webhook -n cert-manager
kubectl rollout status deployment/cert-manager-cainjector -n cert-manager
```

Update `k8s/cluster-issuer.yaml` and replace `your-email@example.com` with the
real ACME contact email, then apply:

```bash
kubectl apply -f k8s/cluster-issuer.yaml
```

## 5. Deploy the app

Apply the namespace, app, service, and ingress:

```bash
kubectl apply -f k8s/namespace.yaml
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
