
console.log('init.....');

const app = require('./app');
const data = app.handler({});

console.log('data: ', JSON.stringify(data));

console.log('finish...');