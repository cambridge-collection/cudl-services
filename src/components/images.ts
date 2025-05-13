import {Components, MiddlewareComponent} from '../app';
import {getRoutes} from '../routes/images';

export function imageComponents(iiifBaseURL: string, iiifBaseURLCredentials: string, cudlBaseURL: string, cudlBaseURLCredentials: string): Components {
  return new MiddlewareComponent({
    path: '/v1/images',
    handler: getRoutes(iiifBaseURL, iiifBaseURLCredentials, cudlBaseURL, cudlBaseURLCredentials),
  });
}
