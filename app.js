const rp = require('request-promise');
const cheerio = require('cheerio');
const _ = require('lodash');

const bucketName = 'article-bucket-55895cd0-e240-11e8-8c69-036b726f6b89';
const region = 'ap-southeast-1';

const AWS = require('aws-sdk');
const sqs = new AWS.SQS({
    region: region
});
const s3 = new AWS.S3();



const url = 'https://gnn.gamer.com.tw/index.php?k=';

exports.handler = async (event, context, callback) => {

    console.log('Loading...');

    console.log('Start scraping data');
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
                                console.log(queueUrls);
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


};

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