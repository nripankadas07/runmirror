# RunMirror replay report

Artifact: `runmirror.report/v1`

- Run: `offline-demo`
- Integrity valid: **true**
- Baseline matched: **7/7**
- Drift detected at: **offline-demo:0003 $.bytes**
- Root hash: `10c010002be0e52fa7341bf2b33b24fed1171595bde6a553f96183aa0781bc2f`

| # | Kind | Logical time | Hash |
|---:|---|---:|---|
| 0 | clock | 1700000000000 | `22c68b33bcbc` |
| 1 | random | 1700000000001 | `5ba779143c23` |
| 2 | model | 1700000000002 | `fa3da2552458` |
| 3 | tool | 1700000000003 | `21aa42127acc` |
| 4 | file | 1700000000004 | `c99db138a2c0` |
| 5 | approval | 1700000000005 | `511e4d93ed19` |
| 6 | error | 1700000000006 | `10c010002be0` |

> Replay uses explicit adapters supplied by the caller. RunMirror does not transparently intercept SDKs, processes, files, clocks, or random sources.
