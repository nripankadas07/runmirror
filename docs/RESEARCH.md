# Research notes

RunMirror combines established ideas into a small agent-oriented reference implementation:

- [VCR](https://github.com/vcr/vcr) and record/replay testing tools demonstrate the value of cassettes at explicit I/O boundaries.
- [OpenTelemetry](https://github.com/open-telemetry/opentelemetry-specification) provides broader tracing semantics. RunMirror is not an OpenTelemetry implementation; an export adapter is a possible extension.
- [JSON Lines](https://jsonlines.org/) provides an append-friendly event representation.
- [in-toto](https://github.com/in-toto/in-toto) and DSSE motivate future signing adapters.

The testable hypothesis is that deterministic boundary cassettes make agent regressions easier to reproduce and review. The demo includes a seeded mismatch to prove first-divergence detection rather than showing only a passing replay.
