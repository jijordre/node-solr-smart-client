var SolrClient = require('solr-client'),
    RESTClient = require('node-rest-client').Client,
    async = require('async'),
    url = require('url'),
    _ = require('underscore'),
    zkUtils = require('./zookeeper-utils.js');

var DEFAULT_OPTIONS = {
    zkConnectionString: 'localhost:2181',
    zkLiveNodes: '/live_nodes',
    zkAliases: '/aliases.json',
    solrProtocol: 'http',
    solrCollectionsGetEndPoint: '/admin/collections?action=LIST&wt=json',
    ssh: {},
    // Passed verbatim to node-zookeeper-client
    zk: {
        sessionTimeout: 3000,
        spinDelay: 1000,
        retries: 1
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

function createClient(solrCollection, options, callback) {
    options = _.defaults(_.clone(options), DEFAULT_OPTIONS);
    parseSshTunnels(options.ssh);

    async.waterfall([
        function (callback) {
            getZkInfo(options, callback);
        },
        function (zkInfo, callback) {
            getSolrCollections(zkInfo, options, callback);
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
        callback(null, SolrClient.createClient(solrParams.host, solrParams.port, solrParams.core, solrParams.path + '/' + solrCollection));
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
        callback(bundle.collections.indexOf(solrCollection) > -1);
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

function createSolrCollectionGETRequestTasks(zkInfo, options) {
    var restClient = new RESTClient(options.rest);
    return zkInfo.liveNodes.map(function (liveNode) {
        if (options.ssh && options.ssh.tunnels) {
            liveNode = tunnel(liveNode, options.ssh.tunnels);
        }
        var protocolLiveNode = options.solrProtocol + '://' + liveNode;
        return function (callback) {
            restClient.get(protocolLiveNode + options.solrCollectionsGetEndPoint, options.rest, function (data, response) {
                var instanceCollections;
                if (isXMLRESTResponse(response)) {
                    instanceCollections = data.response.arr[0].str;
                } else if (isJSONRESTResponse(response)) {
                    instanceCollections = data.collections;
                } else {
                    return callback('Unsupported content type \'' + response.headers['content-type'] + '\' in response of \'' + response.req.path + '\'');
                }
                var bundle = {
                    instance: protocolLiveNode,
                    collections: instanceCollections
                };
                callback(null, bundle);
            });
        };
    });
}

function getSolrCollections(zkInfo, options, callback) {
    var tasks = createSolrCollectionGETRequestTasks(zkInfo, options);
    async.parallel(tasks, function (err, bundles) {
        if (err) {
            return callback(err);
        }
        if (zkInfo.aliases) {
            bundles.forEach(function (bundle) {
                var collectionAliases = [];
                bundle.collections.forEach(function (collection) {
                    if (zkInfo.aliases[collection]) {
                        collectionAliases.push(zkInfo.aliases[collection]);
                    }
                });
                Array.prototype.push.apply(bundle.collections, collectionAliases);
            });
        }
        callback(null, bundles);
    });
}

function getZkInfo(options, callback) {
    var dto = {zkConnectionString: options.zkConnectionString, zkOptions: options.zk};
    async.parallel({
        liveNodes: function (callback) {
            zkUtils.getChildren(dto, options.zkLiveNodes, function (err, children /*, stats*/) {
                if (err) {
                    return callback(err);
                }
                if (children.length == 0) {
                    return callback('Found no live Solr nodes under path \'' + options.zkLiveNodes + '\' by connecting at \'' + options.zkConnectionString + '\'');
                }
                async.map(children, function (item, callback) {
                    var url = replaceAfterPort(item, /_/g, '/');
                    callback(null, url);
                }, callback);
            });
        },
        aliases: function (callback) {
            if (options.zkAliases) {
                zkUtils.getData(dto, options.zkAliases, function (err, data /*, stats*/) {
                    if (err) {
                        return callback(err);
                    }
                    var dataObj = data ? JSON.parse(data.toString()) : {};
                    if (dataObj.collection) {
                        var aliases = swap(dataObj.collection);
                    }
                    callback(null, aliases);
                });
            } else {
                callback();
            }
        }
    }, callback);
}

function isXMLRESTResponse(response) {
    return response.headers['content-type'].indexOf('application/xml') > -1;
}

function isJSONRESTResponse(response) {
    return response.headers['content-type'].indexOf('application/json') > -1;
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

function swap(obj) {
    var ret = {};
    for (var key in obj) {
        if (obj.hasOwnProperty(key)) {
            ret[obj[key]] = key;
        }
    }
    return ret;
}

exports.createClient = createClient;
