# Agent request contract

[agent-tools.schema.json](agent-tools.schema.json) is the proposed internal contract for draft-only agent requests (JSON Schema 2020-12, version 1.0). It is a planning schema, not a live endpoint. Authentication supplies the principal and scopes; a request can never choose its own authority, and no publish or send operation exists.

| Tool             | Purpose                                                               | Write?                      |
| ---------------- | --------------------------------------------------------------------- | --------------------------- |
| `briefs.list`    | List assigned briefs (bounded pagination)                             | No                          |
| `items.read`     | Read one assigned editorial item (server applies scope and redaction) | No                          |
| `drafts.propose` | Propose a draft for a brief with source IDs                           | Yes, needs `idempotencyKey` |
| `drafts.revise`  | Revise a draft bound to `expectedRevision`                            | Yes, needs `idempotencyKey` |
| `social.propose` | Propose channel copy bound to a review snapshot                       | Yes, needs `idempotencyKey` |
| `jobs.read`      | Read a job's plain-language state                                     | No                          |

## Executable examples

[examples/valid/](examples/valid/) and [examples/invalid/](examples/invalid/) hold example requests. `pnpm validate` asserts that the schema accepts every valid example and rejects every invalid one. Each file records `why` and the acceptance scenarios it supports.

| Invalid example                                                                                           | Rejected because                                          | Scenario     |
| --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ------------ |
| `publish-tool.json`                                                                                       | `posts.publish` is not a tool                             | AT-04        |
| `draft-sets-published-status.json`                                                                        | Draft content cannot carry `status`                       | AT-04        |
| `subscriber-export-tool.json`                                                                             | `members.export` is not a tool                            | AT-06        |
| `client-supplied-principal.json`                                                                          | Requests cannot carry `principalId` or `scopes`           | AT-07        |
| `write-without-idempotency-key.json`                                                                      | Writes need a durable idempotency key                     | AT-12, AT-13 |
| `revise-without-expected-revision.json`                                                                   | Revisions must bind to a revision                         | AT-08        |
| `social-without-review-snapshot.json`                                                                     | Social copy must derive from a reviewed snapshot          | AT-09        |
| `unbounded-page-size.json`, `unknown-argument.json`, `wrong-schema-version.json`, `short-request-id.json` | Bounds, argument allowlists, version and request ID rules | —            |

**Schema validation is only the first layer.** These examples prove the contract's _shape_ rejects dangerous requests. Authorization (principal, scopes, object access, revocation), redaction, content sanitization, idempotency storage and revision checks happen server-side in the gateway (SC-009) and are verified by the acceptance scenarios, which remain UNRUN until the gateway exists.

Known gaps for a v1.1 proposal (docs/KIT_AUDIT.md K-05, K-06): suggested tags and metadata, per-tool response schemas, and redeclaring `idempotencyKey` in the conditional branches.
