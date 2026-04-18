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
