import express from 'express';
import fs from 'fs';
import {BAD_REQUEST, INTERNAL_SERVER_ERROR, NOT_FOUND, OK} from 'http-status-codes';
import path from 'path';
import request from 'supertest';
import {promisify} from 'util'

import {getRoutes, MetadataOptions} from '../../src/routes/metadata';

const DATA = path.resolve(__dirname, '../data');

function getTestConfig(): MetadataOptions {
    return {dataDir: path.resolve(DATA, 'metadata')}
}

function getTestApp() {
    const app = express();
    app.use('/', getRoutes(getTestConfig()));
    return app;
}

describe(`metadata routes /:format/:id`, () => {

    test('/json/:id reponds with JSON metadata', async() => {
        const response = await request(getTestApp())
            .get(`/json/MS-ADD-03959`);
        expect(response.status).toBe(OK);
        expect(response.get('content-type')).toBe('application/json; charset=utf-8');
        expect(response.body).toEqual(
            JSON.parse(await promisify(fs.readFile)(
                path.resolve(DATA, 'metadata/json/MS-ADD-03959.json'),
                'utf-8')));
    });

    test('/json/:id responds with 404 for missing ID', async() => {
        const response = await request(getTestApp())
            .get(`/json/MS-MISSING`);
        expect(response.status).toBe(NOT_FOUND);
    });

    test('/json/:id responds with 500 for invalid metadata', async() => {
        const response = await request(getTestApp())
            .get(`/json/INVALID`);
        expect(response.status).toBe(INTERNAL_SERVER_ERROR);
    });

    test.each([
        ['format', `/${encodeURIComponent('abc/def')}/foo`],
        ['id', `/foo/${encodeURIComponent('abc/def')}`],
    ])('%s param cannot contain slashes', async (param, url) => {
        const response = await request(getTestApp())
            .get(url);
        expect(response.status).toBe(BAD_REQUEST);
    });

    test('/:format/:id responds with 500 for invalid metadata when requesting non-json metadata', async() => {
        const response = await request(getTestApp())
            .get(`/tei/INVALID`);
        expect(response.status).toBe(INTERNAL_SERVER_ERROR);
    });

    test('/:format/:id responds with 500 for invalid metadata when requesting non-json metadata', async() => {
        const response = await request(getTestApp())
            .get(`/tei/INVALID`);
        expect(response.status).toBe(INTERNAL_SERVER_ERROR);
    });
});
