output "k3s_public_ip" {
  description = "Public IPv4 address of the k3s server."
  value       = hcloud_server.k3s.ipv4_address
}

output "k3s_endpoint" {
  description = "Kubernetes API endpoint."
  value       = "https://${hcloud_server.k3s.ipv4_address}:6443"
}

output "server_id" {
  description = "Hetzner Cloud server ID."
  value       = hcloud_server.k3s.id
}

output "ssh_private_key" {
  description = "SSH private key for the k3s server."
  value       = tls_private_key.ssh.private_key_openssh
  sensitive   = true
}

output "post_apply_notice" {
  description = "Post-apply instructions for kubeconfig retrieval."
  value       = <<-EOT
    ============================================================
    K3s cloud-init is still running on the instance.
    Wait ~3 minutes, then retrieve and merge the kubeconfig:

      mkdir -p ~/.ssh ~/.kube
      cd k3s
      terragrunt output -raw ssh_private_key > ~/.ssh/k3s-${var.env}.pem
      chmod 600 ~/.ssh/k3s-${var.env}.pem

      K3S_IP=$(terragrunt output -raw k3s_public_ip)
      KUBE_CONTEXT=hetzner-${var.env}-k3s
      KUBE_FILE="$HOME/.kube/$${KUBE_CONTEXT}.yaml"
      BASE_KUBECONFIG="$${KUBECONFIG:-$HOME/.kube/config}"

      ssh -o StrictHostKeyChecking=no -i ~/.ssh/k3s-${var.env}.pem root@$K3S_IP \
        'cat /etc/rancher/k3s/k3s.yaml' \
        | sed \
            -e "s/127.0.0.1/$${K3S_IP}/g" \
            -e "s/name: default$/name: $${KUBE_CONTEXT}/g" \
            -e "s/current-context: default$/current-context: $${KUBE_CONTEXT}/g" \
            -e "s/cluster: default$/cluster: $${KUBE_CONTEXT}/g" \
            -e "s/user: default$/user: $${KUBE_CONTEXT}/g" \
        > "$KUBE_FILE"

      KUBECONFIG="$${BASE_KUBECONFIG}:$${KUBE_FILE}" \
        kubectl config view --flatten > ~/.kube/config.merged \
        && mv ~/.kube/config.merged ~/.kube/config

      export KUBECONFIG="$HOME/.kube/config"
      kubectl config use-context "$${KUBE_CONTEXT}"
      kubectl get nodes
    ============================================================
  EOT
}
