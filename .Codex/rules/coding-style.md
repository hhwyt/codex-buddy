# Coding Style

General coding style for TypeScript/JavaScript projects.

---

## Immutability

Never mutate a value the caller still owns — return a new object instead:

```javascript
// WRONG: mutates the caller's object
function updateUser(user, name) {
  user.name = name
  return user
}

// CORRECT: returns a new object
function updateUser(user, name) {
  return {
    ...user,
    name
  }
}
```
Local mutation inside a function is fine (building an array in a loop, an accumulator). The rule is about shared state, not about the `=` operator. In a hot path, measure before copying.

## File Organization

MANY SMALL FILES > FEW LARGE FILES:
- High cohesion, low coupling
- 200-400 lines typical, 800 max
- Extract utilities from large components
- Organize by feature/domain, not by type

## Error Handling

ALWAYS handle errors comprehensively:

```typescript
try {
  const result = await riskyOperation()
  return result
} catch (error) {
  console.error('Operation failed:', error)
  throw new Error('Detailed user-friendly message')
}
```

## Input Validation

ALWAYS validate user input:

```typescript
import { z } from 'zod'

const schema = z.object({
  email: z.string().email(),
  age: z.number().int().min(0).max(150)
})

const validated = schema.parse(input)
```

## Code Quality Checklist

Before marking work complete:
- [ ] Code is readable and well-named
- [ ] Functions are small (<50 lines)
- [ ] Files are focused (<800 lines)
- [ ] No deep nesting (>4 levels)
- [ ] Proper error handling
- [ ] No leftover debug `console.log`
- [ ] No hardcoded values
- [ ] No mutation of values the caller owns
