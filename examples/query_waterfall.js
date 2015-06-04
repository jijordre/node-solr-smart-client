// Load dependencies
var solrSmartClient = require('../lib/index.js'),
    async = require('async');

// Define options
options = {
    zkConnectionString: 'localhost:2181',
    zkLiveNodes: '/live_nodes',
    zkAliases: '/aliases.json',
    solrProtocol: 'http',
    solrCollectionsGetEndPoint: '/admin/collections?action=LIST&wt=json', // Supports XML and JSON writer types
    ssh: {},
    // Passed verbatim to node-zookeeper-client
    zk: {
        sessionTimeout: 3000,
        spinDelay : 1000,
        retries : 1
    },
    // Passed verbatim to node-rest-client
    rest: {
        requestConfig: {
            timeout: 3000
        },
        responseConfig: {
            timeout: 3000
        },
        mimetypes: {
            json: ["application/json", "application/json;charset=utf-8", "application/json; charset=utf-8", "application/json;charset=UTF-8", "application/json; charset=UTF-8"],
            xml: ["application/xml", "application/xml;charset=utf-8", "application/xml; charset=utf-8", "application/xml;charset=UTF-8", "application/xml; charset=UTF-8"]
        }
    }
};

// In waterfall approach
async.waterfall([
    function (callback) {
        // ..create Solr client,...
        solrSmartClient.createClient('my_solr_collection', options, callback);
    },
    function (solrClient, callback) {
        // ...execute query...
        solrClient.search('q=*:*', callback);
    }], function (err, obj) {
    // ...and print number of documents in response
    if (err) {
        return console.log(err);
    }
    console.log('Number of documents found: %d', obj.response.numFound);
});
