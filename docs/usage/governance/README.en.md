# Maintain, review and verify

[Guide home](../README.en.md)

Use this chapter when changing public framework contracts, reviewing security, or verifying a release. Trace reported behavior to the implementation and evidence relevant to the claim.

## Maintain a public change

[Framework maintenance](framework-maintenance.md) covers impact analysis and updates to callers, templates, settings, Skills, and screenshots. The framework repository and generated apps have their own instructions. Keep their common API contracts in agreement and preserve application-specific rules.

## Review security and recovery

[Security review](security-review.md) follows the actual implementation that handles users, requests, credentials, data, and side effects. Record what triggers each problem, who is affected, and how to verify the correction. State which findings were reproduced and which rely on source inspection.

## Record verification results

[Verification, screenshots and scope](verification.md) explains what unit tests, integration tests, browser tests, and target services can establish. Record the command, environment, outcome, and any checks that could not run.
