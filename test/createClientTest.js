var should = require('should'),
    sinon = require('sinon'),
    proxyquire = require('proxyquire'),
    zkClientMock = {},
    restClientMock = {},
    solrClientMock = {};

var solrSmartClient = proxyquire('../lib/index.js', {
    'node-rest-client': restClientMock,
    'node-zookeeper-client': zkClientMock,
    'solr-client': solrClientMock
});

function mockZkClient(mock) {
    mock.client = {
        connect: sinon.spy(),
        once: sinon.stub().callsArg(1),
        children: ['some_solr_node1:1234_some_path', 'some_solr_node2:1234_some_path'],
        getChildren: sinon.stub(),
        close: sinon.spy()
    };
    mock.createClient = sinon.stub().returns(mock.client);
    mock.client.getChildren.withArgs('/some_live_nodes', null, sinon.match.func).yields(null, mock.client.children);
    mock.client.getChildren.withArgs('/no_live_nodes', null, sinon.match.func).yields(null, []);
    mock.client.getChildren.withArgs('/bogus_live_nodes', null, sinon.match.func).yields('some_error', null);
}

function mockRestClient(mock) {
    var data = {
        response: {
            arr: [
                {
                    str: ['collection1', 'collection2', 'collection3']
                }
            ]
        }
    };
    mock.Client = function () {
        var self = this;
        self.get = sinon.stub().yields(data);
    };
}

function mockSolrClient(mock) {
    mock.createClient = function (host, port, core, path) {
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

describe('solrSmartClient', function () {

    var options;

    before(function () {
        mockRestClient(restClientMock);
        mockZkClient(zkClientMock);
        mockSolrClient(solrClientMock);
    });

    beforeEach(function () {
        options = {
            zk: {
                connectionString: 'some_zookeeper_host:0000',
                liveNodes: '/some_live_nodes'
            },
            solr: {
                protocol: 'http',
                collectionsGetEndPoint: '/admin/collections?action=LIST'
            },
            rest: {
                requestConfig: {
                    timeout: 10000
                }
            },
            ssh: {}
        };
    });

    describe('#createClient', function () {
        it('should throw error with bogus ZooKeeper live nodes path', function (done) {
            options.zk.liveNodes = '/bogus_live_nodes';
            solrSmartClient.createClient('collection2', options, function (err, result) {
                should.exist(err);
                should.not.exist(result);
                done();
            });
        });

        it('should throw error when no live nodes are found', function (done) {
            options.zk.liveNodes = '/no_live_nodes';
            solrSmartClient.createClient('collection2', options, function (err, result) {
                should.exist(err);
                should.not.exist(result);
                done();
            });
        });

        it('should throw error when no live nodes matching the named collection are found', function (done) {
            solrSmartClient.createClient('no_collection', options, function (err, result) {
                should.exist(err);
                should.not.exist(result);
                done();
            });
        });

        it('should create instance of node-solr-client', function (done) {
            solrSmartClient.createClient('collection2', options, function (err, result) {
                should.not.exist(err);
                should.exist(result);
                var solrClient = result;
                solrClient.options.host.should.startWith('some_solr_node');
                solrClient.options.port.should.eql('1234');
                solrClient.options.path.should.eql('/some/path/collection2');
                done();
            });
        });

        it('should tunnel requests to Solr servers', function (done) {
            options.ssh = {
                tunnels: {
                    'some_solr_node1:1234': 'localhost:4321',
                    'some_solr_node2:1234': 'localhost:4321'
                }
            };
            solrSmartClient.createClient('collection2', options, function (err, result) {
                var solrClient = result;
                solrClient.options.host.should.startWith('localhost');
                solrClient.options.port.should.eql('4321');
            });
            done();
        });

        it('should parse tunnel configs fed as string and tunnel requests to Solr servers', function (done) {
            options.ssh = {
                tunnels: '4321:some_solr_node1:1234,4321:some_solr_node2:1234'
            };

            solrSmartClient.createClient('collection2', options, function (err, result) {
                var solrClient = result;
                solrClient.options.host.should.startWith('localhost');
                solrClient.options.port.should.eql('4321');
            });
            done();
        });
    });
});
