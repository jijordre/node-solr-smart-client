var should = require('should'),
    sinon = require('sinon'),
    proxyquire = require('proxyquire'),
    zkUtils = mockZkUtils(),
    restClientObj = {},
    restClient = {
        Client: function (options) {
            return restClientObj;
        }
    },
    solrClient = mockSolrClient();

var solrSmartClient = proxyquire('../lib/index.js', {
    'node-rest-client': restClient,
    './zookeeper-utils.js': zkUtils,
    'solr-client': solrClient
});

function mockZkUtils() {
    var zkUtils = {
        getChildren: sinon.stub(),
        getData: sinon.stub()
    };
    var some_live_nodes = ['some_solr_node1:1234_some_path', 'some_solr_node2:1234_some_path'];
    var empty_live_nodes = [];
    zkUtils.getChildren.withArgs(sinon.match.object, '/some_live_nodes', sinon.match.func).yields(null, some_live_nodes);
    zkUtils.getChildren.withArgs(sinon.match.object, '/empty_live_nodes', sinon.match.func).yields(null, empty_live_nodes);
    zkUtils.getChildren.withArgs(sinon.match.object, '/bogus_live_nodes', sinon.match.func).yields('some_error', null);
    zkUtils.getChildren.withArgs(sinon.match.object, null, sinon.match.func).yields('some_error', null);
    var some_aliases = new Buffer(JSON.stringify({'collection': {'some_collection_alias': 'some_collection2'}}));
    var empty_aliases = new Buffer(JSON.stringify({}));
    zkUtils.getData.withArgs(sinon.match.object, '/some_aliases.json', sinon.match.func).yields(null, some_aliases);
    zkUtils.getData.withArgs(sinon.match.object, '/empty_aliases.json', sinon.match.func).yields(null, empty_aliases);
    zkUtils.getData.withArgs(sinon.match.object, '/bogus_aliases.json', sinon.match.func).yields('some_error', null);
    zkUtils.getData.withArgs(sinon.match.object, null, sinon.match.func).yields('some_error', null);
    return zkUtils;
}

function mockRESTClientObj() {
    var xmlData = {
        response: {
            arr: [
                {
                    str: ['some_collection1', 'some_collection2', 'some_collection3']
                }
            ]
        }
    };
    var xmlResponse = {
        headers: {
            'content-type': 'application/xml;charset=UTF-8'
        }
    };
    var jsonData = {
        collections: ['some_collection1', 'some_collection2', 'some_collection3']
    };
    var jsonResponse = {
        headers: {
            'content-type': 'application/json;charset=UTF-8'
        }
    };
    var unsupportedResponse = {
        headers: {
            'content-type': 'text/plain;charset=UTF-8'
        },
        req: {
            path: '/some/request/path'
        }
    }
    restClientObj.get = sinon.stub();
    restClientObj.get.withArgs(sinon.match(/wt=xml/), sinon.match.object, sinon.match.func).yields(xmlData, xmlResponse);
    restClientObj.get.withArgs(sinon.match(/wt=json/), sinon.match.object, sinon.match.func).yields(jsonData, jsonResponse);
    restClientObj.get.withArgs(sinon.match(/wt=(?!xml|json)/), sinon.match.object, sinon.match.func).yields(null, unsupportedResponse);
    restClientObj.get.withArgs(sinon.match(/^((?!wt=).)*$/), sinon.match.object, sinon.match.func).yields(xmlData, xmlResponse);
}

function mockSolrClient() {
    return {
        createClient: function (host, port, core, path) {
            return {
                options: {
                    host: host,
                    port: port,
                    core: core,
                    path: path
                }
            }
        }
    }
}

function mockOptions() {
    return {
        zkConnectionString: 'some_zookeeper_host:0000',
        zkLiveNodes: '/some_live_nodes',
        zkAliases: '/some_aliases.json',
        solrProtocol: 'http',
        solrCollectionsGetEndPoint: '/admin/collections?action=LIST',
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
}

describe('solrSmartClient', function () {

    var options;

    before(function() {
        sinon.spy(restClient, "Client");
    });

    beforeEach(function () {
        mockRESTClientObj();
        options = mockOptions();
    });

    after(function() {
       restClient.Client.restore();
    });

    describe('#createClient', function () {

        describe('with bogus ZooKeeper live nodes path', function () {

            beforeEach(function () {
                options.zkLiveNodes = '/bogus_live_nodes';
            });

            it('should throw error', function (done) {
                solrSmartClient.createClient('some_collection2', options, function (err, solrClient) {
                    should.exist(err);
                    should.not.exist(solrClient);
                    done();
                });
            });
        });

        describe('with no ZooKeeper live nodes path', function () {

            beforeEach(function () {
                options.zkLiveNodes = null;
            });

            it('should throw error', function (done) {
                solrSmartClient.createClient('some_collection2', options, function (err, solrClient) {
                    should.exist(err);
                    should.not.exist(solrClient);
                    done();
                });
            });
        });

        describe('with empty live nodes', function () {

            beforeEach(function () {
                options.zkLiveNodes = '/empty_live_nodes';
            });

            it('should throw error', function (done) {
                solrSmartClient.createClient('some_collection2', options, function (err, solrClient) {
                    should.exist(err);
                    should.not.exist(solrClient);
                    done();
                });
            });
        });

        describe('with no live node matching the name of the Solr collection', function () {

            it('should throw error', function (done) {
                solrSmartClient.createClient('no_collection', options, function (err, solrClient) {
                    should.exist(err);
                    should.not.exist(solrClient);
                    done();
                });
            });
        });

        describe('with target Solr collection being alias', function () {

            describe('with no ZooKeeper aliases path', function () {

                beforeEach(function () {
                    options.zkAliases = null;
                });

                it('should throw error', function (done) {
                    solrSmartClient.createClient('some_collection_alias', options, function (err, solrClient) {
                        should.exist(err);
                        should.not.exist(solrClient);
                        done();
                    });
                });
            });

            describe('with bogus ZooKeeper aliases path', function () {

                beforeEach(function () {
                    options.zkAliases = '/bogus_aliases.json';
                });

                it('should throw error', function (done) {
                    solrSmartClient.createClient('some_collection_alias', options, function (err, solrClient) {
                        should.exist(err);
                        should.not.exist(solrClient);
                        done();
                    });
                });
            });

            describe('with empty aliases', function () {

                beforeEach(function () {
                    options.zkAliases = '/empty_aliases.json';
                });

                it('should throw error', function (done) {
                    solrSmartClient.createClient('some_collection_alias', options, function (err, solrClient) {
                        should.exist(err);
                        should.not.exist(solrClient);
                        done();
                    });
                });
            });

            describe('with well-defined aliases', function () {

                it('should create instance of node-solr-client on alias', function (done) {
                    solrSmartClient.createClient('some_collection_alias', options, function (err, solrClient) {
                        should.not.exist(err);
                        should.exist(solrClient);
                        solrClient.options.port.should.eql('1234');
                        solrClient.options.path.should.eql('/some/path/some_collection_alias');
                        done();
                    });
                });
            });
        });

        describe('with JSON writer type', function() {

            beforeEach(function() {
                options.solrCollectionsGetEndPoint = '/admin/collections?action=LIST&wt=json';
            });

            it('should create instance of node-solr-client', function (done) {
                solrSmartClient.createClient('some_collection2', options, function (err, solrClient) {
                    should.not.exist(err);
                    should.exist(solrClient);
                    solrClient.options.host.should.startWith('some_solr_node');
                    solrClient.options.port.should.eql('1234');
                    solrClient.options.path.should.eql('/some/path/some_collection2');
                    done();
                });
            });
        })

        describe('with XML writer type', function () {

            beforeEach(function() {
                options.solrCollectionsGetEndPoint = '/admin/collections?action=LIST&wt=xml';
            });

            it('should create instance of node-solr-client', function (done) {
                solrSmartClient.createClient('some_collection2', options, function (err, solrClient) {
                    should.not.exist(err);
                    should.exist(solrClient);
                    solrClient.options.host.should.startWith('some_solr_node');
                    solrClient.options.port.should.eql('1234');
                    solrClient.options.path.should.eql('/some/path/some_collection2');
                    done();
                });
            });
        });

        describe('with default writer type', function () {

            it('should create instance of node-solr-client', function (done) {
                solrSmartClient.createClient('some_collection2', options, function (err, solrClient) {
                    should.not.exist(err);
                    should.exist(solrClient);
                    solrClient.options.host.should.startWith('some_solr_node');
                    solrClient.options.port.should.eql('1234');
                    solrClient.options.path.should.eql('/some/path/some_collection2');
                    done();
                });
            });
        });

        describe('with unsupported writer type', function () {

            beforeEach(function() {
                options.solrCollectionsGetEndPoint = '/admin/collections?action=LIST&wt=csv';
            });

            it('should throw error', function (done) {
                solrSmartClient.createClient('some_collection2', options, function (err, solrClient) {
                    should.exist(err);
                    should.not.exist(solrClient);
                    done();
                });
            });
        });

        describe('with SSH tunnel specification', function () {

            describe('when specified as object', function () {

                beforeEach(function () {
                    options.ssh = {
                        tunnels: {
                            'some_solr_node1:1234': 'localhost:4321',
                            'some_solr_node2:1234': 'localhost:4321'
                        }
                    };
                });

                it('should tunnel requests to Solr servers', function (done) {
                    solrSmartClient.createClient('some_collection2', options, function (err, solrClient) {
                        solrClient.options.host.should.startWith('localhost');
                        solrClient.options.port.should.eql('4321');
                    });
                    done();
                });
            });

            describe('when specified as string', function () {

                beforeEach(function () {
                    options.ssh = {
                        tunnels: '4321:some_solr_node1:1234,4321:some_solr_node2:1234'
                    };
                });

                it('should parse tunnel configs fed as string and tunnel requests to Solr servers', function (done) {
                    solrSmartClient.createClient('some_collection2', options, function (err, solrClient) {
                        solrClient.options.host.should.startWith('localhost');
                        solrClient.options.port.should.eql('4321');
                    });
                    done();
                });
            });
        });

        describe('with REST client options specification', function() {

            it('should instantiate REST client with options.rest', function(done) {
                solrSmartClient.createClient('some_collection2', options, function (err, solrClient) {
                    restClient.Client.calledWith(options.rest);
                    done();
                });
            });
        });
    });
});
