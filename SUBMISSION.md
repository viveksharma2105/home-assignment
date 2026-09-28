# Take-Home Assignment Submission: The Untested API

## Summary of Changes

### 1. Test Suite (`tests/`)
Created two comprehensive test suites with **98.6%+ line coverage** (100% on routes, services, and validators):
- **Unit Tests (`tests/taskService.test.js`)**: 23 tests verifying each function in `src/services/taskService.js` in isolation, including data encapsulation, boundary pagination, overdue date computations, immutability of IDs on update, and assignee logic.
- **Integration Tests (`tests/tasks.routes.test.js`)**: 31 tests using Supertest verifying all HTTP endpoints (`GET /tasks`, `GET /tasks/stats`, `POST /tasks`, `PUT /tasks/:id`, `DELETE /tasks/:id`, `PATCH /tasks/:id/complete`, and `PATCH /tasks/:id/assign`), testing status codes (200, 201, 204, 400, 404, 500), schema validations, and combined query filtering + pagination.

### 2. Bugs Identified & Fixed
Full analysis is available in [BUG_REPORT.md](./BUG_REPORT.md). Root-cause fixes were applied cleanly with minimal diffs:
- **Pagination Off-By-One (`taskService.js`)**: Changed `offset = page * limit` to `(pageNum - 1) * limitNum` so page 1 starts at index 0 instead of skipping the first page.
- **Priority Overwrite Bug (`taskService.js`)**: Removed hardcoded `priority: 'medium'` from `completeTask`, preserving the original task priority.
- **Status Filter Substring Match (`taskService.js`)**: Replaced `t.status.includes(status)` with exact match `t.status === status`.
- **Query Parameter Conflict (`routes/tasks.js`)**: Composed status filtering and pagination in `GET /tasks` so both work seamlessly together.
- **Input Type & Malformed Body Handling (`validators.js`, `app.js`)**: Guarded against null/array payloads and ensured client parser errors return 400 instead of 500.
- **Immutable Fields Protection (`taskService.js`)**: Prevented `PUT /tasks/:id` payloads from mutating `id` and `createdAt`.

### 3. Feature Implementation: `PATCH /tasks/:id/assign`
- **Endpoint**: `PATCH /tasks/:id/assign`
- **Request Body**: `{ "assignee": "string" }`
- **Responses**:
  - `200 OK`: Returns the updated task object containing the `assignee` field.
  - `400 Bad Request`: When `assignee` is missing, empty, contains only whitespace, is not a string, or request body is non-object.
  - `404 Not Found`: When the task ID does not exist in the store.
- **Design Decisions**:
  - **Whitespace Trimming**: Automatically trims leading and trailing whitespace from the assignee name before storing.
  - **Reassignment**: Tasks can be reassigned to a different person; the operation updates the assignee idempotently.
  - **Validation Separation**: Followed the project's existing architecture by placing input validation in `src/utils/validators.js` (`validateAssignTask`), business logic in `src/services/taskService.js` (`assignTask`), and HTTP request handling in `src/routes/tasks.js`.

---

## Reflections & Discussion Points

### What I'd Test Next (Given More Time)
1. **Concurrency and Race Conditions**: Because Node.js event-loop operations are non-blocking, under high concurrent loads or async database backends, simultaneous updates or deletes could cause race conditions. I would add concurrent load tests with `autocannon` or k6.
2. **Security & Injection Tests**: Fuzzing request payloads for prototype pollution (e.g. `{ "__proto__": ... }`), NoSQL/SQL injection patterns if migrated to persistent stores, and cross-site scripting (XSS) in string fields.
3. **Pagination Metadata**: Enhance pagination to return envelope metadata (`{ data: [...], total, page, totalPages }`) rather than a raw array, and test headers / envelope structures.

### Anything That Surprised Me in the Codebase
- **Status Enum Discrepancy**: `README.md` documented task status as `"pending | in-progress | completed"` (using hyphens and "pending"), but `ASSIGNMENT.md`, `validators.js`, and `taskService.js` actually implemented `['todo', 'in_progress', 'done']`. Any client following only the README examples would have failed validation.
- **Lack of a `GET /tasks/:id` Endpoint**: While the service had `findById`, there was no individual task retrieval route (`GET /tasks/:id`) exposed in `routes/tasks.js`, despite having `PUT /:id` and `DELETE /:id`.
- **In-Memory Mutability**: The original code returned references to objects in memory; without deep cloning or immutability helpers, modifications could mutate stored state unexpectedly.

### Questions Before Shipping to Production
1. **Persistence & Database**: What database engine (PostgreSQL, MongoDB, DynamoDB) will back this service in production, and what indexing strategy should be applied for `status` and `dueDate`?
2. **Authentication & Multi-Tenancy**: How are users identified? Should task assignment validate against an existing User directory/service? Should users only be allowed to see and manage tasks within their team/workspace?
3. **Schema Versioning & OpenAPI**: Is an OpenAPI/Swagger specification preferred for contract testing and client generation?
4. **Audit Logging & History**: Do we need to track who completed or reassigned a task, and timestamp those transitions (e.g., `assignedAt`, `assignedBy`)?

---

## Test Coverage Summary

```text
-----------------|---------|----------|---------|---------|-------------------
File             | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s 
-----------------|---------|----------|---------|---------|-------------------
All files        |   98.76 |    98.21 |   96.66 |   98.64 |                   
 src             |   86.66 |       75 |      50 |   86.66 |                   
  app.js         |   86.66 |       75 |      50 |   86.66 | 20-21             
 src/routes      |     100 |      100 |     100 |     100 |                   
  tasks.js       |     100 |      100 |     100 |     100 |                   
 src/services    |     100 |      100 |     100 |     100 |                   
  taskService.js |     100 |      100 |     100 |     100 |                   
 src/utils       |     100 |      100 |     100 |     100 |                   
  validators.js  |     100 |      100 |     100 |     100 |                   
-----------------|---------|----------|---------|---------|-------------------
Test Suites: 2 passed, 2 total
Tests:       54 passed, 54 total
```
*(The only uncovered line is `app.listen()` inside `if (require.main === module)` in `app.js`, which only executes when starting the server standalone via `node src/app.js`.)*
