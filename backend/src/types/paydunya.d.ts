// The `paydunya` package ships no TypeScript declarations (plain CommonJS).
// PaydunyaProvider is the only place that imports it and gives its surface
// proper types — everywhere else in the app stays fully typed.
declare module 'paydunya';
