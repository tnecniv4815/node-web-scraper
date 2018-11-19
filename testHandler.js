
console.log('init.....');

const app = require('./app');
const data = app.handler({});
console.log('data: ', JSON.stringify(data));

// const _ = require('lodash');
//
// const link = '123/456/798/012';
// const title = replaceAll(link, '/', ' ');
//
// console.log(link);
// console.log(title);





console.log('finish...');