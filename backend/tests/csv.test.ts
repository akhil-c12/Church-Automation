import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { API_URL, echo, login, makeApp, mockN8n, useMsw } from './helpers.js';

useMsw();

let app: ReturnType<typeof makeApp>['app'];
let cookie: string;

beforeEach(async () => {
  ({ app } = makeApp());
  cookie = await login(app);
});

const upload = (path: string, csv: string | Buffer, filename = 'members.csv', contentType = 'text/csv') =>
  request(app)
    .post(path)
    .set('Cookie', cookie)
    .attach('file', Buffer.isBuffer(csv) ? csv : Buffer.from(csv), { filename, contentType });

describe('CSV import', () => {
  it('maps headers case-insensitively, normalises Yes/No and status, drops unknown columns and empty cells', async () => {
    const calls = mockN8n(API_URL, echo);
    const csv = [
      '﻿Member ID,FULL_NAME,mobile number,DOB,WhatsApp,Status,Remarks,Created_At',
      'CH1,Mary Joseph,9876543210,1992-01-05,yes,active,,2024-01-01',
      'CH2,"Doe, John",9876543211,1985-07-22,No,Inactive,Moved away,',
    ].join('\r\n');
    const res = await upload('/members/import', csv);
    expect(res.status).toBe(200);
    expect(calls[0]!.body.action).toBe('upsert_members');
    expect(calls[0]!.body.data).toEqual({
      records: [
        { member_id: 'CH1', full_name: 'Mary Joseph', mobile_number: '9876543210', date_of_birth: '1992-01-05', whatsapp_enabled: 'Yes', status: 'Active' },
        {
          member_id: 'CH2',
          full_name: 'Doe, John',
          mobile_number: '9876543211',
          date_of_birth: '1985-07-22',
          whatsapp_enabled: 'No',
          status: 'Inactive',
          remarks: 'Moved away',
        },
      ],
    });
  });

  it('ignores columns named like Object.prototype members', async () => {
    const calls = mockN8n(API_URL, echo);
    const res = await upload('/members/import', 'member_id,constructor,toString,__proto__,hasOwnProperty\nCH1,a,b,c,d');
    expect(res.status).toBe(200);
    expect(calls[0]!.body.data).toEqual({ records: [{ member_id: 'CH1' }] });
  });

  it('also works for /members/verify', async () => {
    const calls = mockN8n(API_URL, echo);
    const res = await upload('/members/verify', 'member_id,full_name\nCH1,Mary');
    expect(res.status).toBe(200);
    expect(calls[0]!.body.action).toBe('verify_members');
  });

  it('accepts exactly 500 rows and rejects 501', async () => {
    const calls = mockN8n(API_URL, echo);
    const rows = (n: number) => ['member_id', ...Array.from({ length: n }, (_, i) => `M${i}`)].join('\n');
    expect((await upload('/members/import', rows(500))).status).toBe(200);
    const res = await upload('/members/import', rows(501));
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/500/);
    expect(calls).toHaveLength(1);
  });

  it('reports invalid values with spreadsheet row numbers', async () => {
    const calls = mockN8n(API_URL, echo);
    const res = await upload('/members/import', 'member_id,whatsapp_enabled\nCH1,Yes\nCH2,maybe');
    expect(res.status).toBe(400);
    expect(res.body.error.details[0]).toMatchObject({ row: 3, path: 'whatsapp_enabled' });
    expect(calls).toHaveLength(0);
  });

  it('rejects CSVs without a member id column, duplicate columns, empty files and ragged rows', async () => {
    mockN8n(API_URL, echo);
    expect((await upload('/members/import', 'name,phone\nMary,1')).status).toBe(400);
    expect((await upload('/members/import', 'member_id,id\nA,B')).status).toBe(400);
    expect((await upload('/members/import', 'member_id\n')).status).toBe(400);
    expect((await upload('/members/import', '')).status).toBe(400);
    expect((await upload('/members/import', 'member_id,full_name\nA,B,C')).status).toBe(400);
  });

  it('rejects non-CSV files and wrong field names', async () => {
    mockN8n(API_URL, echo);
    expect((await upload('/members/import', 'member_id\nA', 'members.exe', 'application/x-msdownload')).status).toBe(400);
    expect((await upload('/members/import', Buffer.from([0x4d, 0x5a, 0x00, 0x01]), 'x.csv')).status).toBe(400);
    const wrongField = await request(app)
      .post('/members/import')
      .set('Cookie', cookie)
      .attach('upload', Buffer.from('member_id\nA'), { filename: 'm.csv', contentType: 'text/csv' });
    expect(wrongField.status).toBe(400);
  });

  it('rejects files over 2 MB with 413', async () => {
    mockN8n(API_URL, echo);
    const big = 'member_id,remarks\n' + `A,${'x'.repeat(2 * 1024 * 1024)}`;
    const res = await upload('/members/import', big);
    expect(res.status).toBe(413);
  });

  it('requires auth for uploads', async () => {
    const res = await request(app).post('/members/import').attach('file', Buffer.from('member_id\nA'), 'm.csv');
    expect(res.status).toBe(401);
  });
});
