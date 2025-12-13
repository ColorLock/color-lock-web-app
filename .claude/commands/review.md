Review my unstaged changes as a senior engineer performing a code review before I commit. Run `git diff` to see the changes.

For each file changed, evaluate:

1. **Correctness** - Logic errors, bugs, edge cases not handled, potential crashes
2. **Code quality** - Readability, naming, duplication, complexity
3. **Best practices** - Language idioms, design patterns, SOLID principles
4. **Security** - Input validation, data exposure, injection risks
5. **Performance** - Inefficient algorithms, unnecessary allocations, N+1 patterns
6. **Testing** - Are changes testable? Should tests be added/updated?

For each issue found:
- Severity: 🔴 Blocker | 🟡 Should fix | 🟢 Nitpick
- File and line reference
- What's wrong and why
- Suggested fix

End with a summary: APPROVED, APPROVED WITH SUGGESTIONS, or CHANGES REQUESTED.

Be direct and specific. Don't pad with praise - focus on what needs attention.