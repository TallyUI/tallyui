---
'@tallyui/pos': minor
---

Add a shared CSV writer (`toCsv`, `csvFromCells`, `csvCell`) that quotes every cell and guards formula-leading text, as WCPOS v2's reports export does. The register's closures export now uses it, with unchanged output.
