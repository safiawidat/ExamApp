import request from 'supertest';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
  cleanTestRecords,
  loadTestApplication,
  runPrefix,
  username,
} from './testDatabase.js';

const password = 'Test-only password 42!';
const typeName = (label) => `${runPrefix}_${label}`;
const bearer = (token) => `Bearer ${token}`;
const createdExamIds = [];
const createdExamTypeIds = [];

let app;
let pool;
let authService;
let userRepository;
let primaryLecturer;
let secondaryLecturer;
let primaryAuthorization;
let secondaryAuthorization;
let studentAuthorization;

const seedLecturer = async (label) => {
  const normalizedUsername = authService.normalizeAndValidateUsername(username(label));
  const validatedPassword = authService.validatePassword(password);
  const passwordHash = await authService.hashPassword(validatedPassword);
  return userRepository.upsertLecturer({ username: normalizedUsername, passwordHash });
};

const login = async (loginUsername) => {
  const response = await request(app)
    .post('/api/auth/login')
    .send({ username: loginUsername, password });

  expect(response.status).toBe(200);
  return bearer(response.body.token);
};

const createExamType = async (authorization, label, overrides = {}) => {
  const response = await request(app)
    .post('/api/exam-types')
    .set('Authorization', authorization)
    .send({
      name: typeName(label),
      description: `Test-only ${label} type.`,
      ...overrides,
    });

  expect(response.status).toBe(201);
  expect(Number.isSafeInteger(response.body.id)).toBe(true);
  createdExamTypeIds.push(response.body.id);
  return response.body;
};

const createExam = async (authorization, examTypeId, label, overrides = {}) => {
  const response = await request(app)
    .post('/api/exams')
    .set('Authorization', authorization)
    .send({
      exam_type_id: examTypeId,
      title: `Test-only ${label} exam`,
      description: `Created for ${label}.`,
      ...overrides,
    });

  expect(response.status).toBe(201);
  expect(Number.isSafeInteger(response.body.id)).toBe(true);
  createdExamIds.push(response.body.id);
  return response.body;
};

const expectForbidden = (responses) => {
  for (const response of responses) {
    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: 'Access forbidden.' });
  }
};

const verifyRunRecordsRemoved = async () => {
  const usernamePrefix = `${runPrefix}_`;
  const result = await pool.query(
    `SELECT
       (SELECT COUNT(*)::INTEGER
        FROM users
        WHERE LEFT(username, LENGTH($3)) = $3) AS users,
       (SELECT COUNT(*)::INTEGER
        FROM exams
        WHERE id = ANY($1::int[])) AS exams,
       (SELECT COUNT(*)::INTEGER
        FROM exam_types
        WHERE id = ANY($2::int[])) AS exam_types,
       (SELECT COUNT(*)::INTEGER
        FROM questions
        WHERE exam_id = ANY($1::int[])) AS questions,
       (SELECT COUNT(*)::INTEGER
        FROM question_options qo
        JOIN questions q ON q.id = qo.question_id
        WHERE q.exam_id = ANY($1::int[])) AS question_options`,
    [createdExamIds, createdExamTypeIds, usernamePrefix],
  );

  expect(result.rows[0]).toEqual({
    users: 0,
    exams: 0,
    exam_types: 0,
    questions: 0,
    question_options: 0,
  });
};

beforeAll(async () => {
  ({ app, pool } = await loadTestApplication());
  [authService, userRepository] = await Promise.all([
    import('../services/authService.js'),
    import('../repositories/userRepository.js'),
  ]);

  [primaryLecturer, secondaryLecturer] = await Promise.all([
    seedLecturer('authoring_primary'),
    seedLecturer('authoring_secondary'),
  ]);
  [primaryAuthorization, secondaryAuthorization] = await Promise.all([
    login(primaryLecturer.username),
    login(secondaryLecturer.username),
  ]);

  const student = await request(app)
    .post('/api/auth/register')
    .send({ username: username('authoring_student'), password });
  expect(student.status).toBe(201);
  studentAuthorization = bearer(student.body.token);
});

afterAll(async () => {
  if (pool) {
    try {
      await cleanTestRecords(pool, createdExamIds, createdExamTypeIds);
      await verifyRunRecordsRemoved();
    } finally {
      await pool.end();
    }
  }
});

describe('exam type authorization', () => {
  test('requires a lecturer for list access', async () => {
    const unauthenticated = await request(app).get('/api/exam-types');
    const student = await request(app)
      .get('/api/exam-types')
      .set('Authorization', studentAuthorization);
    const lecturer = await request(app)
      .get('/api/exam-types')
      .set('Authorization', primaryAuthorization);

    expect(unauthenticated.status).toBe(401);
    expect(student.status).toBe(403);
    expect(lecturer.status).toBe(200);
    expect(Array.isArray(lecturer.body)).toBe(true);
  });

  test('rejects every student mutation', async () => {
    const examType = await createExamType(primaryAuthorization, 'student_type_boundary');
    const responses = [
      await request(app)
        .post('/api/exam-types')
        .set('Authorization', studentAuthorization)
        .send({ name: typeName('student_forbidden_create') }),
      await request(app)
        .patch(`/api/exam-types/${examType.id}`)
        .set('Authorization', studentAuthorization)
        .send({ name: typeName('student_forbidden_update') }),
      await request(app)
        .delete(`/api/exam-types/${examType.id}`)
        .set('Authorization', studentAuthorization),
    ];

    expectForbidden(responses);
  });
});

describe('exam type authoring', () => {
  test('allows the creator to create, list, update, and delete an exam type', async () => {
    const created = await createExamType(primaryAuthorization, 'type_crud');
    expect(created).toMatchObject({
      name: typeName('type_crud'),
      description: 'Test-only type_crud type.',
      created_by: primaryLecturer.id,
    });

    const listed = await request(app)
      .get('/api/exam-types')
      .set('Authorization', primaryAuthorization);
    expect(listed.status).toBe(200);
    expect(listed.body).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: created.id,
        name: typeName('type_crud'),
        created_by: primaryLecturer.id,
      }),
    ]));

    const updated = await request(app)
      .patch(`/api/exam-types/${created.id}`)
      .set('Authorization', primaryAuthorization)
      .send({
        name: typeName('type_crud_updated'),
        description: 'Updated by its creator.',
      });
    expect(updated.status).toBe(200);
    expect(updated.body).toMatchObject({
      id: created.id,
      name: typeName('type_crud_updated'),
      description: 'Updated by its creator.',
      created_by: primaryLecturer.id,
    });

    const deleted = await request(app)
      .delete(`/api/exam-types/${created.id}`)
      .set('Authorization', primaryAuthorization);
    expect(deleted.status).toBe(204);

    const afterDelete = await request(app)
      .get('/api/exam-types')
      .set('Authorization', primaryAuthorization);
    expect(afterDelete.status).toBe(200);
    expect(afterDelete.body.some((examType) => examType.id === created.id)).toBe(false);
  });

  test('enforces case-insensitive name uniqueness', async () => {
    const name = typeName('duplicate_type');
    await createExamType(primaryAuthorization, 'duplicate_type');

    const duplicate = await request(app)
      .post('/api/exam-types')
      .set('Authorization', primaryAuthorization)
      .send({ name: name.toUpperCase(), description: 'Duplicate casing.' });

    expect(duplicate.status).toBe(409);
    expect(duplicate.body).toHaveProperty('error');
  });

  test('shares types for use while hiding creator-owned mutations from other lecturers', async () => {
    const examType = await createExamType(primaryAuthorization, 'shared_owned_type');

    const secondaryList = await request(app)
      .get('/api/exam-types')
      .set('Authorization', secondaryAuthorization);
    expect(secondaryList.status).toBe(200);
    expect(secondaryList.body).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: examType.id,
        created_by: primaryLecturer.id,
      }),
    ]));

    const secondaryExam = await createExam(
      secondaryAuthorization,
      examType.id,
      'shared_type_secondary_exam',
    );
    expect(secondaryExam).toMatchObject({
      lecturer_id: secondaryLecturer.id,
      exam_type_id: examType.id,
    });

    const nonOwnerUpdate = await request(app)
      .patch(`/api/exam-types/${examType.id}`)
      .set('Authorization', secondaryAuthorization)
      .send({ name: typeName('non_owner_update') });
    const nonOwnerDelete = await request(app)
      .delete(`/api/exam-types/${examType.id}`)
      .set('Authorization', secondaryAuthorization);
    expect(nonOwnerUpdate.status).toBe(404);
    expect(nonOwnerDelete.status).toBe(404);

    const ownerDelete = await request(app)
      .delete(`/api/exam-types/${examType.id}`)
      .set('Authorization', primaryAuthorization);
    expect(ownerDelete.status).toBe(409);
    expect(ownerDelete.body).toHaveProperty('error');
  });

  test('rejects invalid IDs, unsupported fields, and empty updates', async () => {
    const examType = await createExamType(primaryAuthorization, 'type_validation');
    const responses = [
      await request(app)
        .patch('/api/exam-types/not-an-id')
        .set('Authorization', primaryAuthorization)
        .send({ name: typeName('invalid_route_id') }),
      await request(app)
        .delete('/api/exam-types/0')
        .set('Authorization', primaryAuthorization),
      await request(app)
        .post('/api/exam-types')
        .set('Authorization', primaryAuthorization)
        .send({ name: typeName('unsupported_create'), visibility: 'public' }),
      await request(app)
        .patch(`/api/exam-types/${examType.id}`)
        .set('Authorization', primaryAuthorization)
        .send({ created_by: secondaryLecturer.id }),
      await request(app)
        .patch(`/api/exam-types/${examType.id}`)
        .set('Authorization', primaryAuthorization)
        .send({}),
    ];

    for (const response of responses) {
      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    }
  });
});

describe('exam authorization', () => {
  test('requires authentication for the exam collection', async () => {
    const response = await request(app).get('/api/exams');
    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Authentication required.' });
  });

  test('rejects every student exam operation', async () => {
    const examType = await createExamType(primaryAuthorization, 'student_exam_boundary_type');
    const exam = await createExam(
      primaryAuthorization,
      examType.id,
      'student_exam_boundary',
    );
    const responses = [
      await request(app)
        .get('/api/exams')
        .set('Authorization', studentAuthorization),
      await request(app)
        .get(`/api/exams/${exam.id}`)
        .set('Authorization', studentAuthorization),
      await request(app)
        .post('/api/exams')
        .set('Authorization', studentAuthorization)
        .send({ exam_type_id: examType.id, title: 'Forbidden student exam' }),
      await request(app)
        .patch(`/api/exams/${exam.id}`)
        .set('Authorization', studentAuthorization)
        .send({ title: 'Forbidden student update' }),
      await request(app)
        .delete(`/api/exams/${exam.id}`)
        .set('Authorization', studentAuthorization),
    ];

    expectForbidden(responses);
  });
});

describe('lecturer exam authoring', () => {
  test('allows an owner to create, list, read, update, and delete a draft exam', async () => {
    const originalType = await createExamType(primaryAuthorization, 'exam_crud_original');
    const replacementType = await createExamType(primaryAuthorization, 'exam_crud_replacement');
    const created = await createExam(primaryAuthorization, originalType.id, 'exam_crud');

    expect(created).toMatchObject({
      lecturer_id: primaryLecturer.id,
      exam_type_id: originalType.id,
      title: 'Test-only exam_crud exam',
      description: 'Created for exam_crud.',
      status: 'draft',
      exam_type: {
        id: originalType.id,
        name: originalType.name,
      },
      question_count: 0,
    });

    const listed = await request(app)
      .get('/api/exams')
      .set('Authorization', primaryAuthorization);
    expect(listed.status).toBe(200);
    expect(listed.body).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: created.id, lecturer_id: primaryLecturer.id }),
    ]));

    const read = await request(app)
      .get(`/api/exams/${created.id}`)
      .set('Authorization', primaryAuthorization);
    expect(read.status).toBe(200);
    expect(read.body).toMatchObject({
      id: created.id,
      exam_type: { id: originalType.id },
    });

    const updated = await request(app)
      .patch(`/api/exams/${created.id}`)
      .set('Authorization', primaryAuthorization)
      .send({
        exam_type_id: replacementType.id,
        title: 'Updated integration exam',
        description: 'Updated by its owner.',
      });
    expect(updated.status).toBe(200);
    expect(updated.body).toMatchObject({
      id: created.id,
      lecturer_id: primaryLecturer.id,
      exam_type_id: replacementType.id,
      title: 'Updated integration exam',
      description: 'Updated by its owner.',
      status: 'draft',
      exam_type: {
        id: replacementType.id,
        name: replacementType.name,
      },
    });

    const deleted = await request(app)
      .delete(`/api/exams/${created.id}`)
      .set('Authorization', primaryAuthorization);
    expect(deleted.status).toBe(204);

    const afterDelete = await request(app)
      .get(`/api/exams/${created.id}`)
      .set('Authorization', primaryAuthorization);
    expect(afterDelete.status).toBe(404);
  });

  test('hides one lecturer\'s exams from every other lecturer operation', async () => {
    const examType = await createExamType(primaryAuthorization, 'exam_ownership_type');
    const exam = await createExam(primaryAuthorization, examType.id, 'exam_ownership');

    const secondaryList = await request(app)
      .get('/api/exams')
      .set('Authorization', secondaryAuthorization);
    const foreignRead = await request(app)
      .get(`/api/exams/${exam.id}`)
      .set('Authorization', secondaryAuthorization);
    const foreignUpdate = await request(app)
      .patch(`/api/exams/${exam.id}`)
      .set('Authorization', secondaryAuthorization)
      .send({ title: 'Foreign update must not be applied.' });
    const foreignDelete = await request(app)
      .delete(`/api/exams/${exam.id}`)
      .set('Authorization', secondaryAuthorization);

    expect(secondaryList.status).toBe(200);
    expect(secondaryList.body.some((listedExam) => listedExam.id === exam.id)).toBe(false);
    expect(foreignRead.status).toBe(404);
    expect(foreignUpdate.status).toBe(404);
    expect(foreignDelete.status).toBe(404);

    const ownerRead = await request(app)
      .get(`/api/exams/${exam.id}`)
      .set('Authorization', primaryAuthorization);
    expect(ownerRead.status).toBe(200);
    expect(ownerRead.body.title).toBe(exam.title);
  });

  test('rejects missing, malformed, and unknown exam types', async () => {
    const examType = await createExamType(primaryAuthorization, 'exam_type_validation');
    const exam = await createExam(primaryAuthorization, examType.id, 'exam_type_validation');
    const unknownExamTypeId = 2147483647;
    const responses = [
      await request(app)
        .post('/api/exams')
        .set('Authorization', primaryAuthorization)
        .send({ title: 'Missing exam type' }),
      await request(app)
        .post('/api/exams')
        .set('Authorization', primaryAuthorization)
        .send({ exam_type_id: 'not-an-integer', title: 'Malformed exam type' }),
      await request(app)
        .post('/api/exams')
        .set('Authorization', primaryAuthorization)
        .send({ exam_type_id: unknownExamTypeId, title: 'Unknown exam type' }),
      await request(app)
        .patch(`/api/exams/${exam.id}`)
        .set('Authorization', primaryAuthorization)
        .send({ exam_type_id: unknownExamTypeId }),
    ];

    for (const response of responses) {
      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    }
  });

  test('rejects server-managed fields, unsupported fields, and empty patches', async () => {
    const examType = await createExamType(primaryAuthorization, 'exam_payload_validation');
    const exam = await createExam(primaryAuthorization, examType.id, 'exam_payload_validation');
    const responses = [
      await request(app)
        .post('/api/exams')
        .set('Authorization', primaryAuthorization)
        .send({ exam_type_id: examType.id, title: 'Managed state', status: 'published' }),
      await request(app)
        .patch(`/api/exams/${exam.id}`)
        .set('Authorization', primaryAuthorization)
        .send({ lecturer_id: secondaryLecturer.id }),
      await request(app)
        .patch(`/api/exams/${exam.id}`)
        .set('Authorization', primaryAuthorization)
        .send({ future_field: true }),
      await request(app)
        .patch(`/api/exams/${exam.id}`)
        .set('Authorization', primaryAuthorization)
        .send({}),
    ];

    for (const response of responses) {
      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    }
  });

  test('rejects invalid exam route IDs', async () => {
    const responses = [
      await request(app)
        .get('/api/exams/0')
        .set('Authorization', primaryAuthorization),
      await request(app)
        .patch('/api/exams/not-an-id')
        .set('Authorization', primaryAuthorization)
        .send({ title: 'Invalid route ID' }),
      await request(app)
        .delete('/api/exams/9007199254740992')
        .set('Authorization', primaryAuthorization),
    ];

    for (const response of responses) {
      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    }
  });

  test('rejects update and deletion of a directly arranged published exam', async () => {
    const examType = await createExamType(primaryAuthorization, 'published_exam_type');
    const exam = await createExam(primaryAuthorization, examType.id, 'published_exam');
    const arranged = await pool.query(
      `UPDATE exams
       SET status = 'published', published_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING status, published_at`,
      [exam.id],
    );
    expect(arranged.rows[0].status).toBe('published');
    expect(arranged.rows[0].published_at).not.toBeNull();

    const update = await request(app)
      .patch(`/api/exams/${exam.id}`)
      .set('Authorization', primaryAuthorization)
      .send({ title: 'Published exam must remain unchanged' });
    const deletion = await request(app)
      .delete(`/api/exams/${exam.id}`)
      .set('Authorization', primaryAuthorization);

    expect(update.status).toBe(409);
    expect(deletion.status).toBe(409);
    expect(update.body.error).toBe(deletion.body.error);
    expect(update.body.error).toMatch(/before (modifying|updating or deleting)/i);

    const persisted = await pool.query(
      'SELECT title, status FROM exams WHERE id = $1',
      [exam.id],
    );
    expect(persisted.rows[0]).toMatchObject({
      title: exam.title,
      status: 'published',
    });
  });
});
