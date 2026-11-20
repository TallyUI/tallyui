---
'@tallyui/connector-medusa': minor
---
At MedusaPOS plugin contract 4, the Medusa connector's `listOrders` sends `allChannels=true` on the plugin orders route, so register filters and display-number searches read every sales channel, like the admin list. Contract 3 is unchanged and stays scoped to the till's channel (#1125). `MEDUSA_ALL_CHANNELS_PLUGIN_CONTRACT` names the contract.
