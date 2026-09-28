const taskService = require('../src/services/taskService');

describe('taskService (Unit Tests)', () => {
  beforeEach(() => {
    taskService._reset();
  });

  describe('create and getAll', () => {
    it('returns an empty array when no tasks exist', () => {
      expect(taskService.getAll()).toEqual([]);
    });

    it('creates a task with sensible defaults', () => {
      const task = taskService.create({ title: 'Task 1' });
      expect(task).toMatchObject({
        title: 'Task 1',
        description: '',
        status: 'todo',
        priority: 'medium',
        dueDate: null,
        completedAt: null,
      });
      expect(typeof task.id).toBe('string');
      expect(task.createdAt).toBeDefined();
      expect(taskService.getAll()).toHaveLength(1);
    });

    it('creates a task with custom fields', () => {
      const task = taskService.create({
        title: 'Custom Task',
        description: 'Detailed description',
        status: 'in_progress',
        priority: 'high',
        dueDate: '2026-12-31T00:00:00.000Z',
      });
      expect(task.description).toBe('Detailed description');
      expect(task.status).toBe('in_progress');
      expect(task.priority).toBe('high');
      expect(task.dueDate).toBe('2026-12-31T00:00:00.000Z');
    });

    it('returns a shallow copy of tasks to protect internal array', () => {
      taskService.create({ title: 'Task 1' });
      const list = taskService.getAll();
      list.pop();
      expect(taskService.getAll()).toHaveLength(1);
    });
  });

  describe('findById', () => {
    it('finds an existing task by id', () => {
      const created = taskService.create({ title: 'Task' });
      const found = taskService.findById(created.id);
      expect(found).toEqual(created);
    });

    it('returns undefined if task is not found', () => {
      expect(taskService.findById('non-existent-id')).toBeUndefined();
    });
  });

  describe('getByStatus', () => {
    it('returns tasks matching exact status only', () => {
      taskService.create({ title: 'Todo task', status: 'todo' });
      taskService.create({ title: 'Done task', status: 'done' });
      taskService.create({ title: 'In progress task', status: 'in_progress' });

      const todos = taskService.getByStatus('todo');
      expect(todos).toHaveLength(1);
      expect(todos[0].title).toBe('Todo task');

      // Crucial edge case: substring 'do' must not match 'todo' or 'done'
      const partial = taskService.getByStatus('do');
      expect(partial).toEqual([]);
    });

    it('returns empty array when no tasks match status', () => {
      taskService.create({ title: 'Task', status: 'todo' });
      expect(taskService.getByStatus('done')).toEqual([]);
    });
  });

  describe('getPaginated', () => {
    beforeEach(() => {
      for (let i = 1; i <= 5; i++) {
        taskService.create({ title: `Task ${i}` });
      }
    });

    it('returns page 1 starting from index 0', () => {
      const page1 = taskService.getPaginated(1, 2);
      expect(page1).toHaveLength(2);
      expect(page1[0].title).toBe('Task 1');
      expect(page1[1].title).toBe('Task 2');
    });

    it('returns subsequent pages correctly', () => {
      const page2 = taskService.getPaginated(2, 2);
      expect(page2).toHaveLength(2);
      expect(page2[0].title).toBe('Task 3');
      expect(page2[1].title).toBe('Task 4');

      const page3 = taskService.getPaginated(3, 2);
      expect(page3).toHaveLength(1);
      expect(page3[0].title).toBe('Task 5');
    });

    it('handles out of range pages gracefully', () => {
      const page99 = taskService.getPaginated(99, 10);
      expect(page99).toEqual([]);
    });

    it('handles edge case page and limit inputs', () => {
      // Non-positive or invalid page defaults to page 1
      const defaultPage = taskService.getPaginated(0, 2);
      expect(defaultPage[0].title).toBe('Task 1');

      const negativePage = taskService.getPaginated(-5, 2);
      expect(negativePage[0].title).toBe('Task 1');

      // Default limit when limit is omitted
      const defaultLimit = taskService.getPaginated(1);
      expect(defaultLimit).toHaveLength(5);
    });

    it('supports paginating a custom task list', () => {
      const customList = [{ title: 'A' }, { title: 'B' }, { title: 'C' }];
      const page = taskService.getPaginated(2, 1, customList);
      expect(page).toHaveLength(1);
      expect(page[0].title).toBe('B');
    });
  });

  describe('getStats', () => {
    it('returns zeroed stats when no tasks exist', () => {
      expect(taskService.getStats()).toEqual({
        todo: 0,
        in_progress: 0,
        done: 0,
        overdue: 0,
      });
    });

    it('calculates counts by status correctly', () => {
      taskService.create({ title: 'T1', status: 'todo' });
      taskService.create({ title: 'T2', status: 'in_progress' });
      taskService.create({ title: 'T3', status: 'done' });
      taskService.create({ title: 'T4', status: 'done' });
      // Task with unexpected status does not increment standard counters
      taskService.create({ title: 'T5', status: 'archived' });

      const stats = taskService.getStats();
      expect(stats.todo).toBe(1);
      expect(stats.in_progress).toBe(1);
      expect(stats.done).toBe(2);
    });

    it('calculates overdue tasks accurately', () => {
      const pastDate = new Date(Date.now() - 86400000).toISOString();
      const futureDate = new Date(Date.now() + 86400000).toISOString();

      // Overdue: past due and not done
      taskService.create({ title: 'Overdue Todo', status: 'todo', dueDate: pastDate });
      taskService.create({ title: 'Overdue In Progress', status: 'in_progress', dueDate: pastDate });

      // Not overdue: completed even if due date was in past
      taskService.create({ title: 'Completed Past', status: 'done', dueDate: pastDate });

      // Not overdue: future due date
      taskService.create({ title: 'Future Task', status: 'todo', dueDate: futureDate });

      // Not overdue: no due date
      taskService.create({ title: 'No Due Date', status: 'todo', dueDate: null });

      const stats = taskService.getStats();
      expect(stats.overdue).toBe(2);
    });
  });

  describe('update', () => {
    it('updates allowed fields', () => {
      const task = taskService.create({ title: 'Original' });
      const updated = taskService.update(task.id, {
        title: 'Updated',
        description: 'New desc',
        priority: 'high',
      });

      expect(updated.title).toBe('Updated');
      expect(updated.description).toBe('New desc');
      expect(updated.priority).toBe('high');
    });

    it('returns null if task does not exist', () => {
      expect(taskService.update('non-existent', { title: 'New' })).toBeNull();
    });

    it('prevents overwriting immutable fields id and createdAt', () => {
      const task = taskService.create({ title: 'Original' });
      const originalCreatedAt = task.createdAt;

      const updated = taskService.update(task.id, {
        id: 'tampered-id',
        createdAt: '1970-01-01T00:00:00.000Z',
        title: 'Updated Title',
      });

      expect(updated.id).toBe(task.id);
      expect(updated.createdAt).toBe(originalCreatedAt);
      expect(updated.title).toBe('Updated Title');
    });
  });

  describe('remove', () => {
    it('removes task and returns true', () => {
      const task = taskService.create({ title: 'To Delete' });
      expect(taskService.remove(task.id)).toBe(true);
      expect(taskService.findById(task.id)).toBeUndefined();
      expect(taskService.getAll()).toHaveLength(0);
    });

    it('returns false if task does not exist', () => {
      expect(taskService.remove('non-existent')).toBe(false);
    });
  });

  describe('completeTask', () => {
    it('marks task as done and sets completedAt timestamp', () => {
      const task = taskService.create({ title: 'Task to Complete' });
      const completed = taskService.completeTask(task.id);

      expect(completed.status).toBe('done');
      expect(completed.completedAt).toBeDefined();
      expect(isNaN(Date.parse(completed.completedAt))).toBe(false);
    });

    it('preserves the existing priority when completing a task', () => {
      const task = taskService.create({ title: 'High Priority', priority: 'high' });
      const completed = taskService.completeTask(task.id);

      expect(completed.priority).toBe('high');
    });

    it('returns null if task does not exist', () => {
      expect(taskService.completeTask('non-existent')).toBeNull();
    });
  });

  describe('assignTask', () => {
    it('assigns a task to a user and trims assignee whitespace', () => {
      const task = taskService.create({ title: 'Feature Task' });
      const assigned = taskService.assignTask(task.id, '  Alice Smith  ');

      expect(assigned.assignee).toBe('Alice Smith');
      expect(taskService.findById(task.id).assignee).toBe('Alice Smith');
    });

    it('allows reassigning an already assigned task', () => {
      const task = taskService.create({ title: 'Feature Task' });
      taskService.assignTask(task.id, 'Alice');
      const reassigned = taskService.assignTask(task.id, 'Bob');

      expect(reassigned.assignee).toBe('Bob');
    });

    it('returns null if task does not exist', () => {
      expect(taskService.assignTask('non-existent', 'Alice')).toBeNull();
    });
  });
});
