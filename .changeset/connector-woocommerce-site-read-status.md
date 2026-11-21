---
'@tallyui/connector-woocommerce': patch
---

The command transport now retries an unreadable `/site` with what the store answered: `status_404` when the WCPOS plugin is missing (so the till's "couldn't find the plugin" notice shows again), `status_<n>` for other errors, `network` or `timeout` with no answer. Only a 2xx without a readable `wcpos_version` stays `store_version_unknown`.
