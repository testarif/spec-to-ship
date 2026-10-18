# Security checklist

- Treat user input and generated content as untrusted; validate at boundaries and encode for the output context.
- Avoid unsafe HTML/script execution and command construction from untrusted strings.
- Keep secrets out of source, logs, generated client code, and error messages; use configuration with a safe example file.
- Enforce authorization on the server for protected operations; do not trust client-side checks.
- Validate file paths and resource identifiers; constrain filesystem access to the intended workspace.
- Apply safe defaults for network access, CORS, headers, and dependency updates.
- Fail closed on security-sensitive errors and avoid exposing internal details.
- Report only issues supported by the supplied code/evidence, with impact and mitigation.
