const AWS = require('aws-sdk');
const rp = require('request-promise');
const cheerio = require('cheerio');
const _ = require('lodash');
const moment = require('moment');
const request = require('request');
// const Url = require('url');
// const Path = require('path');
const uuidv5 = require('uuid/v5');
// const async = require('async');
const crypto = require('crypto-js');

//
const url = 'https://gnn.gamer.com.tw/index.php?k=';

const fileExtension = 'json';

const region = 'ap-southeast-1';

// S3 bucket
const articleBucketName = 'article-bucket-55895cd0-e240-11e8-8c69-036b726f6b89';

// S3
const s3Articles = 'articles';
const s3ArticleLinks = 'articleLink';
const s3ArticleDetail = 'articleDetail';
const s3Media = 'media';

// SQS
const articleLinkQueueName = 'ArticleLinkQueue';
const articleQueueName = 'ArticleQueue';

// DynamoDB
const articleTableName = 'article';
const articleDetailTableName = 'articleDetail';

// AWS
const sqs = new AWS.SQS({
    region: region
});
const s3 = new AWS.S3();
const ddb = new AWS.DynamoDB({
    region: region
});
const docClient = new AWS.DynamoDB.DocumentClient({
    region: region
});


const ARTICLE_CONTENT_TYPE = {
    TEXT: 0,
    IMAGE: 1,
};


/**
 * Article Detail Lambda function (Scraper)
 */
exports.articleDetailHandler = async (event, context, callback) => {
    let handlerResult;
    console.log('Loading...');
    console.log('Start scraping detail');

    handlerResult = {
        result: 'detailHandler'
    };


    const listBucketResult = await listS3BucketsDirectories(articleBucketName, '/' + s3ArticleLinks);
    if (listBucketResult != null) {
        const s3ResultList = getContentListFromBucketResult(listBucketResult);
        // console.log('listS3BucketsDirectories_success: ', listBucketResult);

        if (!_.isNull(s3ResultList) && s3ResultList.length > 0) {
            // const tmpList = trimResultList(s3ResultList, 3);
            const tmpList = s3ResultList;


            for (const s3ResultObj of tmpList) {
                if (s3ResultObj.Key.indexOf(s3ArticleLinks) > -1) {
                    const s3DataObj = await getS3Object(articleBucketName, s3ResultObj.Key);
                    if (s3DataObj != null) {
                        const dataStr = s3DataObj.Body.toString();
                        const articleObj = JSON.parse(dataStr);

                        console.log('articleLinkResult: ', s3ResultObj);

                        const articleDetailLink = articleObj.link;
                        if (!_.isNull(articleDetailLink)) {
                            const scrapeResult = await rp(articleDetailLink);
                            if (scrapeResult != null && scrapeResult.length > 0) {
                                const newsDetailContents = extractArticleDetailFromHtml(scrapeResult);
                                console.log(`Scrape completed. content length: ${newsDetailContents.length} , title: ${articleObj.title}` );
                                // console.log('contents: ', JSON.stringify(newsDetailContents));

                                if (newsDetailContents.length === 0) {
                                    // drop this article
                                } else if (newsDetailContents.length > 0) {
                                    handlerResult = newsDetailContents;


                                    const filename = crypto.MD5(articleObj.title).toString() + '.' + fileExtension;
                                    const fullPath = s3ArticleDetail + '/' + filename;

                                    const isFound = isFileExistInS3Bucket(listBucketResult, fullPath);
                                    if (!isFound) {
                                        const jsonStr = JSON.stringify(newsDetailContents);
                                        // console.log(`jsonStr: ${jsonStr}`);

                                        // insert news detail into S3 (article detail)
                                        const createObjResult = await createObjectInS3Bucket(articleBucketName, s3ArticleDetail, filename, jsonStr);
                                        if (createObjResult != null) {
                                            console.log('Create file in S3 bucket (Article Detail): ', filename, ' path: ', s3ArticleDetail);

                                            // delete Article Link in S3 if create Article Detail success
                                            const delResult = await deleteObjectInS3Bucket(articleBucketName, s3ResultObj.Key);
                                            if (delResult != null) {
                                                console.log('Deleted file in S3 bucket (Article Link): ', s3ResultObj.Key);
                                            }
                                        }

                                    } else {
                                        console.log('File NOT found in S3 bucket: ', filename, ' path: ', s3ArticleDetail);
                                    }
                                }

                            }
                        }

                    }

                } else {
                    console.log(`Bucket result NOT match to target directory. target: ${s3ArticleLinks} , actual: ${s3ResultObj.Key}`);
                }


            }

        }

        // for (const newsObj of tmpList) {
        //     const filename = crypto.MD5(newsObj.title).toString() + '.' + fileExtension;
        //     const fullPath = s3Articles + '/' + filename;
        //
        //     // console.log(listBucketResult);
        //
        //     const isFound = isFileExistInS3Bucket(listBucketResult, fullPath);
        //     console.log('isFileExistInS3Bucket: ', isFound, ' , filename: ', filename, '\n\n' );
        //     if (!isFound) {
        //         const newsJsonStr = JSON.stringify(newsObj);
        //
        //         const createObjResult = await createObjectInS3Bucket(articleBucketName, s3Articles, filename, newsJsonStr);
        //         if (createObjResult != null) {
        //             console.log('Create file in S3 bucket: ', filename, ' path: ', s3Articles);
        //         }
        //
        //     }
        // }
    }



    return handlerResult;
};

/**
 * Article Detail Store Lambda function (Storing)
 */
exports.detailStoreHandler = async (event, context, callback) => {
    let handlerResult;
    console.log('Loading...');

    handlerResult = {
        result: 'detailStoreHandler'
    };

    return handlerResult;
};

/**
 * Article Lambda function (Scraper)
 */
exports.articleHandler = async (event, context, callback) => {

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

        console.log('Scrape completed. news length: ', news.length);

        if (news.length > 0) {
            // const tmpList = _.drop(news, Math.max(0, news.length-10));
            const tmpList = news;

            handlerResult = tmpList;

            // console.log('news length: ', tmpList.length);
            // console.log(JSON.stringify(tmpList));


            // testing
            // for (const newsObj of tmpList) {
            //     const filename = newsObj.title + '.' + fileExtension;
            //     const md5 = crypto.MD5(newsObj.title).toString();
            //
            //     console.log(`md5: ${md5} , name: ${newsObj.title}`);
            // }




            // insert news into S3 (article)
            const listBucketResult = await listS3BucketsDirectories(articleBucketName, '/' + s3Articles);
            if (listBucketResult != null) {
                console.log('listS3BucketsDirectories_success');

                for (const newsObj of tmpList) {
                    const filename = crypto.MD5(newsObj.title).toString() + '.' + fileExtension;
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
                    } else {
                        console.log('File NOT found in S3 bucket: ', filename, ' path: ', s3Articles);
                    }
                }
            }


            // // insert news into S3 (article link)
            // const listLinkBucketResult = await listS3BucketsDirectories(articleBucketName, '/' + s3ArticleLinks);
            // if (listLinkBucketResult != null) {
            //     console.log('listLinkBucketResult_success');
            //
            //     for (const newsObj of tmpList) {
            //         const filename = newsObj.title + '.' + fileExtension;
            //         const fullPath = s3ArticleLinks + '/' + filename;
            //
            //         const isFound = isFileExistInS3Bucket(listLinkBucketResult, fullPath);
            //         console.log('isFileExistInS3Bucket: ', isFound, ' , filename: ', filename, '\n\n' );
            //         if (!isFound) {
            //             const newsJsonStr = JSON.stringify(newsObj);
            //
            //             const createLinkObjResult = await createObjectInS3Bucket(articleBucketName, s3ArticleLinks, filename, newsJsonStr);
            //             if (createLinkObjResult != null) {
            //                 console.log('Create file in S3 bucket: ', filename, ' path: ', s3ArticleLinks);
            //             }
            //
            //         }
            //     }
            // }


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
 * Article Store Lambda function (Storing)
 */
exports.articleStoreHandler = async (event, context, callback) => {
    let handlerResult;
    console.log('Loading...');
    console.log('articleStoreHandler');


    handlerResult = {
        result: 'articleStoreHandler'
    };

    /*
    const filename = 'hello.json';
    const srcPath = s3Articles;
    const destPath = s3ArticleLinks;

    const moveObj = await moveObjectInS3Bucket(articleBucketName, srcPath, destPath, filename);
    if (moveObj != null) {
        console.log(`MOVE success ${filename} from ${srcPath} to ${destPath}`);
    }
    */



    // Promise.all([
    //     takes2Seconds(callbackhandler), takes5Seconds(callbackhandler)
    // ]).then(result => {
    //     console.log('final: ', result);
    // });



    const listBucketResult = await listS3BucketsDirectories(articleBucketName, '/' + s3Articles);
    if (listBucketResult != null) {
        const s3ResultList = getContentListFromBucketResult(listBucketResult);
        if (!_.isNull(s3ResultList) && s3ResultList.length > 0) {
            console.log('s3ResultList: ', s3ResultList.length);
            // console.log('s3ResultList: ', s3ResultList);

            const tmpList = trimResultList(s3ResultList, 3);

            for (const s3ResultObj of tmpList) {
                // console.log(s3ResultObj.Key);

                const s3DataObj = await getS3Object(articleBucketName, s3ResultObj.Key);
                if (s3DataObj != null) {
                    const dataStr = s3DataObj.Body.toString();
                    const articleObj = JSON.parse(dataStr);
                    if (!_.isNull(articleObj)) {
                        const imgUrl = articleObj.thumbnail;

                        const filename = uuidv5(imgUrl, uuidv5.URL);
                        const ext = getExtensionFromurl(imgUrl);
                        const filenameWithExt = filename + '.' + ext;
                        const thumbnailUrl = s3Media + '/' + filenameWithExt;
                        articleObj.thumbnailUrl = thumbnailUrl;

                        // console.log(articleObj);

                        const body = await fileUrlToData(imgUrl);
                        if (body != null) {
                            const dbObj = await findOneArticleFromDynamoDB(articleObj.title);
                            if (_.isEmpty(dbObj)) {

                                // move json from article to article link
                                const filename = crypto.MD5(articleObj.title).toString() + '.' + fileExtension;
                                const srcPath = s3Articles;
                                const destPath = s3ArticleLinks;

                                console.log(`Start moving file, name: ${filename} from ${srcPath} to ${destPath}`);

                                const moveObj = await moveObjectInS3Bucket(articleBucketName, srcPath, destPath, filename);
                                if (moveObj != null) {
                                    console.log(`MOVE success ${filename} from ${srcPath} to ${destPath}`);

                                    // save image to S3
                                    const createMediaFileResult = await createObjectInS3Bucket(articleBucketName, s3Media, filenameWithExt, body);
                                    if (createMediaFileResult != null) {
                                        console.log('Create media file success: ', createMediaFileResult);
                                    }
                                    // console.log('createMediaFileResult: ', createMediaFileResult);

                                    // insert data to db
                                    const writeArticleResult = await writeArticleToDynamoDB(articleObj);
                                    if (!_.isEmpty(writeArticleResult)) {
                                        // console.log('writeArticleResult: ', writeArticleResult);
                                        console.log('Insert new record into DynamoDB success: ', writeArticleResult);
                                    }


                                }



                            } else {
                                console.log('has record: ', JSON.stringify(dbObj));
                            }
                        }





                        // console.log('dbObj123123: ', dbObj.Item.thumbnailUrl.S);

                        // const aaa = await fetchItems(articleObj.title);
                        // console.log('aaa: ', aaa);


                    }
                }

            }

        }
    }



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

function isNotNullAndEmptyAndUndefined(object) {
    return ( !_.isNull(object) && !_.isEmpty(object) && !_.isUndefined(object) );
}

function getExtensionFromurl(url) {
    let extension = '';

    // console.log('getExtensionFromurl: ', url);

    if (!_.isNull(url) && url !== '') {
        // extension = Path.extname(Url.parse(url).pathname).replace('.', '');

        const array = url.split('.');
        if (array != null && array.length > 0) {
            extension = array[array.length-1];
        }

    }

    // console.log('getExtensionFromurl: ', extension);
    return extension;
}

function replaceAll(str, search, replacement) {
    let newStr = '';
    if (_.isString(str)) { // maybe add a lodash test? Will not handle numbers now.
        newStr = str.split(search).join(replacement)
    }
    return newStr;
}

function fileUrlToData(url) {
    return new Promise((resolve, reject) => {
        if (url !== '') {
            request.get({
                url: url,
                encoding: null
            }, (err, response, body) => {
                if (err) {
                    reject(err);
                }
                resolve(body);
            });
        }
    });
}


/**
 * Scraping
 */

function extractListFromHtml(html) {
    let list = [];

    const $ = cheerio.load(html);

    const dataRows = $('.GN-lbox2B');

    _.forEach(dataRows, (element) => {
        const tmpTitle = $(element).find('.GN-lbox2D a').text().trim();
        let title = replaceAll(tmpTitle, '/', ' ');
        title = replaceAll(title, '"', '\"');

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

function extractArticleDetailFromHtml(html) {
    let contents = [];
    const $ = cheerio.load(html);

    const dataRows = $('.GN-lbox3B div');
    _.forEach(dataRows, (element) => {
        // message
        const tmpTitle = $(element).find('div').text().trim();
        let title = replaceAll(tmpTitle, '/', ' ');
        title = replaceAll(title, '"', '\"');

        if (title !== '') {

            const obj = {
                type: ARTICLE_CONTENT_TYPE.TEXT,
                content: title
            };

            contents.push(obj);
        }

        // image
        // const img = $(element).find(' img').attr('src');


        // ul
        const liList = $(element).find('.GN-thumbnails');
        _.forEach(liList, (liElement) => {
            const photo = $(liElement).find('img').attr('data-src');
            // console.log('photo: ', photo);

            if (isNotNullAndEmptyAndUndefined(photo)) {
                const obj = {
                    type: ARTICLE_CONTENT_TYPE.IMAGE,
                    content: photo
                };

                contents.push(obj);
            }

        });

        // table
        // const table = $(element).find('.gnn-table');


        // iframe





        // console.log('message: ', img);
        // console.log('message: ', JSON.stringify(img));
    });


    // redirect



    // const dataRows2 = $('.MSG-list8C');
    // const tmpStr = $(dataRows2).find('div').text().trim();
    // console.log(`msg: ${tmpStr}`);
    // console.log(`html: ${html}`);

    // _.forEach(dataRows2, (element) => {
    //     const tmpTitle = $(element).find('div').text().trim();
    //     let title = replaceAll(tmpTitle, '/', ' ');
    //     title = replaceAll(title, '"', '\"');
    //
    //     console.log(`msg: ${title}`);
    // });


    return contents;
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
 * support function for S3
 */


function getContentListFromBucketResult(s3Result) {
    let list = [];

    const contents = s3Result.Contents;
    if (!_.isNull(contents) && contents.length > 0) {
        list = contents;
    }

    return list;
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
    const s3params = {
        Bucket: bucketName,
        MaxKeys: 20,
        Delimiter: directory,
    };
    return s3.listObjectsV2 (s3params).promise();
}

function getS3Object(bucketName, key) {
    return new Promise((resolve, reject) => {
        const params = {
            Bucket: bucketName,
            Key: key
        };
        s3.getObject(params, function(err, data) {
            if (err) {
                reject(err);
            }
            resolve(data);
        });
    });
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

function deleteObjectInS3Bucket(bucketName, sourcePath, fileNameWithExt) {
    const params = {
        Bucket: bucketName,
        Key: sourcePath + '/' + fileNameWithExt
    };
    return s3.deleteObject(params).promise();
}

function deleteObjectInS3Bucket(bucketName, key) {
    const params = {
        Bucket: bucketName,
        Key: key
    };
    return s3.deleteObject(params).promise();
}

function copyObjectInS3Bucket(bucketName, sourcePath, destPath, fileNameWithExt) {
    const params = {
        Bucket: bucketName + '/' + destPath,   // destinationbucket
        CopySource: bucketName + '/' + sourcePath + '/' + fileNameWithExt,  // /sourcebucket/HappyFacejpg
        Key: fileNameWithExt   // HappyFaceCopyjpg
    };
    console.log('copyObjectInS3Bucket_param: ', params);
    return s3.copyObject(params).promise();
}

function moveObjectInS3Bucket(bucketName, sourcePath, destPath, fileNameWithExt) {
    // return new Promise((resolve, reject) => {
    //     async.series([
    //         // copyObjectInS3Bucket(bucketName, sourcePath, destPath, newFileNameWithExt),
    //         // deleteObjectInS3Bucket(bucketName, sourcePath, newFileNameWithExt)
    //         takes2Seconds(callbackhandler),
    //         takes5Seconds(callbackhandler)
    //     ], (err, result) => {
    //         if (err) {
    //             reject(err);
    //         }
    //         resolve(result);
    //     });
    // });

    return new Promise( async (resolve, reject) => {
        const copyResult = await copyObjectInS3Bucket(bucketName, sourcePath, destPath, fileNameWithExt);
        console.log('moveObjectInS3Bucket_copyResult: ', copyResult);
        if (copyResult != null) {
            const delResult = await deleteObjectInS3Bucket(bucketName, sourcePath, fileNameWithExt);
            console.log('moveObjectInS3Bucket_delResult: ', delResult);
            if (delResult != null) {
                resolve('done');
            }
            reject(delResult);
        }
        reject(copyResult);
    });
}

// function callbackhandler(err, results) {
//     console.log('It came back with this ' + results);
// }
//
// function takes5Seconds(callback) {
//     console.log('Starting 5 second task');
//     setTimeout( function() {
//         console.log('Just finshed 5 seconds');
//         callback(null, 'five');
//     }, 5000);
// }
//
// function takes2Seconds(callback) {
//     console.log('Starting 2 second task');
//     setTimeout( function() {
//         console.log('Just finshed 2 seconds');
//         callback(null, 'two');
//     }, 2000);
// }

/**
 * DynamoDB
 */
function writeArticleToDynamoDB(articleObj) {
    const params = {
        TableName: articleTableName,
        Item: {
            // 'CUSTOMER_ID': {N: '001'},
            'title' : {S: articleObj.title},
            'thumbnailUrl' : {S: articleObj.thumbnailUrl},
        }
    };
    return ddb.putItem(params).promise();
}

function findOneArticleFromDynamoDB(articleTitle) {
    const params = {
        TableName : articleTableName,
        Key: {
            'title' : {S: articleTitle},
        },
        ProjectionExpression: 'title, thumbnailUrl'
    };
    return ddb.getItem(params).promise();
}




// function fetchItems(articleTitle) {
//     const params = {
//         TableName: articleTableName,
//         KeyConditionExpression:"#title = :titleValue ",
//         ExpressionAttributeNames: {
//             "#title":"title"
//         },
//         ExpressionAttributeValues: {
//             ":titleValue":articleTitle,
//         }
//     };
//     docClient.query(params).promise();
// }



// function queryArticleFromDynamoDB(articleTitle) {
//     const params = {
//         TableName : articleTableName,
//         ProjectionExpression:"title, thumbnailUrl",
//         // KeyConditionExpression: "#yr = :yyyy and title between :letter1 and :letter2",
//         // ExpressionAttributeNames:{
//         //     "#yr": "year"
//         // },
//         // ExpressionAttributeValues: {
//         //     ":yyyy": 1992,
//         //     ":letter1": "A",
//         //     ":letter2": "L"
//         // }
//     };
//
//     return ddb.query(params).promise();
// }


/**
 * Temp function
 */
function trimResultList(oldList, remainingResultSize) {
    let list = [];
    if (!_.isNull(oldList) && oldList.length > 0) {
        list = _.drop(oldList, Math.max(0, oldList.length-remainingResultSize));
    }
    return list;
}
