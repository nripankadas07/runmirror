# Security policy

Cassettes can contain sensitive prompts, tool arguments, paths, outputs, and header metadata. Minimize captured data, configure redaction keys, never use a credential as `runId`, and treat generated artifacts as confidential unless reviewed. Replay divergence values are fingerprinted and diagnostic IDs/paths are redacted when they match configured or recognizable secret shapes; this remains defense in depth, not a guarantee that arbitrary secret formats will be detected.

Report vulnerabilities privately through GitHub Security Advisories with a synthetic cassette and Node version. Never submit real credentials. Supported line: `0.1.x`; no response SLA is promised.
