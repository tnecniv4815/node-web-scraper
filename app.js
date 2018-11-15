const rp = require('request-promise');
const cheerio = require('cheerio');
const _ = require('lodash');

const bucketName = 'article-bucket-55895cd0-e240-11e8-8c69-036b726f6b89';
const region = 'ap-southeast-1';
const articleLinkQueueName = 'ArticleLinkQueue';
const articleQueueName = 'ArticleQueue';

const AWS = require('aws-sdk');
const sqs = new AWS.SQS({
    region: region
});
const s3 = new AWS.S3();



const url = 'https://gnn.gamer.com.tw/index.php?k=';

exports.handler = async (event, context, callback) => {

    console.log('Loading...');

    console.log('Start scraping data');

    const params = {
        Bucket: bucketName,
        Key: 'articles/testing.json',
        Body: '{"title":"《天堂 M》《新楓之谷》等作推出「橘子揪好玩週年慶」活動 祭出歐洲、非洲來回機票","thumbnail":"https://p2.bahamut.com.tw/S/2KU/90","link":"https:://gnn.gamer.com.tw/0/171000.html"}'
    };
    s3.upload(params, (err, data) => {
        if (err) {
            console.log('error in callback');
            console.log(err);
        }
        console.log('success');
        console.log(data);
    });


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
                listSQSQueues()
                    .then(sqsResult => {
                        if (!_.isNull(sqsResult)) {
                            const queueUrls = sqsResult.QueueUrls;
                            if (queueUrls.length > 0) {
                                const targetQueueUrl = findSQSQueue(queueUrls, articleQueueName);
                                if (targetQueueUrl !== '') {
                                    console.log('targetQueueUrl: ', targetQueueUrl);

                                    const tmpList = _.drop(news, news.length-3);

                                    // _.forEach(tmpList, (newsObj) => {
                                    //     const newsObjStr = JSON.stringify(newsObj);
                                    //     console.log('newsObjStr: ', newsObjStr, '\n');
                                    //
                                    //     addMessageToSQSQueue(targetQueueUrl, JSON.stringify(newsObjStr))
                                    //         .then(result => {
                                    //             console.log('result: ', result);
                                    //         })
                                    //         .catch(error => {
                                    //             console.log('error: ', error);
                                    //         });
                                    //
                                    // });

                                    // if (news.length > 0) {
                                    //     const firstNewsObj = news[0];
                                    //     const firstNewsObjStr = JSON.stringify(firstNewsObj);
                                    //
                                    //     console.log('firstNewsObjStr: ', firstNewsObjStr);
                                    //
                                    //     addMessageToSQSQueue(targetQueueUrl, JSON.stringify(firstNewsObj))
                                    //         .then(result => {
                                    //             console.log('result: ', result);
                                    //         })
                                    //         .catch(error => {
                                    //             console.log('error: ', error);
                                    //         });
                                    // }


                                }
                            }
                        }
                    })
                    .catch(err => {
                        console.log('listSQSQueues_error');
                        console.log(err);
                    });

            }


        })
        .catch(function (err) {
            //handle error
            console.log('Scrape failure');
            console.error(err);
        });

    */

};

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
        const link = 'https::' + $(element).find('.GN-lbox2E a').attr('href');

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

