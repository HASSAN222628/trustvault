# Edge Function API (`POST /functions/v1/<name>`, `Authorization: Bearer <user JWT>`)

Success `{data, request_id}`; error `{error:{code,message,request_id}}`. Codes: 400 invalid_request · 401 unauthenticated · 403 forbidden · 404 not_found · 413 too_large · 415 unsupported_type · 503 audit_unavailable · 500 internal_error.
| Function | Body | Rule |
|---|---|---|
| document-upload | multipart `file,title,description,category` | role owner/admin; validates signature/size; 201 `{id,…}` |
| document-download | `{document_id, disposition: "inline"|"attachment"}` | owner/read/edit may preview inline; owner/edit may download; audited and integrity checked |
| document-edit | JSON `{document_id,title?,description?,category?}` or multipart `file` with `?document_id=` | owner/edit |
| document-delete | `{document_id}` | owner only |
| document-grant | `{document_id,grantee_email,permission}` | owner only; unknown email ⇒ 404 `user_not_found` (owners can learn whether an email is registered) |
| document-revoke | `{document_id,user_id}` | owner only |
| admin-audit-query | `{limit,offset,action?,outcome?,document_id?,actor_id?,verify_chain?}` | admin; read-only; RLS-scoped client |
| admin-set-role | `{user_id,role}` | admin; not self |
| admin-manage-user | `{user_id,action}` | admin; ban/unban or permanently delete a non-admin account; deletion is refused if it owns documents or is referenced by sharing history |
| `rpc_search_share_recipients` | `{p_query}` | authenticated; searches up to 10 matching registered profiles (2–120 characters), excluding the caller |
Document mutations and audit logging use the service role. Search and admin-query RPCs use the authenticated caller.
