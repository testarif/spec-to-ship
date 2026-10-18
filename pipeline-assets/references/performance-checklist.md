# Performance checklist

- Measure or identify the specific bottleneck before optimizing.
- Avoid unbounded loops, repeated expensive work, unnecessary DOM/canvas redraws, and avoidable allocation in hot paths.
- Bound data collection and response sizes; paginate large collections where applicable.
- Release timers, listeners, streams, and other resources when no longer needed.
- Keep expensive work off latency-sensitive paths and preserve responsiveness.
- Verify optimizations do not weaken correctness, accessibility, or error handling.
