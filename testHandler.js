
console.log('init.....');

const app = require('./app');
let data;


// data = app.articleHandler({});
data = app.articleStoreHandler({});
// data = app.articleDetailHandler({});
// data = app.detailStoreHandler({});


console.log('data: ', JSON.stringify(data));

// const _ = require('lodash');
//
// const link = '123/456/798/012';
// const title = replaceAll(link, '/', ' ');
//
// console.log(link);
// console.log(title);





console.log('finish...');