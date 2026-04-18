resource "tls_private_key" "ssh" {
  algorithm = "ED25519"
}

resource "hcloud_ssh_key" "k3s" {
  name       = "${var.env}-k3s"
  public_key = tls_private_key.ssh.public_key_openssh
}

resource "random_password" "k3s_token" {
  length  = 48
  special = false
}

resource "hcloud_volume" "data" {
  name     = "${var.env}-k3s-data"
  size     = var.data_volume_size
  location = var.location
  format   = "ext4"

  labels = {
    env = var.env
  }
}

resource "hcloud_volume_attachment" "data" {
  volume_id = hcloud_volume.data.id
  server_id = hcloud_server.k3s.id
  automount = true
}

resource "hcloud_server" "k3s" {
  name         = "${var.env}-k3s-server"
  server_type  = var.k3s_server_type
  location     = var.location
  image        = "ubuntu-24.04"
  ssh_keys     = [hcloud_ssh_key.k3s.id]
  firewall_ids = [var.firewall_id]

  network {
    network_id = var.network_id
  }

  user_data = templatefile("${path.module}/user_data.sh.tftpl", {
    k3s_version       = var.k3s_version
    k3s_token         = random_password.k3s_token.result
    data_volume_mount = var.data_volume_mount
  })

  public_net {
    ipv4_enabled = true
    ipv6_enabled = true
  }

  labels = {
    env = var.env
  }
}
