# Testing Requirements

## Coverage
Cover the risk, not a number. Every bug fix gets a regression test; every new branch of business logic gets a case. Do not write tests whose only purpose is to raise a coverage percentage.

Test Types:
1. **Unit Tests** - Individual functions, utilities, components
2. **Integration Tests** - API endpoints, database operations
3. **E2E Tests** - Critical user flows (Playwright)

## Test-Driven Development
For bug fixes and new business logic:
1. Write test first (RED)
2. Run test - it should FAIL
3. Write minimal implementation (GREEN)
4. Run test - it should PASS
5. Refactor (IMPROVE)

## Troubleshooting Test Failures
1. Check test isolation
2. Verify mocks are correct
3. Fix implementation, not tests (unless tests are wrong)
4. After two failed attempts without logs, add logs before the third attempt
