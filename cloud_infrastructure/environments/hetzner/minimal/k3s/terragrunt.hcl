include "root" {
  path = find_in_parent_folders("root.hcl")
}

dependency "network" {
  config_path = "../network"
  mock_outputs_allowed_terraform_commands = ["init", "fmt", "validate", "plan"]
  mock_outputs = {
    network_id  = 0
    firewall_id = 0
  }
}

inputs = {
  network_id  = dependency.network.outputs.network_id
  firewall_id = dependency.network.outputs.firewall_id
}
