# hetzner

## Prerequisites

### Hetzner Cloud API token
1. Create a project at [Hetzner Cloud Console](https://console.hetzner.cloud)
2. Go to **Security** > **API Tokens** > **Generate API Token**
3. Select **Read & Write** permissions
4. Copy the token

### State bucket
The S3 state bucket (`atlas-design-terraform-state`) must already exist (shared with AWS environments).
AWS credentials must be available for the S3 backend (e.g. `~/.aws/credentials` or `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` env vars).

### Object Storage credentials (for the `object_storage` stack)
1. In [Hetzner Console](https://console.hetzner.com/), open the project
2. Go to **Object Storage** > **Manage credentials** > **Generate credentials**
3. Copy the access key and secret key

## Deploy

```bash
export HCLOUD_TOKEN="your-hetzner-api-token"

# Only needed when deploying the object_storage stack:
export MINIO_USER="your-s3-access-key"
export MINIO_PASSWORD="your-s3-secret-key"

cd minimal
terragrunt run-all init
terragrunt run --all apply --non-interactive
```

## Post-deploy: retrieve and merge kubeconfig (~3 min)

Wait for cloud-init to finish, then fetch the kubeconfig into a dedicated file,
rename the default k3s objects to a unique context name, and merge it into your
active kubeconfig set.

This flow is idempotent:

- it overwrites the dedicated Hetzner kubeconfig file on each run
- it avoids collisions with older `hetzner-minimal` entries
- it preserves existing contexts from your current `KUBECONFIG` or `~/.kube/config`

```bash
mkdir -p ~/.ssh ~/.kube

cd k3s
terragrunt output -raw ssh_private_key > ~/.ssh/k3s-minimal.pem
chmod 600 ~/.ssh/k3s-minimal.pem

K3S_IP=$(terragrunt output -raw k3s_public_ip)
KUBE_CONTEXT=hetzner-minimal-k3s
KUBE_FILE="$HOME/.kube/${KUBE_CONTEXT}.yaml"
BASE_KUBECONFIG="${KUBECONFIG:-$HOME/.kube/config}"

ssh -o StrictHostKeyChecking=no -i ~/.ssh/k3s-minimal.pem root@$K3S_IP \
  'cat /etc/rancher/k3s/k3s.yaml' \
  | sed \
      -e "s/127.0.0.1/${K3S_IP}/g" \
      -e "s/name: default$/name: ${KUBE_CONTEXT}/g" \
      -e "s/current-context: default$/current-context: ${KUBE_CONTEXT}/g" \
      -e "s/cluster: default$/cluster: ${KUBE_CONTEXT}/g" \
      -e "s/user: default$/user: ${KUBE_CONTEXT}/g" \
  > "$KUBE_FILE"

KUBECONFIG="${BASE_KUBECONFIG}:$KUBE_FILE" \
  kubectl config view --flatten > ~/.kube/config.merged \
  && mv ~/.kube/config.merged ~/.kube/config

export KUBECONFIG="$HOME/.kube/config"
kubectl config use-context "${KUBE_CONTEXT}"
kubectl get nodes
```

If you previously exported a custom `KUBECONFIG`, keep using the merged file for
plain `kubectl` commands in the current shell:

```bash
export KUBECONFIG="$HOME/.kube/config"
```

If you destroy and recreate the cluster later, rerun the same commands above.
They will refresh the dedicated Hetzner kubeconfig file and keep your other
contexts accessible.

## SSH access

```bash
ssh -i ~/.ssh/k3s-minimal.pem root@$K3S_IP
```

## Deploy the game to k3s

This environment only provisions the Hetzner infrastructure and the single-node
k3s cluster. The game deployment is handled separately with manual Kubernetes
manifests from the repo root under `k8s/`.

### Public reachability

- Public IP: the Hetzner k3s server IPv4 from `terragrunt output -raw k3s_public_ip`
- Public hostname: `clipped.chat`
- Ingress: `ingress-nginx` bound directly to the node on ports `80` and `443`
- TLS: Let's Encrypt via `cert-manager`

### 1. Build and push the Docker image

From the repo root:

```bash
./scripts/publish-image.sh
```

### 2. Point DNS to the Hetzner node

From `minimal/k3s`:

```bash
terragrunt output -raw k3s_public_ip
```

Create a Porkbun DNS `A` record for `clipped.chat` pointing to that IP.

### 3. Install ingress-nginx

From the repo root:

```bash
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm repo update
helm upgrade --install ingress-nginx ingress-nginx/ingress-nginx \
  --namespace ingress-nginx \
  --create-namespace \
  -f k8s/helm/ingress-nginx-values.yaml
kubectl rollout status deployment/ingress-nginx-controller -n ingress-nginx
```

The Hetzner firewall already allows inbound `80` and `443`, so once the
controller is ready the node public IP can serve web traffic directly.

### 4. Install cert-manager

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

Apply the ACME issuer:

```bash
kubectl apply -f k8s/cluster-issuer.yaml
```

### 5. Apply the app manifests

```bash
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml
kubectl apply -f k8s/ingress.yaml
```

### 6. Verify

```bash
kubectl rollout status deployment/clipped -n clipped
kubectl get ingress -n clipped
kubectl get certificate -n clipped
curl -sS http://clipped.chat/state
curl -sS https://clipped.chat/state
```

`clipped.chat` must resolve to the Hetzner node public IPv4 before Let's
Encrypt can issue `clipped-chat-tls`.

Once the certificate is issued, the game should be reachable at:

```text
https://clipped.chat
```

## Sync data to Object Storage

After the `object_storage` stack is applied, sync data from the VM volume to the bucket using `mc` (MinIO CLI):

```bash
ssh -i ~/.ssh/k3s-minimal.pem root@$K3S_IP

curl -O https://dl.min.io/client/mc/release/linux-amd64/mc
chmod +x mc && mv mc /usr/local/bin/

mc alias set hetzner https://nbg1.your-objectstorage.com <ACCESS_KEY> <SECRET_KEY>
mc mirror /mnt/HC_Volume_<id>/<data-dir> hetzner/<bucket>/<data-dir>
mc ls hetzner/<bucket>/<data-dir> --summarize
```

## Destroy

```bash
cd minimal
terragrunt run --all destroy
```
