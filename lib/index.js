var solrClient = require('solr-client'),
    zkClient = require('node-zookeeper-client'),
    restClient = require('node-rest-client'),
    async = require('async'),
    url = require('url'),
    _ = require('underscore');

var DEFAULT_OPTIONS = {
    zkConnectionString: 'localhost:2181',
    zkLiveNodes: '/live_nodes',
    solrProtocol: 'http',
    solrCollectionsGetEndPoint: '/admin/collections?action=LIST',
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
        }
    }
};

function createClient(solrCollection, options, callback) {
    options = _.defaults(_.clone(options), DEFAULT_OPTIONS);
    parseSshTunnels(options.ssh);

    async.waterfall([
        function (callback) {
            getZkLiveNodes(options, callback);
        },
        function (solrInstances, callback) {
            getSolrCollections(solrInstances, options, callback);
        },
        function (solrBundles, callback) {
            getSolrInstance(solrBundles, solrCollection, callback);
        },
        function (solrInstance, callback) {
            getSolrParams(solrInstance, options, callback);
        }
    ], function (err, solrParams) {
        if (err) {
            return callback(err);
        }
        callback(null, solrClient.createClient(solrParams.host, solrParams.port, solrParams.core, solrParams.path + '/' + solrCollection));
    });
}

function getSolrParams(solrInstance, options, callback) {
    solrInstance = tunnel(solrInstance, options.ssh.tunnels);
    var urlParams = url.parse(solrInstance);
    callback(null, {
        host: urlParams.hostname,
        port: urlParams.port,
        core: '',
        path: urlParams.path
    })
}

function getSolrInstance(solrBundles, solrCollection, callback) {
    async.filter(solrBundles, function (bundle, callback) {
        async.some(bundle.collections, function (collection, callback) {
            callback(collection == solrCollection);
        }, callback)
    }, function (filteredBundles) {
        async.map(filteredBundles, function (bundle, callback) {
            callback(null, bundle.instance);
        }, function (err, instances) {
            if (err) {
                return callback(err);
            }
            if (!instances.length) {
                return callback('Found no Solr instance hosting collection \'' + solrCollection + '\'');
            }
            var instance = instances[Math.floor(Math.random() * instances.length)];
            callback(null, instance);
        })
    });
}

function getSolrCollections(solrInstances, options, callback) {
    var client = new restClient.Client();

    var tasks = solrInstances.map(function (instance) {
        if (options.ssh && options.ssh.tunnels) {
            instance = tunnel(instance, options.ssh.tunnels);
        }
        var protocolInstance = options.solrProtocol + '://' + instance;
        return function (callback) {
            client.get(protocolInstance + options.solrCollectionsGetEndPoint, options.rest, function (data /*, response*/) {
                var bundle = {
                    instance: protocolInstance,
                    collections: data.response.arr[0].str
                };
                callback(null, bundle);
            });
        };
    });

    async.parallel(tasks, callback);
}

function getZkLiveNodes(options, callback) {
    var client = null;

    function list(callback) {
        client.getChildren(options.zkLiveNodes, null, function (err, children) {
            if (err) {
                return callback(err);
            }
            if (children.length == 0) {
                callback('Found no live Solr nodes under path \'' + options.zkLiveNodes + '\' by connecting at \'' + options.zkConnectionString + '\'');
            }
            async.map(children, function (item, callback) {
                var url = replaceAfterPort(item, /_/g, '/');
                callback(null, url);
            }, function (err, mappedChildren) {
                client.close();
                callback(err, mappedChildren);
            });
        });
    }

    (function init() {
        client = zkClient.createClient(options.zkConnectionString, options.zk);
        client.once('connected', function () {
            list(callback);
        });
        client.connect();
    })();
}

function parseSshTunnels(options) {
    if (typeof options.tunnels === 'string') {
        var tunnels = {};
        var tunnelsArr = options.tunnels.split(',');
        for (var i = 0, tunnel; tunnel = tunnelsArr[i]; i++) {
            var portHostPort = tunnel.split(':');
            tunnels[portHostPort[1] + ':' + portHostPort[2]] = 'localhost:' + portHostPort[0];
        }
        options.tunnels = tunnels;
    }
}

function tunnel(instance, tunnels) {
    var pattern = /([^:]+:\d+)/;
    if (tunnels && pattern.test(instance)) {
        var hostPort = pattern.exec(instance)[1];
        if (tunnels.hasOwnProperty(hostPort)) {
            instance = instance.replace(hostPort, tunnels[hostPort]);
        }
    }
    return instance;
}

function replaceAfterPort(url, pattern, replacement) {
    var colonDigits = /:\d+/.exec(url)[0];
    var pathIndex = url.indexOf(colonDigits) + colonDigits.length;
    var hostPort = url.substring(0, pathIndex);
    var path = url.substring(pathIndex);
    return hostPort + path.replace(pattern, replacement);
}

exports.createClient = createClient;
