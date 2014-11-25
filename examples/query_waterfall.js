// Load dependencies
var solrSmartClient = require('../lib/index.js'),
    async = require('async');

// Define options
options = {
    // Options passed verbatim to node-zookeeper-client
    zk: {
        connectionString: 'localhost:2181',
        liveNodes: '/live_nodes'
    },
    // Options passed verbatim to node-rest-client
    rest: {
        requestConfig: {
            timeout: 3000
        },
        responseConfig: {
            timeout: 1000
        }
    },
    solr: {
        protocol: 'http',
        collectionsGetEndPoint: '/admin/collections?action=LIST'
    },
    ssh: {}
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
