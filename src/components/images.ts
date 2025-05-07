import {Components, MiddlewareComponent} from '../app';
import {getRoutes} from '../routes/images';

export function imageComponents(iiifBaseURL: string, cudlBaseURL: string): Components {
  return new MiddlewareComponent({
    path: '/v1/images',
    handler: getRoutes(iiifBaseURL, cudlBaseURL),
  });
}
