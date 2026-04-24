# Security

## Reporting Security Issues

Please report security vulnerabilities through [Bugzilla](https://bugzilla.mozilla.org/enter_bug.cgi?format=__default__&blocked=2026717&product=Developer%20Infrastructure&component=Firefox%20MCP).

## Security Considerations

### Use a Dedicated Profile

Never use `--connect-existing` to connect to your regular Firefox profile. The MCP server controls the browser and could expose cookies, saved passwords, and session data to the agent. Always use a dedicated, separate profile for MCP automation.

### Avoid Untrusted Websites

Do not direct the agent to visit untrusted websites. Malicious pages can return content designed to influence agent behavior, potentially causing unintended actions in the browser session.

### Prompt Injection

Browser automation agents are vulnerable to prompt injection: a page's visible - or invisible - text, HTML, or console output could contain instructions that manipulate the agent into taking unintended actions. Be cautious when automating pages whose content you do not control.

### Limit Agent Capabilities

Avoid enabling `--enable-script` unless strictly necessary. The `evaluate_script` tool lets the agent execute arbitrary JavaScript in the page context, which significantly expands its attack surface.

Keeping capabilities to the minimum needed reduces the potential impact of a compromised session or a prompt injection attack.
