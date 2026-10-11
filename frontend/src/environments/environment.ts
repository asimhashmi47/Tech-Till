export const environment = {
  production: true,

  // The app and the API are served from one origin in production, which is what keeps
  // the Content Security Policy's connect-src on 'self'. In development the Angular dev
  // server proxies /api to the backend, so this value does not change between builds.
  apiBaseUrl: '/api',
};
