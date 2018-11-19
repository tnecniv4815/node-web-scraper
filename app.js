const rp = require('request-promise');
const cheerio = require('cheerio');
const _ = require('lodash');
const moment = require('moment');

const articleBucketName = 'article-bucket-55895cd0-e240-11e8-8c69-036b726f6b89';
const region = 'ap-southeast-1';
const articleLinkQueueName = 'ArticleLinkQueue';
const articleQueueName = 'ArticleQueue';

const AWS = require('aws-sdk');
const sqs = new AWS.SQS({
    region: region
});
const s3 = new AWS.S3();


//
const url = 'https://gnn.gamer.com.tw/index.php?k=';

const fileExtension = 'json';
const s3Articles = 'articles';
const s3ArticleLinks = 'articleLink';
const s3ArticleDetail = 'articleDetail';
const s3Media = 'media';

exports.handler = async (event, context, callback) => {

    let handlerResult;

    console.log('Loading...');

    console.log('Start scraping data');

    // const params = {
    //     Bucket: bucketName,
    //     Key: 'articles/testing.json',
    //     Body: '{"title":"《天堂 M》《新楓之谷》等作推出「橘子揪好玩週年慶」活動 祭出歐洲、非洲來回機票","thumbnail":"https://p2.bahamut.com.tw/S/2KU/90","link":"https:://gnn.gamer.com.tw/0/171000.html"}'
    // };
    // s3.upload(params, (err, data) => {
    //     if (err) {
    //         console.log('error in callback');
    //         console.log(err);
    //     }
    //     console.log('success');
    //     console.log(data);
    // });


    // 'articles/testing.json'

    // const response = '{"title":"《天堂 M》《新楓之谷》等作推出「橘子揪好玩週年慶」活動 祭出歐洲、非洲來回機票","thumbnail":"https://p2.bahamut.com.tw/S/2KU/90","link":"https:://gnn.gamer.com.tw/0/171000.html"}';
    //
    // createObjectInS3Bucket(articleBucketName, 'articles', 'g9g.json', response)
    //     .then(data => {
    //         console.log('createObjectInS3Bucket_data: ', data);
    //     })
    //     .catch(err => {
    //         console.log('createObjectInS3Bucket_err: ', err);
    //     });

    // createObjectInS3Bucket(articleBucketName, s3Articles, 'good.json', response)
    //     .then(data => {
    //         console.log('createObjectInS3Bucket_success: ', data);
    //     })
    //     .catch(err => {
    //         console.log('createObjectInS3Bucket_err: ', err);
    //     });


    // const result = await createObjectInS3Bucket(articleBucketName, s3Articles, 'good.json', response);
    // console.log('createObjectInS3Bucket_result: ', result);



    // listS3BucketsDirectories(articleBucketName, '/articles')
    //     .then(data => {
    //         console.log('listS3BucketsDirectories_data: ', data);
    //
    //         const isFound = isFileExistInS3Bucket(data, 'articles/testing.json');
    //         console.log('isFound: ' + isFound);
    //
    //
    //     })
    //     .catch(err => {
    //         console.log('listS3BucketsDirectories_err: ', err);
    //     });





    // deleteObjectInS3Bucket(articleBucketName, s3Articles, 'nice.json')
    //     .then(data => {
    //         console.log('deleteObjectInS3Bucket_data: ', data);
    //     })
    //     .catch(error => {
    //         console.log('deleteObjectInS3Bucket_error: ', error);
    //     })




    const scrapeResult = await rp(url);
    // console.log('scrapeResult: ', scrapeResult.length);

    if (scrapeResult != null && scrapeResult.length > 0) {
        const news = extractListFromHtml(scrapeResult);
        // console.log('news_length: ', news.length);

        if (news.length > 0) {
            const tmpList = _.drop(news, Math.max(0, news.length-3));

            handlerResult = tmpList;

            // insert news into S3 (article)
            const listBucketResult = await listS3BucketsDirectories(articleBucketName, '/' + s3Articles);
            if (listBucketResult != null) {
                console.log('listS3BucketsDirectories_success');

                for (const newsObj of tmpList) {
                    const filename = newsObj.title + '.' + fileExtension;
                    const fullPath = s3Articles + '/' + filename;

                    // console.log(listBucketResult);

                    const isFound = isFileExistInS3Bucket(listBucketResult, fullPath);
                    console.log('isFileExistInS3Bucket: ', isFound, ' , filename: ', filename, '\n\n' );
                    if (!isFound) {
                        const newsJsonStr = JSON.stringify(newsObj);

                        const createObjResult = await createObjectInS3Bucket(articleBucketName, s3Articles, filename, newsJsonStr);
                        if (createObjResult != null) {
                            console.log('Create file in S3 bucket: ', filename, ' path: ', s3Articles);
                        }

                    }
                }
            }

            // insert news into S3 (article link)
            const listLinkBucketResult = await listS3BucketsDirectories(articleBucketName, '/' + s3ArticleLinks);
            if (listLinkBucketResult != null) {
                console.log('listLinkBucketResult_success');

                for (const newsObj of tmpList) {
                    const filename = newsObj.title + '.' + fileExtension;
                    const fullPath = s3ArticleLinks + '/' + filename;

                    const isFound = isFileExistInS3Bucket(listLinkBucketResult, fullPath);
                    console.log('isFileExistInS3Bucket: ', isFound, ' , filename: ', filename, '\n\n' );
                    if (!isFound) {
                        const newsJsonStr = JSON.stringify(newsObj);

                        const createLinkObjResult = await createObjectInS3Bucket(articleBucketName, s3ArticleLinks, filename, newsJsonStr);
                        if (createLinkObjResult != null) {
                            console.log('Create file in S3 bucket: ', filename, ' path: ', s3ArticleLinks);
                        }

                    }
                }

            }
        }
    }







/*



        rp(url)
            .then(function (html) {
                //success!
                console.log('Scrape completed');

                console.log('length: ', html.length);
                // console.log($('big > a', html));
                // console.log(html);

                const news = extractListFromHtml(html);
                console.log('news_length: ', news.length);

                if (news.length > 0) {
                    // listSQSQueues()
                    //     .then(sqsResult => {
                    //         if (!_.isNull(sqsResult)) {
                    //             const queueUrls = sqsResult.QueueUrls;
                    //             if (queueUrls.length > 0) {
                    //                 const targetQueueUrl = findSQSQueue(queueUrls, articleQueueName);
                    //                 if (targetQueueUrl !== '') {
                    //                     console.log('targetQueueUrl: ', targetQueueUrl);
                    //
                    //                     const tmpList = _.drop(news, news.length-3);
                    //
                    //                     // _.forEach(tmpList, (newsObj) => {
                    //                     //     const newsObjStr = JSON.stringify(newsObj);
                    //                     //     console.log('newsObjStr: ', newsObjStr, '\n');
                    //                     //
                    //                     //     addMessageToSQSQueue(targetQueueUrl, JSON.stringify(newsObjStr))
                    //                     //         .then(result => {
                    //                     //             console.log('result: ', result);
                    //                     //         })
                    //                     //         .catch(error => {
                    //                     //             console.log('error: ', error);
                    //                     //         });
                    //                     //
                    //                     // });
                    //
                    //                     // if (news.length > 0) {
                    //                     //     const firstNewsObj = news[0];
                    //                     //     const firstNewsObjStr = JSON.stringify(firstNewsObj);
                    //                     //
                    //                     //     console.log('firstNewsObjStr: ', firstNewsObjStr);
                    //                     //
                    //                     //     addMessageToSQSQueue(targetQueueUrl, JSON.stringify(firstNewsObj))
                    //                     //         .then(result => {
                    //                     //             console.log('result: ', result);
                    //                     //         })
                    //                     //         .catch(error => {
                    //                     //             console.log('error: ', error);
                    //                     //         });
                    //                     // }
                    //
                    //
                    //                 }
                    //             }
                    //         }
                    //     })
                    //     .catch(err => {
                    //         console.log('listSQSQueues_error');
                    //         console.log(err);
                    //     });



                    const tmpList = _.drop(news, Math.max(0, news.length-3));






                    // insert news into S3 (article)
                    listS3BucketsDirectories(articleBucketName, '/' + s3Articles)
                        .then(data => {
                            console.log('listS3BucketsDirectories_data: ', data, '\n\n');

                            for (const newsObj of tmpList) {
                                const filename = newsObj.title + '.' + fileExtension;
                                const fullPath = s3Articles + '/' + filename;

                                const isFound = isFileExistInS3Bucket(data, fullPath);
                                console.log('isFileExistInS3Bucket: ', isFound, ' , filename: ', filename, '\n\n' );
                                if (!isFound) {
                                    const newsJsonStr = JSON.stringify(newsObj);

                                    createObjectInS3Bucket(articleBucketName, s3Articles, filename, newsJsonStr)
                                        .then(data => {
                                            console.log('Create file in S3 bucket: ', filename, ' path: ', s3Articles);
                                        })
                                        .catch(err => {
                                            console.log('createObjectInS3Bucket_err: ', err);
                                        });

                                }
                            }


                        })
                        .catch(err => {
                            console.log('listS3BucketsDirectories_err: ', err);
                        });



                    // insert news into S3 (article link)
                    listS3BucketsDirectories(articleBucketName, '/' + s3ArticleLinks)
                        .then(data => {
                            console.log('listS3BucketsDirectories_data: ', data, '\n\n');

                            for (const newsObj of tmpList) {
                                const filename = newsObj.title + '.' + fileExtension;
                                const fullPath = s3ArticleLinks + '/' + filename;

                                const isFound = isFileExistInS3Bucket(data, fullPath);
                                console.log('isFileExistInS3Bucket: ', isFound, ' , filename: ', filename, '\n\n' );
                                if (!isFound) {
                                    const newsJsonStr = JSON.stringify(newsObj);

                                    createObjectInS3Bucket(articleBucketName, s3ArticleLinks, filename, newsJsonStr)
                                        .then(data => {
                                            console.log('Create file in S3 bucket: ', filename, ' path: ', s3ArticleLinks);
                                        })
                                        .catch(err => {
                                            console.log('createObjectInS3Bucket_err: ', err);
                                        });

                                }
                            }

                        })
                        .catch(err => {
                            console.log('listS3BucketsDirectories_err: ', err);
                        });


                }


            })
            .catch(function (err) {
                //handle error
                console.log('Scrape failure');
                console.error(err);
            });

        */






    return handlerResult;


};

/**
 * Common
 */
function getCurrentTime() {
    const dateFormat = 'yyyy-mm-dd_hh:mm:ss';
    const datetime = moment().format(dateFormat);

    return datetime;
}


/**
 * Scraping
 */

function extractListFromHtml(html) {
    let list = [];

    const $ = cheerio.load(html);

    const dataRows = $('.GN-lbox2B');

    _.forEach(dataRows, (element) => {
        const title = $(element).find('.GN-lbox2D a').text().trim();
        const thumbnail = $(element).find('.GN-lbox2E img').attr('src');
        const link = 'https:' + $(element).find('.GN-lbox2E a').attr('href');

        // console.log('title: ', title);
        // console.log('thumbnail: ', thumbnail);
        // console.log('link: ', link);
        //
        // console.log('\n');

        const obj = {
            title: title,
            thumbnail: thumbnail,
            link: link
        };

        list.push(obj);

    });

    return list;
}



/**
 * SQS Queue
 */

function listSQSQueues() {
    return new Promise((resolve, reject) => {
        console.log('listQueues');
        sqs.listQueues(function (err, data) {
            if (err) {
                console.log('listQueuesErr: ', JSON.stringify(err));
                // console.log(err);
                reject(err);
            } else {
                console.log('listQueuesSuccess: ', JSON.stringify(data));
                // console.log(data);
                resolve(data);
            }
        });
    });
}

function findSQSQueue(queueUrls, targetQueueName) {
    let targetUrl = '';
    _.forEach(queueUrls, (queueUrl) => {
        const queueName = queueUrl.split('/').pop();
        // console.log('queueName: ', queueName);

        if (queueName === targetQueueName) {
            targetUrl = queueUrl;
        }
    });

    return targetUrl;
}

function addMessageToSQSQueue(queueUrl, message) {
    return new Promise((resolve, reject) => {
        const params = {
            MessageBody: message,
            QueueUrl: queueUrl,
            DelaySeconds: 0
        };

        console.log('addMessageToSQSQueue: ', queueUrl, ' message: ', message);
        sqs.sendMessage(params, function (err, data) {
            if (err) {
                console.log('sendMessage err: ', err);
                reject(err);
            }
            else {
                console.log('sendMessage success: ', data);
                resolve(data);
            }
        });
    })
}

/**
 * S3 Bucket
 */
function isFileExistInS3Bucket(s3Result, targetFileFullPath) {
    // targetFilePath: articles/testing.json

    let isFound = false;

    const contents = s3Result.Contents;

    if (!_.isNull(contents) && contents.length > 0) {
        _.forEach(contents, (content) => {
            const key = content.Key;

            if (key === targetFileFullPath) {
                isFound = true;
                return isFound;
            }

        });
    }

    return isFound;
}

function listS3BucketsDirectories(bucketName, directory) {
    // return new Promise ((resolve, reject) => {
    //     const s3params = {
    //         Bucket: bucketName,
    //         MaxKeys: 20,
    //         Delimiter: directory,
    //     };
    //     s3.listObjectsV2 (s3params, (err, data) => {
    //         if (err) {
    //             reject (err);
    //         }
    //         resolve (data);
    //     });
    // });
    const s3params = {
        Bucket: bucketName,
        MaxKeys: 20,
        Delimiter: directory,
    };
    return s3.listObjectsV2 (s3params).promise();
}

// async function createObjectInS3Bucket(bucketName, directory, fileNameWithExt, body) {
//     return new Promise((resolve, reject) => {
//         const params = {
//             Bucket: bucketName,
//             Key: directory + '/' + fileNameWithExt,
//             Body: body
//         };
//         s3.upload(params, (err, data) => {
//             if (err) {
//                 console.log('createObjectInS3Bucket_success error in callback');
//                 console.log(err);
//                 reject(err);
//             }
//             console.log('createObjectInS3Bucket_success');
//             console.log(data);
//             resolve(data);
//         });
//     });
// }

function createObjectInS3Bucket(bucketName, directory, fileNameWithExt, body) {
    // return new Promise((resolve, reject) => {
    //     const params = {
    //         Bucket: bucketName,
    //         Key: directory + '/' + fileNameWithExt,
    //         Body: body
    //     };
    //     s3.upload(params, (err, data) => {
    //         if (err) {
    //             // console.log('error in callback');
    //             // console.log(err);
    //             reject(err);
    //         }
    //         // console.log('success');
    //         // console.log(data);
    //         resolve(data);
    //     });
    // });
    const params = {
        Bucket: bucketName,
        Key: directory + '/' + fileNameWithExt,
        Body: body
    };
    return s3.upload(params).promise();
}

function deleteObjectInS3Bucket(bucketName, directory, fileNameWithExt) {
    return new Promise((resolve, reject) => {
        const params = {
            Bucket: bucketName,
            Key: directory + '/' + fileNameWithExt
        };
        s3.deleteObject(params, function(err, data) {
            if (err) {
                // console.log(err, err.stack);
                reject(err)
            }
            else     console.log(data);           // successful response
            /*
            data = {
            }
            */
        });
    });
}


/**
 *
 */

