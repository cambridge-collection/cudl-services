import * as darwin from '../routes/darwin';
import {fnComponent} from '../app';
import {getPassport} from './api-key-auth';
import {URL} from 'url';

export interface DarwinProxyComponentOptions {
  darwinXtfUrl: URL;
}
export function darwinProxyComponents(options: DarwinProxyComponentOptions) {
  return fnComponent(app => {
    app.use(
      '/v1/darwin',
      getPassport(app).authenticate('token', {session: false}),
      darwin.getRoutes({darwinXtfUrl: String(options.darwinXtfUrl)})
    );
  });
}
