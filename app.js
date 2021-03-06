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

// date format
const DATE_FORMAT_1 = 'YYYY-MM-DD_HH:mm:ss';


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
 * Article Detail (Scraper)
 */
exports.articleDetailHandler = async (event, context, callback) => {
    let handlerResult;
    console.log('Loading...');
    console.log('Start scraping detail');

    handlerResult = {
        result: 'detailHandler'
    };


    const listBucketResult = await listS3BucketsDirectories(articleBucketName, s3ArticleLinks);
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
                                const articleId = crypto.MD5(articleObj.title).toString();
                                const newsDetailObj = extractArticleDetailFromHtml(scrapeResult, articleObj.title, articleId);
                                console.log(`Scrape completed. content length: ${newsDetailObj.contents.length} , title: ${articleObj.title}` );
                                // console.log('contents: ', JSON.stringify(newsDetailContents));

                                if (newsDetailObj.contents.length === 0) {
                                    // drop this article
                                    const filenameInArticleDetailBucket = articleId + '.' + fileExtension;
                                    const delResult = await deleteObjectInS3BucketByPath(articleBucketName, s3Articles, filenameInArticleDetailBucket);
                                    if (delResult != null) {
                                        console.log('Deleted file in S3 bucket (Article): ', delResult);
                                    }
                                } else if (newsDetailObj.contents.length > 0) {
                                    handlerResult = newsDetailObj;


                                    const filename = crypto.MD5(articleObj.title).toString() + '.' + fileExtension;
                                    const fullPath = s3ArticleDetail + '/' + filename;

                                    const isFound = isFileExistInS3Bucket(listBucketResult, fullPath);
                                    if (!isFound) {
                                        const jsonStr = JSON.stringify(newsDetailObj);
                                        // console.log(`jsonStr: ${jsonStr}`);

                                        // insert news detail into S3 (article detail)
                                        const createObjResult = await createObjectInS3Bucket(articleBucketName, s3ArticleDetail, filename, jsonStr);
                                        if (createObjResult != null) {
                                            console.log('Create file in S3 bucket (Article Detail): ', filename, ' path: ', s3ArticleDetail);

                                            // delete Article Link in S3 if create Article Detail success
                                            const delResult = await deleteObjectInS3BucketByKey(articleBucketName, s3ResultObj.Key);
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
 * Article Detail Store (Storing)
 */
exports.detailStoreHandler = async (event, context, callback) => {
    let handlerResult;
    console.log('Loading...');

    handlerResult = {
        result: 'detailStoreHandler'
    };


    const listBucketResult = await listS3BucketsDirectories(articleBucketName, s3ArticleDetail);
    if (listBucketResult != null) {
        const s3ResultList = getContentListFromBucketResult(listBucketResult);
        if (!_.isNull(s3ResultList) && s3ResultList.length > 0) {
            console.log('s3ResultList: ', s3ResultList.length);

            // const tmpList = trimResultList(s3ResultList, 3);
            const tmpList = s3ResultList;

            console.log('s3ResultList: ', s3ResultList);

            for (const s3ResultObj of tmpList) {
                if (s3ResultObj.Key.indexOf(s3ArticleDetail) > -1) {
                    const s3DataObj = await getS3Object(articleBucketName, s3ResultObj.Key);
                    if (s3DataObj != null) {
                        const dataStr = s3DataObj.Body.toString();
                        const detailObj = JSON.parse(dataStr);
                        if (isNotNullAndEmptyAndUndefined(detailObj) && detailObj.contents.length > 0) {
                            // query article from dynamoDB
                            // update article table contents [articleDetailObjId, articleDetailObjId]
                            // insert article detail table, articleObjId

                            // const md5 = crypto.MD5(articleObj.title).toString();
                            // const dbObj = await findOneArticleFromDynamoDB(md5);
                            // if (!_.isEmpty(dbObj)) {
                            //     console.log(`dbObj: ${dbObj}`);
                            // }


                            let articleDetailList = [];
                            let tmpArticleDetailIdList = [];
                            _.forEach(detailObj.contents, (content) => {

                                let articleDetailId = '';

                                switch (content.type) {
                                    case ARTICLE_CONTENT_TYPE.TEXT: {
                                        articleDetailId = crypto.MD5(content.content).toString();
                                        const message = content.content;

                                        //
                                        const item = {
                                            id: articleDetailId,
                                            articleId: detailObj.articleId,
                                            type: content.type,
                                            content: message
                                        };
                                        articleDetailList.push(item);

                                        break;
                                    }
                                    case ARTICLE_CONTENT_TYPE.IMAGE: {
                                        const imgUrl = content.content;

                                        const filename = uuidv5(imgUrl, uuidv5.URL);
                                        const ext = getExtensionFromurl(imgUrl);
                                        const filenameWithExt = filename + '.' + ext;

                                        const finalImgUrl = s3Media + '/' + filenameWithExt;
                                        articleDetailId = filename;

                                        //
                                        const item = {
                                            id: articleDetailId,
                                            articleId: detailObj.articleId,
                                            type: content.type,
                                            content: finalImgUrl,

                                            imgUrl: imgUrl,
                                            filename: filenameWithExt,
                                        };
                                        articleDetailList.push(item);

                                        break;
                                    }
                                }

                                // if (articleDetailId !== '') {
                                //     tmpArticleDetailIdList.push(articleDetailId);
                                // }

                            });

                            if (articleDetailList.length > 0) {
                                _.forEach(articleDetailList, async (articleDetailObj) => {
                                    const batchInsertArticleDetailResult = await batchWriteArticleDetailToDynamoDB(articleDetailTableName, articleDetailObj);
                                    if (batchInsertArticleDetailResult != null) {
                                        // console.log(`batchInsertArticleDetailResult: ${batchInsertArticleDetailResult}`);

                                        // update article contents record
                                        tmpArticleDetailIdList.push(articleDetailObj.id);

                                        const updateArticleResult = await updateArticleFromDynamoDB(articleDetailObj.articleId, tmpArticleDetailIdList);
                                        if (updateArticleResult != null) {
                                            console.log(`Update Article file success. articleId: ${articleDetailObj.articleId} , contents: ${ JSON.stringify(tmpArticleDetailIdList) }`);
                                        }


                                        // save image to S3 media bucket if image
                                        switch (articleDetailObj.type) {
                                            case ARTICLE_CONTENT_TYPE.IMAGE: {
                                                const body = await fileUrlToData(articleDetailObj.imgUrl);
                                                if (body != null) {
                                                    const createMediaFileResult = await createObjectInS3Bucket(articleBucketName, s3Media, articleDetailObj.filename, body);
                                                    if (createMediaFileResult != null) {
                                                        console.log(`Create media file success. `, createMediaFileResult);
                                                    }
                                                }

                                                break;
                                            }
                                        }

                                        // delete S3 Article Detail json
                                        const filenameInArticleDetailBucket = articleDetailObj.articleId + '.' + fileExtension;
                                        const delResult = await deleteObjectInS3BucketByPath(articleBucketName, s3ArticleDetail, filenameInArticleDetailBucket);
                                        if (delResult != null) {
                                            console.log('Deleted file in S3 bucket (Article Detail): ', delResult);
                                        }

                                    }
                                });


                                // update content list to article table
                                const dbObj = await findOneArticleFromDynamoDB(detailObj.articleId);
                                if (_.isEmpty(dbObj)) {
                                    console.log(`dbObj: ${dbObj}`);
                                }
                            }






                        }

                    }
                } else {
                    console.log(`Foler NOT matched. target path: ${s3ArticleDetail} , current path: ${s3ResultObj.Key}`);
                }
            }

        }
    }

    return handlerResult;
};

/**
 * Article (Scraper)
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





    // deleteObjectInS3BucketByPath(articleBucketName, s3Articles, 'nice.json')
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
            const tmpList = _.drop(news, Math.max(0, news.length-10));
            // const tmpList = news;

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
            const listBucketResult = await listS3BucketsDirectories(articleBucketName, s3Articles);
            if (listBucketResult != null) {
                console.log('listS3BucketsDirectories_success');

                for (const newsObj of tmpList) {
                    const md5 = crypto.MD5(newsObj.title).toString();
                    const filename = md5 + '.' + fileExtension;
                    const fullPath = s3Articles + '/' + filename;

                    // console.log(listBucketResult);

                    const isFound = isFileExistInS3Bucket(listBucketResult, fullPath);
                    console.log('isFileExistInS3Bucket: ', isFound, ' , filename: ', filename, '\n\n' );
                    if (!isFound) {
                        newsObj.articleId = md5;
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
 * Article Store (Storing)
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



    const listBucketResult = await listS3BucketsDirectories(articleBucketName, s3Articles);
    if (listBucketResult != null) {
        const s3ResultList = getContentListFromBucketResult(listBucketResult);
        if (!_.isNull(s3ResultList) && s3ResultList.length > 0) {
            console.log('s3ResultList: ', s3ResultList.length);
            // console.log('s3ResultList: ', s3ResultList);

            const tmpList = trimResultList(s3ResultList, 8);

            for (const s3ResultObj of tmpList) {
                // console.log(s3ResultObj.Key);

                if (s3ResultObj.Key.indexOf(s3Articles) > -1) {
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
                            articleObj.thumbnailFilename = filenameWithExt;

                            // console.log(articleObj);

                            const body = await fileUrlToData(imgUrl);
                            if (body != null) {
                                // const md5 = crypto.MD5(articleObj.title).toString();
                                const dbObj = await findOneArticleFromDynamoDB(articleObj.articleId);
                                if (_.isEmpty(dbObj)) {

                                    // move json from article to article link
                                    // const md5 = crypto.MD5(articleObj.title).toString();
                                    const filename = articleObj.articleId + '.' + fileExtension;
                                    const srcPath = s3Articles;
                                    const destPath = s3ArticleLinks;

                                    // articleObj.articleId = md5;

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
                } else {
                    console.log(`Foler NOT matched. target path: ${s3Articles} , current path: ${s3ResultObj.Key}`);
                }

            }

        }
    }



    return handlerResult;
};

/**
 * Common
 */
function getCurrentTime(format) {
    const dateFormat = 'YYYY-MM-DD_HH:mm:ss';
    const datetime = moment().format(format);

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

function extractArticleDetailFromHtml(html, articleTitle, articleId) {
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


    const result = {
        articleId: articleId,
        title: articleTitle,    // crypto.MD5(articleTitle).toString(),
        contents: contents
    };

    return result;
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
        Prefix: directory ,
    };
    return s3.listObjects (s3params).promise();
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

function deleteObjectInS3BucketByPath(bucketName, sourcePath, fileNameWithExt) {
    return new Promise((resolve, reject) => {
        const params = {
            Bucket: bucketName,
            Key: sourcePath + '/' + fileNameWithExt
        };
        s3.deleteObject(params, (err, data) => {
            if (err) {
                reject(err);
            } else {
                resolve(data);
            }
        });
    });

}

function deleteObjectInS3BucketByKey(bucketName, key) {
    return new Promise((resolve, reject) => {
        const params = {
            Bucket: bucketName,
            Key: key
        };
        s3.deleteObject(params, (err, data) => {
            if (err) {
                reject(err);
            } else {
                resolve(data);
            }
        });
    });
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
    //         // deleteObjectInS3BucketByPath(bucketName, sourcePath, newFileNameWithExt)
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
            const delResult = await deleteObjectInS3BucketByPath(bucketName, sourcePath, fileNameWithExt);
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
            'articleId': {S: articleObj.articleId},
            'title' : {S: articleObj.title},
            'thumbnailUrl' : {S: articleObj.thumbnailUrl},
            'thumbnailFilename' : {S: articleObj.thumbnailFilename},
            'created_at' : {S: ''+ getCurrentTime(DATE_FORMAT_1) },
        }
    };
    return ddb.putItem(params).promise();
}

function findOneArticleFromDynamoDB(articleId) {
    const params = {
        TableName : articleTableName,
        Key: {
            'articleId' : {S: articleId},
        },
        ProjectionExpression: 'articleId, title, thumbnailUrl'
    };
    return ddb.getItem(params).promise();
}

function updateArticleFromDynamoDB(articleId, newContentList) {
    const params = {
        TableName: articleTableName,
        Key:{
            'articleId': articleId
        },
        UpdateExpression: 'set contents = :c',
        ExpressionAttributeValues:{
            // ":r":5.5,
            // ":p":"Everything happens all at once.",
            ":c": newContentList
        },
        ReturnValues:"UPDATED_NEW"
    };
    // docClient.update(params, function(err, data) {
    //     if (err) {
    //         console.error("Unable to update item. Error JSON:", JSON.stringify(err, null, 2));
    //     } else {
    //         console.log("UpdateItem succeeded:", JSON.stringify(data, null, 2));
    //     }
    // });

    return docClient.update(params).promise();
}

function batchWriteArticleDetailToDynamoDB(tableName, articleDetailObj) {
    return new Promise((resolve, reject) => {
        // let list = [];
        //
        // _.forEach(articleDetailList, (articleDetailObj) => {
        //     const object = {
        //         PutRequest: {
        //             Item: {
        //                 'id': { "S": articleDetailObj.id },
        //                 "articleId": { "S": articleDetailObj.articleId },
        //                 "type": { "N": ''+articleDetailObj.type },
        //                 "content": { "S": articleDetailObj.content },
        //             }
        //         }
        //     };
        //     list.push(object);
        //
        // });
        //
        // // detail
        // // id, articleId, type, content
        //
        // // const params = {
        // //     RequestItems: {
        // //         "TABLE_NAME": [
        // //             {
        // //                 PutRequest: {
        // //                     Item: {
        // //                         "KEY": { "N": "KEY_VALUE" },
        // //                         "ATTRIBUTE_1": { "S": "ATTRIBUTE_1_VALUE" },
        // //                         "ATTRIBUTE_2": { "N": "ATTRIBUTE_2_VALUE" }
        // //                     }
        // //                 }
        // //             },
        // //             {
        // //                 PutRequest: {
        // //                     Item: {
        // //                         "KEY": { "N": "KEY_VALUE" },
        // //                         "ATTRIBUTE_1": { "S": "ATTRIBUTE_1_VALUE" },
        // //                         "ATTRIBUTE_2": { "N": "ATTRIBUTE_2_VALUE" }
        // //                     }
        // //                 }
        // //             }
        // //         ]
        // //     }
        // // };
        //
        // const params = {
        //     RequestItems: {
        //         'articleDetail': list
        //     }
        // };
        //
        // ddb.batchWriteItem(params, function(err, data) {
        //     if (err) {
        //         console.log("Error", err);
        //         reject(err);
        //     } else {
        //         console.log("Success", data);
        //         resolve(data);
        //     }
        // });


        const params = {
            TableName: tableName,
            Item: {
                'id': { "S": articleDetailObj.id },
                "articleId": { "S": articleDetailObj.articleId },
                "contentType": { "N": ''+articleDetailObj.type },
                "content": { "S": articleDetailObj.content },
                'created_at' : {S: ''+ getCurrentTime(DATE_FORMAT_1) },
            }
        };

        ddb.putItem(params, function(err, data) {
            if (err) {
                console.log("Error", err);
                reject(err);
            } else {
                console.log("Success", data);
                resolve(data);
            }
        });



    });
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
