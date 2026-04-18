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

Wait for cloud-init to finish, then fetch the kubeconfig, rename the `default` context to `hetzner-minimal`, and merge it into your main kubeconfig:

```bash
cd k3s
terragrunt output -raw ssh_private_key > ~/.ssh/k3s-minimal.pem
chmod 600 ~/.ssh/k3s-minimal.pem

K3S_IP=$(terragrunt output -raw k3s_public_ip)

ssh -o StrictHostKeyChecking=no -i ~/.ssh/k3s-minimal.pem root@$K3S_IP \
  'sed "s/127.0.0.1/'$K3S_IP'/g" /etc/rancher/k3s/k3s.yaml' \
  | sed 's/: default$/: hetzner-minimal/g' \
  > ~/.kube/k3s-minimal.yaml

KUBECONFIG=~/.kube/config:~/.kube/k3s-minimal.yaml \
  kubectl config view --flatten > ~/.kube/config.merged \
  && mv ~/.kube/config.merged ~/.kube/config

kubectl config use-context hetzner-minimal
kubectl get nodes
```

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
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.12.1/deploy/static/provider/baremetal/deploy.yaml
kubectl apply -f k8s/ingress-nginx-hostnetwork-patch.yaml
kubectl rollout status deployment/ingress-nginx-controller -n ingress-nginx
```

The Hetzner firewall already allows inbound `80` and `443`, so once the
controller is ready the node public IP can serve web traffic directly.

### 4. Install cert-manager

```bash
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.17.2/cert-manager.yaml
kubectl rollout status deployment/cert-manager -n cert-manager
kubectl rollout status deployment/cert-manager-webhook -n cert-manager
kubectl rollout status deployment/cert-manager-cainjector -n cert-manager
```

Update the ACME email in `k8s/cluster-issuer.yaml`, then apply:

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
