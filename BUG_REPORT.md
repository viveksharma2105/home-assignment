# Bug Report — The Untested API

During test writing and codebase exploration, five notable bugs/defects were uncovered across `src/services/taskService.js`, `src/routes/tasks.js`, and `src/utils/validators.js`. Below are the detailed findings, root causes, test verifications, and fixes applied.

---

### Bug 1: Pagination Offset Off-by-One Skips Page 1 Entirely

* **Location:** `src/services/taskService.js:12`
* **Severity:** High
* **Expected Behavior:** Requesting page 1 (`GET /tasks?page=1&limit=10`) should return tasks starting from index 0 (the first 10 tasks in the collection).
* **Actual Behavior:** 
  The offset was calculated as:
  ```javascript
  const offset = page * limit;
  ```
  When `page = 1` and `limit = 10`, `offset = 10`. This completely skips the first 10 tasks (indices 0–9). If a collection has fewer than 10 tasks, `GET /tasks?page=1` returns an empty array `[]`. Furthermore, since `routes/tasks.js` defaults `pageNum = parseInt(page) || 1`, `page=0` is converted to `1`, meaning the first page of items is permanently inaccessible via pagination.
* **How Discovered:** Writing unit tests for `getPaginated(1, 1)` and integration test `GET /tasks?page=1&limit=2` — expected `Task 1` but received `Task 2` or empty array.
* **Fix Applied:**
  Adjusted calculation to standard 1-indexed pagination with lower bound fallback:
  ```javascript
  const pageNum = Math.max(1, parseInt(page) || 1);
  const limitNum = Math.max(1, parseInt(limit) || 10);
  const offset = (pageNum - 1) * limitNum;
  return taskList.slice(offset, offset + limitNum);
  ```

---

### Bug 2: Task Completion Hardcodes and Clobbers Priority

* **Location:** `src/services/taskService.js:69`
* **Severity:** Medium / Data Integrity
* **Expected Behavior:** Marking a task as complete (`PATCH /tasks/:id/complete`) should update `status` to `'done'` and set `completedAt`, while preserving all other properties (specifically `priority`).
* **Actual Behavior:**
  `completeTask` explicitly hardcoded `priority: 'medium'`:
  ```javascript
  const updated = {
    ...task,
    priority: 'medium', // Overwrites existing priority
    status: 'done',
    completedAt: new Date().toISOString(),
  };
  ```
  Any task originally created with `priority: 'high'` or `'low'` had its priority silently reset to `'medium'` upon completion.
* **How Discovered:** Unit test creating a `priority: 'high'` task and invoking `completeTask(task.id)` — assertion `expect(completed.priority).toBe('high')` failed with `'medium'`.
* **Fix Applied:**
  Removed the `priority: 'medium'` override line so the task's existing priority is preserved.

---

### Bug 3: Status Filtering Uses Substring Matching (`.includes`)

* **Location:** `src/services/taskService.js:9`
* **Severity:** Medium
* **Expected Behavior:** Querying `/tasks?status=todo` or calling `getByStatus(status)` should return tasks matching the exact status enum value. An invalid or partial status query like `?status=do` should match 0 tasks.
* **Actual Behavior:**
  `getByStatus` used `String.prototype.includes`:
  ```javascript
  const getByStatus = (status) => tasks.filter((t) => t.status.includes(status));
  ```
  Because `"todo".includes("do")` and `"done".includes("do")` are both true, querying for `status=do` returned tasks that were both `'todo'` and `'done'`.
* **How Discovered:** Unit test querying `taskService.getByStatus('do')` — expected 0 tasks, but received 2 tasks.
* **Fix Applied:**
  Changed filter condition to exact match: `tasks.filter((t) => t.status === status)`.

---

### Bug 4: Mutual Exclusion / Conflict Between Query Parameters in `GET /tasks`

* **Location:** `src/routes/tasks.js:14-24`
* **Severity:** Medium
* **Expected Behavior:** Providing both a filter and pagination parameters (e.g., `GET /tasks?status=todo&page=1&limit=5`) should return the requested page of the filtered dataset.
* **Actual Behavior:**
  The route checked `if (status)` and immediately returned `taskService.getByStatus(status)`, bypassing the subsequent pagination block entirely:
  ```javascript
  if (status) {
    const tasks = taskService.getByStatus(status);
    return res.json(tasks); // Early return ignores page & limit!
  }
  if (page !== undefined || limit !== undefined) { ... }
  ```
* **How Discovered:** Route integration test testing `GET /tasks?status=todo&page=1&limit=1`.
* **Fix Applied:**
  Composed the filtering and pagination cleanly in `routes/tasks.js` without early returning:
  ```javascript
  let tasks = status ? taskService.getByStatus(status) : taskService.getAll();
  if (page !== undefined || limit !== undefined) {
    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 10;
    tasks = taskService.getPaginated(pageNum, limitNum, tasks);
  }
  res.json(tasks);
  ```

---

### Bug 5: Unhandled Exceptions / 500 Crashes on Non-Object or Primitive JSON Body

* **Location:** `src/utils/validators.js:5, 21` & `src/app.js:9-12`
* **Severity:** Medium
* **Expected Behavior:** Malformed requests, primitive payloads, or non-object bodies (e.g., `[]`, `null`) should return `400 Bad Request` with an informative error message.
* **Actual Behavior:**
  - `validateCreateTask` and `validateUpdateTask` accessed properties directly (e.g. `!body.title`) without guarding against `null` or arrays. If `null` was parsed, a `TypeError` crashed Express into a `500 Internal Server Error`.
  - In `app.js`, the error middleware caught parser syntax errors (`err.status === 400`) and logged them as 500s.
* **How Discovered:** Integration tests sending invalid body payloads.
* **Fix Applied:**
  - Added object and array guards in `validators.js`:
    ```javascript
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return 'request body must be an object';
    }
    ```
  - Added `if (err.status === 400)` check in `app.js` error middleware to return 400 for client request errors.
  - Added type check on `dueDate` to ensure numbers/booleans cannot bypass ISO string validation.
