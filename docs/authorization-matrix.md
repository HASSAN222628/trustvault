# Authorization matrix (enforced in SQL: `app.access_allows`)
| Operation | Anonymous | Outsider | Reader | Editor | Owner | Admin (non-owner) |
|---|---|---|---|---|---|---|
| See metadata / search hit | ✗ | ✗ | ✔ | ✔ | ✔ | ✗ |
| Download | ✗ | ✗ | ✔ | ✔ | ✔ | ✗ |
| Edit metadata / replace file | ✗ | ✗ | ✗ (403) | ✔ | ✔ | ✗ |
| Delete | ✗ | ✗ | ✗ | ✗ | ✔ | ✗ |
| Grant / revoke | ✗ | ✗ | ✗ | ✗ | ✔ | ✗ |
| See grants | ✗ | ✗ | own only | own only | all | ✗ |
| Upload new document | ✗ | role owner/admin | — | — | ✔ | ✔ (own docs) |
| Read audit | ✗ | own actions | own actions | own actions | own docs' history | ✔ all |
| Change roles | ✗ | ✗ | ✗ | ✗ | ✗ | ✔ (not self) |
Response codes: no access ⇒ 404 `not_found`; visible but insufficient ⇒ 403 `forbidden`.
