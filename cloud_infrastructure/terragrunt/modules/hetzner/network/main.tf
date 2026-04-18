resource "hcloud_network" "main" {
  name     = "${var.env}-network"
  ip_range = var.cidr
}

resource "hcloud_network_subnet" "main" {
  network_id   = hcloud_network.main.id
  type         = "cloud"
  network_zone = var.region
  ip_range     = cidrsubnet(var.cidr, 8, 0)
}

resource "hcloud_firewall" "main" {
  name = "${var.env}-firewall"

  rule {
    description = "SSH"
    direction   = "in"
    protocol    = "tcp"
    port        = "22"
    source_ips  = ["0.0.0.0/0", "::/0"]
  }

  rule {
    description = "HTTP/HTTPS"
    direction   = "in"
    protocol    = "tcp"
    port        = "80-443"
    source_ips  = ["0.0.0.0/0", "::/0"]
  }

  rule {
    description = "Kubernetes API"
    direction   = "in"
    protocol    = "tcp"
    port        = "6443"
    source_ips  = ["0.0.0.0/0", "::/0"]
  }

  rule {
    description = "NodePort services"
    direction   = "in"
    protocol    = "tcp"
    port        = "30000-40000"
    source_ips  = ["0.0.0.0/0", "::/0"]
  }

  rule {
    description = "All outbound TCP"
    direction   = "out"
    protocol    = "tcp"
    port        = "any"
    destination_ips = ["0.0.0.0/0", "::/0"]
  }

  rule {
    description = "All outbound UDP"
    direction   = "out"
    protocol    = "udp"
    port        = "any"
    destination_ips = ["0.0.0.0/0", "::/0"]
  }

  rule {
    description = "All outbound ICMP"
    direction   = "out"
    protocol    = "icmp"
    destination_ips = ["0.0.0.0/0", "::/0"]
  }
}
