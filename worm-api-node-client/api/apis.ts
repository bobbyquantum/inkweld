export * from './embeddingAPIApi';
import { EmbeddingAPIApi } from './embeddingAPIApi';
export * from './fileAPIApi';
import { FileAPIApi } from './fileAPIApi';
export * from './projectAPIApi';
import { ProjectAPIApi } from './projectAPIApi';
export * from './projectElementsAPIApi';
import { ProjectElementsAPIApi } from './projectElementsAPIApi';
export * from './userAPIApi';
import { UserAPIApi } from './userAPIApi';
import * as http from 'http';

export class HttpError extends Error {
    constructor (public response: http.IncomingMessage, public body: any, public statusCode?: number) {
        super('HTTP request failed');
        this.name = 'HttpError';
    }
}

export { RequestFile } from '../model/models';

export const APIS = [EmbeddingAPIApi, FileAPIApi, ProjectAPIApi, ProjectElementsAPIApi, UserAPIApi];
