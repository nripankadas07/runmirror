# RunMirror replay report

Artifact: `runmirror.report/v1`

- Run: `offline-demo`
- Integrity valid: **true**
- Baseline matched: **7/7**
- Drift detected at: **offline-demo:0003 $.bytes**
- Root hash: `b3bc33116f0fa05c5f9599a1845bd2dc925c8f8f77c834bdcf0c43a4a2fd25f9`

| # | Kind | Logical time | Hash |
|---:|---|---:|---|
| 0 | clock | 1700000000000 | `f3e49c8f122b` |
| 1 | random | 1700000000001 | `e6f4348fdf12` |
| 2 | model | 1700000000002 | `dbbed43da395` |
| 3 | tool | 1700000000003 | `2d3984aac5d8` |
| 4 | file | 1700000000004 | `e39bcfe0686d` |
| 5 | approval | 1700000000005 | `b2861b7edfce` |
| 6 | error | 1700000000006 | `b3bc33116f0f` |

> Replay uses explicit adapters supplied by the caller. RunMirror does not transparently intercept SDKs, processes, files, clocks, or random sources.
