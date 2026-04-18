output "network_id" {
  value = hcloud_network.main.id
}

output "subnet_id" {
  value = hcloud_network_subnet.main.id
}

output "firewall_id" {
  value = hcloud_firewall.main.id
}
