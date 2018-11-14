const rp = require('request-promise');
const $ = require('cheerio');
const url = 'https://gnn.gamer.com.tw/index.php?k=';

exports.handler = async (event, context, callback) => {

    rp(url)
        .then(function(html){
            //success!
            console.log('length: ', html.length);
            // console.log($('big > a', html));
            // console.log(html);

            const news = extractListFromHtml(html);


        })
        .catch(function(err){
            //handle error
            console.error(err);
        });


};

function extractListFromHtml(html) {
    let list = [];


    return list;
}