// Load dependency
var solrSmartClient = require('../lib/index.js');

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

// Create Solr client, execute query and print number of documents in response.
solrSmartClient.createClient('my_solr_collection', options, function (err, solrClient) {
    if (err) {
        return console.log(err);
    }
    solrClient.search('q=*:*', function (err, obj) {
        if (err) {
            return console.log(err);
        }
        console.log('Number of documents found: %d', obj.response.numFound);
    })
});
