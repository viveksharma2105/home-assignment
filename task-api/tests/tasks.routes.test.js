const request = require('supertest');
const app = require('../src/app');
const taskService = require('../src/services/taskService');

describe('Tasks API Integration Tests', () => {
  beforeEach(() => {
    taskService._reset();
  });

  describe('GET /tasks', () => {
    it('returns an empty array when no tasks exist', async () => {
      const res = await request(app).get('/tasks');
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('returns all tasks', async () => {
      taskService.create({ title: 'Task 1' });
      taskService.create({ title: 'Task 2' });

      const res = await request(app).get('/tasks');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
    });

    it('filters tasks by exact status', async () => {
      taskService.create({ title: 'Task 1', status: 'todo' });
      taskService.create({ title: 'Task 2', status: 'done' });
      taskService.create({ title: 'Task 3', status: 'in_progress' });

      const res = await request(app).get('/tasks?status=todo');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].title).toBe('Task 1');
    });

    it('paginates tasks correctly using 1-indexed page', async () => {
      for (let i = 1; i <= 5; i++) {
        taskService.create({ title: `Task ${i}` });
      }

      const page1Res = await request(app).get('/tasks?page=1&limit=2');
      expect(page1Res.status).toBe(200);
      expect(page1Res.body).toHaveLength(2);
      expect(page1Res.body[0].title).toBe('Task 1');
      expect(page1Res.body[1].title).toBe('Task 2');

      const page2Res = await request(app).get('/tasks?page=2&limit=2');
      expect(page2Res.status).toBe(200);
      expect(page2Res.body).toHaveLength(2);
      expect(page2Res.body[0].title).toBe('Task 3');
      expect(page2Res.body[1].title).toBe('Task 4');
    });

    it('supports combining status filter and pagination', async () => {
      taskService.create({ title: 'Todo 1', status: 'todo' });
      taskService.create({ title: 'Todo 2', status: 'todo' });
      taskService.create({ title: 'Done 1', status: 'done' });

      const res = await request(app).get('/tasks?status=todo&page=1&limit=1');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].title).toBe('Todo 1');
    });

    it('defaults page or limit when only one is provided', async () => {
      for (let i = 1; i <= 3; i++) {
        taskService.create({ title: `Task ${i}` });
      }

      // page provided, limit defaults to 10
      const resPageOnly = await request(app).get('/tasks?page=1');
      expect(resPageOnly.status).toBe(200);
      expect(resPageOnly.body).toHaveLength(3);

      // limit provided, page defaults to 1
      const resLimitOnly = await request(app).get('/tasks?limit=2');
      expect(resLimitOnly.status).toBe(200);
      expect(resLimitOnly.body).toHaveLength(2);
    });
  });

  describe('GET /tasks/stats', () => {
    it('returns status counts and overdue count', async () => {
      const pastDate = new Date(Date.now() - 86400000).toISOString();
      taskService.create({ title: 'Todo Overdue', status: 'todo', dueDate: pastDate });
      taskService.create({ title: 'Done Task', status: 'done', dueDate: pastDate });

      const res = await request(app).get('/tasks/stats');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        todo: 1,
        in_progress: 0,
        done: 1,
        overdue: 1,
      });
    });
  });

  describe('POST /tasks', () => {
    it('creates a task with valid input and returns 201', async () => {
      const res = await request(app)
        .post('/tasks')
        .send({
          title: 'Implement unit tests',
          description: 'Ensure 80%+ test coverage',
          priority: 'high',
          dueDate: '2026-10-15T12:00:00.000Z',
        });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        title: 'Implement unit tests',
        description: 'Ensure 80%+ test coverage',
        priority: 'high',
        status: 'todo',
        dueDate: '2026-10-15T12:00:00.000Z',
        completedAt: null,
      });
      expect(res.body.id).toBeDefined();
      expect(res.body.createdAt).toBeDefined();
    });

    it('returns 400 when title is missing or empty or whitespace', async () => {
      const missingRes = await request(app).post('/tasks').send({});
      expect(missingRes.status).toBe(400);
      expect(missingRes.body.error).toMatch(/title is required/);

      const emptyRes = await request(app).post('/tasks').send({ title: '   ' });
      expect(emptyRes.status).toBe(400);

      const nonStringRes = await request(app).post('/tasks').send({ title: 12345 });
      expect(nonStringRes.status).toBe(400);
    });

    it('returns 400 when status is invalid', async () => {
      const res = await request(app).post('/tasks').send({ title: 'Task', status: 'pending' });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/status must be one of/);
    });

    it('returns 400 when priority is invalid', async () => {
      const res = await request(app).post('/tasks').send({ title: 'Task', priority: 'critical' });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/priority must be one of/);
    });

    it('returns 400 when dueDate is an invalid date string or non-string', async () => {
      const invalidDateRes = await request(app)
        .post('/tasks')
        .send({ title: 'Task', dueDate: 'invalid-date' });
      expect(invalidDateRes.status).toBe(400);
      expect(invalidDateRes.body.error).toMatch(/dueDate must be a valid ISO date string/);

      const numberDateRes = await request(app)
        .post('/tasks')
        .send({ title: 'Task', dueDate: 1234567 });
      expect(numberDateRes.status).toBe(400);
    });

    it('returns 400 when request body is not an object', async () => {
      const res = await request(app)
        .post('/tasks')
        .send(['not-an-object']);
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('request body must be an object');
    });
  });

  describe('PUT /tasks/:id', () => {
    it('updates an existing task and returns 200', async () => {
      const task = taskService.create({ title: 'Original Task', priority: 'low' });

      const res = await request(app)
        .put(`/tasks/${task.id}`)
        .send({
          title: 'Updated Task',
          priority: 'high',
          status: 'in_progress',
        });

      expect(res.status).toBe(200);
      expect(res.body.title).toBe('Updated Task');
      expect(res.body.priority).toBe('high');
      expect(res.body.status).toBe('in_progress');
    });

    it('returns 404 when updating non-existent task', async () => {
      const res = await request(app)
        .put('/tasks/non-existent-id')
        .send({ title: 'Updated' });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Task not found');
    });

    it('returns 400 when update payload has invalid fields', async () => {
      const task = taskService.create({ title: 'Task' });

      const invalidTitle = await request(app)
        .put(`/tasks/${task.id}`)
        .send({ title: '  ' });
      expect(invalidTitle.status).toBe(400);

      const invalidStatus = await request(app)
        .put(`/tasks/${task.id}`)
        .send({ status: 'archived' });
      expect(invalidStatus.status).toBe(400);

      const invalidPriority = await request(app)
        .put(`/tasks/${task.id}`)
        .send({ priority: 'urgent' });
      expect(invalidPriority.status).toBe(400);

      const invalidDueDate = await request(app)
        .put(`/tasks/${task.id}`)
        .send({ dueDate: 'bad-date' });
      expect(invalidDueDate.status).toBe(400);

      const nullBody = await request(app)
        .put(`/tasks/${task.id}`)
        .send(['not-an-object']);
      expect(nullBody.status).toBe(400);
    });

    it('prevents clients from mutating immutable fields id and createdAt', async () => {
      const task = taskService.create({ title: 'Original' });
      const originalCreatedAt = task.createdAt;

      const res = await request(app)
        .put(`/tasks/${task.id}`)
        .send({
          id: 'hacked-id',
          createdAt: '1999-01-01T00:00:00.000Z',
          title: 'Safe Update',
        });

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(task.id);
      expect(res.body.createdAt).toBe(originalCreatedAt);
      expect(res.body.title).toBe('Safe Update');
    });
  });

  describe('DELETE /tasks/:id', () => {
    it('deletes an existing task and returns 204', async () => {
      const task = taskService.create({ title: 'Task to Delete' });

      const res = await request(app).delete(`/tasks/${task.id}`);
      expect(res.status).toBe(204);
      expect(res.text).toBe('');
      expect(taskService.findById(task.id)).toBeUndefined();
    });

    it('returns 404 when deleting a non-existent task', async () => {
      const res = await request(app).delete('/tasks/non-existent-id');
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Task not found');
    });
  });

  describe('PATCH /tasks/:id/complete', () => {
    it('marks task as complete and preserves priority', async () => {
      const task = taskService.create({ title: 'Important Task', priority: 'high' });

      const res = await request(app).patch(`/tasks/${task.id}/complete`);
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('done');
      expect(res.body.priority).toBe('high');
      expect(res.body.completedAt).toBeDefined();
    });

    it('returns 404 when completing non-existent task', async () => {
      const res = await request(app).patch('/tasks/non-existent-id/complete');
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Task not found');
    });
  });

  describe('PATCH /tasks/:id/assign', () => {
    it('assigns task to a user and returns 200 with updated task', async () => {
      const task = taskService.create({ title: 'Refactor Auth' });

      const res = await request(app)
        .patch(`/tasks/${task.id}/assign`)
        .send({ assignee: 'Alex Johnson' });

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(task.id);
      expect(res.body.assignee).toBe('Alex Johnson');
    });

    it('allows reassigning a task to a different user', async () => {
      const task = taskService.create({ title: 'Bug Investigation' });
      taskService.assignTask(task.id, 'Alex');

      const res = await request(app)
        .patch(`/tasks/${task.id}/assign`)
        .send({ assignee: 'Jordan Lee' });

      expect(res.status).toBe(200);
      expect(res.body.assignee).toBe('Jordan Lee');
    });

    it('returns 400 if assignee is missing, empty, or whitespace', async () => {
      const task = taskService.create({ title: 'Task' });

      const missingRes = await request(app)
        .patch(`/tasks/${task.id}/assign`)
        .send({});
      expect(missingRes.status).toBe(400);
      expect(missingRes.body.error).toMatch(/assignee is required/);

      const emptyRes = await request(app)
        .patch(`/tasks/${task.id}/assign`)
        .send({ assignee: '   ' });
      expect(emptyRes.status).toBe(400);

      const nonStringRes = await request(app)
        .patch(`/tasks/${task.id}/assign`)
        .send({ assignee: 12345 });
      expect(nonStringRes.status).toBe(400);

      const nonObjectBodyRes = await request(app)
        .patch(`/tasks/${task.id}/assign`)
        .send(['not-an-object']);
      expect(nonObjectBodyRes.status).toBe(400);
    });

    it('returns 400 for malformed json body', async () => {
      const res = await request(app)
        .post('/tasks')
        .set('Content-Type', 'application/json')
        .send('{ invalid json');
      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });

    it('returns 404 when assigning a non-existent task', async () => {
      const res = await request(app)
        .patch('/tasks/non-existent-id/assign')
        .send({ assignee: 'Alex' });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Task not found');
    });
  });

  describe('Error Handling Middleware', () => {
    it('returns 500 when an unexpected internal error occurs', async () => {
      jest.spyOn(taskService, 'getAll').mockImplementationOnce(() => {
        throw new Error('Database crash simulated');
      });

      // Silence console.error for this expected error test
      const spyConsole = jest.spyOn(console, 'error').mockImplementation(() => {});

      const res = await request(app).get('/tasks');
      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Internal server error');

      spyConsole.mockRestore();
    });
  });
});
